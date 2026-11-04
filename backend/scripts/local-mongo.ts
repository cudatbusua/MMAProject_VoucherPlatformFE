import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';

async function main() {
  const directory = resolve(__dirname, '../.data/mongo');
  await mkdir(directory, { recursive: true });
  const mongo = await MongoMemoryReplSet.create({
    binary: { version: '8.0.15', downloadDir: resolve(__dirname, '../.cache/mongodb') },
    instanceOpts: [{ port: 27018, dbPath: directory }],
    replSet: {
      name: 'rs0',
      count: 1,
      storageEngine: 'wiredTiger',
      dbName: 'voucher_platform',
      ip: '127.0.0.1',
    },
  });
  console.log('MongoDB local ready: 127.0.0.1:27018, replica set rs0');
  console.log('Persistent storage: ' + directory);
  console.log('Keep this terminal running. Ctrl+C stops MongoDB without deleting data.');
  const stop = async () => {
    await mongo.stop({ doCleanup: false, force: false });
    process.exit(0);
  };
  process.on('message', (message) => {
    if (message === 'stop') void stop();
  });
  if (process.send) process.send({ ready: true });
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}
void main().catch((error) => {
  console.error('Could not start local MongoDB:', error.message);
  process.exitCode = 1;
});
