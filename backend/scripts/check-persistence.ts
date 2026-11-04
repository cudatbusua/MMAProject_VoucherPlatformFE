import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import assert from 'node:assert/strict';

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'voucher-mongo-persistence-'));
  let mongo: MongoMemoryReplSet | undefined;
  let connection: mongoose.Connection | undefined;
  try {
    const binary = { version: '8.0.15', downloadDir: resolve(__dirname, '../.cache/mongodb') };
    mongo = await MongoMemoryReplSet.create({
      binary,
      instanceOpts: [{ dbPath: dir }],
      replSet: { name: 'persistence_test', count: 1, storageEngine: 'wiredTiger' },
    });
    const uri = mongo.getUri('persistence_test');
    const port = Number(new URL(uri).port);
    connection = await mongoose.createConnection(uri).asPromise();
    await connection.db!.collection('markers').insertOne({ value: 'survives-restart' });
    await connection.close();
    connection = undefined;
    await mongo.stop({ doCleanup: false });
    mongo = undefined;
    mongo = await MongoMemoryReplSet.create({
      binary,
      instanceOpts: [{ dbPath: dir, port }],
      replSet: { name: 'persistence_test', count: 1, storageEngine: 'wiredTiger' },
    });
    connection = await mongoose.createConnection(mongo.getUri('persistence_test')).asPromise();
    assert.equal(await connection.db!.collection('markers').countDocuments({ value: 'survives-restart' }), 1);
    console.log(
      'PASS: MongoDB retains documents after a full database stop/start using the same disk directory.',
    );
  } finally {
    if (connection) await connection.close();
    if (mongo) await mongo.stop({ doCleanup: false });
    // Only remove the exact temporary directory that this script created.
    const expectedRoot = resolve(tmpdir());
    if (
      resolve(dir).startsWith(expectedRoot + require('path').sep) &&
      dir.includes('voucher-mongo-persistence-')
    )
      await rm(dir, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
