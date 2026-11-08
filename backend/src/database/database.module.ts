import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as S from './schemas';

@Injectable()
export class Database implements OnModuleInit {
  constructor(@InjectConnection() readonly connection: Connection) {}
  readonly users = this.connection.model<S.User>('User');
  readonly sessions = this.connection.model<S.Session>('Session');
  readonly otps = this.connection.model<S.Otp>('Otp');
  readonly brands = this.connection.model<S.Brand>('Brand');
  readonly stores = this.connection.model<S.Store>('Store');
  readonly campaigns = this.connection.model<S.Campaign>('Campaign');
  readonly quotas = this.connection.model<S.Quota>('Quota');
  readonly orders = this.connection.model<S.Order>('Order');
  readonly payments = this.connection.model<S.Payment>('Payment');
  readonly vouchers = this.connection.model<S.Voucher>('Voucher');
  readonly tokens = this.connection.model<S.RedeemToken>('RedeemToken');
  readonly redemptions = this.connection.model<S.Redemption>('Redemption');
  readonly refunds = this.connection.model<S.Refund>('Refund');
  readonly audits = this.connection.model<S.Audit>('Audit');

  async onModuleInit() {
    const hello = await this.connection.db!.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid')
      throw new Error('MongoDB must be a replica set. Run npm run db:local or use MongoDB Atlas.');
    // Idempotent backfill preserves older individually-issued vouchers as single-use.
    await this.vouchers.collection.updateMany({ usageLimit: { $exists: false } }, [
      {
        $set: {
          formatVersion: 1,
          usageLimit: 1,
          usedCount: { $cond: [{ $eq: ['$status', 'USED'] }, 1, 0] },
          remainingUses: { $cond: [{ $in: ['$status', ['ACTIVE', 'REFUND_PENDING']] }, 1, 0] },
          totalPrice: '$salePrice',
        },
      },
    ]);
    await this.redemptions.collection.updateMany(
      { sequence: { $exists: false } },
      { $set: { sequence: 1, remainingAfter: 0 } },
    );
    const indexes = await this.redemptions.collection
      .listIndexes()
      .toArray()
      .catch((error: { code?: number }) => {
        if (error.code === 26) return [];
        throw error;
      });
    for (const index of indexes) {
      if (index.unique && Object.keys(index.key).length === 1 && index.key.voucherId === 1)
        await this.redemptions.collection.dropIndex(index.name!);
    }
    // Transactions never race initial collection/index creation.
    for (const model of Object.values(this.connection.models)) await model.init();
  }
}

@Global()
@Module({
  imports: [MongooseModule.forFeature(S.modelDefinitions)],
  providers: [Database],
  exports: [Database],
})
export class DatabaseModule {}
