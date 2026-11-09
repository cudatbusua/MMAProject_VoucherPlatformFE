import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController, ProfileController } from './auth/auth.controller';
import { AdminUsersController } from './auth/admin-users.controller';
import { AuthService } from './auth/auth.service';
import { MailService } from './auth/mail.service';
import { AccessGuard, Public } from './auth/security';
import { BrandController, CampaignController, SearchController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { DocumentsService } from './catalog/documents.service';
import { validateEnvironment } from './config';
import { Database, DatabaseModule } from './database/database.module';
import {
  OrdersController,
  RedeemController,
  RefundController,
  ReportsController,
  WalletController,
} from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { WalletService } from './orders/wallet.service';

@Controller('health')
class HealthController {
  constructor(private readonly db: Database) {}
  @Public() @Get() async health() {
    await this.db.connection.db!.admin().ping();
    return { status: 'ok', database: 'MongoDB', paymentMode: 'DEMO' };
  }
}
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        serverSelectionTimeoutMS: 10000,
        retryAttempts: 1,
      }),
    }),
    DatabaseModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: '15m', issuer: 'voucher-mongo-api', audience: 'voucher-clients' },
        verifyOptions: { issuer: 'voucher-mongo-api', audience: 'voucher-clients', algorithms: ['HS256'] },
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]),
  ],
  controllers: [
    HealthController,
    AuthController,
    AdminUsersController,
    ProfileController,
    BrandController,
    CampaignController,
    SearchController,
    OrdersController,
    WalletController,
    RedeemController,
    RefundController,
    ReportsController,
  ],
  providers: [
    AuthService,
    MailService,
    CatalogService,
    DocumentsService,
    OrdersService,
    WalletService,
    ThrottlerGuard,
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class AppModule {}
