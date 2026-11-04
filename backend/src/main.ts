import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function main() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = app.get(ConfigService).get<number>('PORT', 4100);
  await app.listen(port, '0.0.0.0');
  console.log('API: http://127.0.0.1:' + port + '/api | Swagger: http://127.0.0.1:' + port + '/docs');
}
void main().catch(() => {
  console.error('Backend startup failed. Check MongoDB and environment configuration.');
  process.exitCode = 1;
});
