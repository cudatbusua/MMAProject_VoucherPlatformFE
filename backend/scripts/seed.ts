import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { Database } from '../src/database/database.module';
import { seedData } from '../src/database/seed-data';
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const config = app.get(ConfigService);
    if (config.get('NODE_ENV') === 'production') throw new Error('Demo seed is disabled in production.');
    const password = config.get<string>('SEED_PASSWORD');
    if (!password || password.length < 8)
      throw new Error('Set SEED_PASSWORD (minimum 8 characters) in .env first.');
    const data = await seedData(app.get(Database), password);
    console.log(
      'Seed ready: admin@voucher.local, owner@voucher.local, manager@voucher.local, staff@voucher.local (NV-STAFF1), staff2@voucher.local (NV-STAFF2), customer@voucher.local (OTP login only; code printed in the API console). Password for the others: SEED_PASSWORD from .env.',
    );
    console.log('Brand ID: ' + data.brand._id + ' | Store ID: ' + data.store._id);
    console.log(
      '7 sample campaigns (3 with employee discount). Brand "Trà Sữa Mây" is DRAFT for the license-review demo. Existing documents were not overwritten.',
    );
  } finally {
    await app.close();
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
