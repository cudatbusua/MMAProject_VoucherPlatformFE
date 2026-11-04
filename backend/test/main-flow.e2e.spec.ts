import 'reflect-metadata';
import { before as beforeAll, after as afterAll, describe, it } from 'node:test';
import { expect } from 'expect';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { Types } from 'mongoose';
import { Database } from '../src/database/database.module';
import { seedData } from '../src/database/seed-data';
import { CampaignStatus, Role, VoucherType } from '../src/database/schemas';
import { MailService } from '../src/auth/mail.service';
import { OrdersService } from '../src/orders/orders.service';
import { configureApp } from '../src/bootstrap';

describe('Voucher API with real MongoDB replica-set transactions', () => {
  let mongo: MongoMemoryReplSet;
  let app: INestApplication;
  let db: Database;
  let seed: Awaited<ReturnType<typeof seedData>>;
  const codes = new Map<string, string>();
  let admin: string, owner: string, staff: string, customer: string, customerId: string;
  let counter = 0;
  const call = (method: 'get' | 'post' | 'patch', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method]('/api' + path);
    return token ? req.set('Authorization', 'Bearer ' + token) : req;
  };
  const newCustomer = async () => {
    const email = 'test' + ++counter + '@example.com';
    await call('post', '/auth/otp/request').send({ email }).expect(201);
    const response = await call('post', '/auth/otp/verify')
      .send({ email, code: codes.get(email) })
      .expect(201);
    return response.body.data as { accessToken: string; refreshToken: string; user: { id: string } };
  };
  const checkout = (
    token: string,
    campaignId = String(seed.campaigns[0]._id),
    quantity = 1,
    key = randomUUID(),
  ) => call('post', '/orders', token).send({ campaignId, quantity, idempotencyKey: key });
  const paidVoucher = async (token: string) => {
    const created = await checkout(token).expect(201);
    const orderId = created.body.data.id;
    await call('post', '/orders/' + orderId + '/simulate-payment', token)
      .send({ success: true })
      .expect(201);
    const wallet = await call('get', '/wallet', token).expect(200);
    return { orderId, voucher: wallet.body.data.find((v: { orderId: string }) => v.orderId === orderId) };
  };
  const campaignBody = (overrides: Record<string, unknown> = {}) => ({
    title: 'Chiến dịch kiểm thử ' + ++counter,
    voucherType: VoucherType.PREPAID,
    salePrice: 30000,
    faceValue: 50000,
    totalQuantity: 20,
    limitPerUser: 5,
    saleStartAt: new Date(Date.now() - 1000).toISOString(),
    saleEndAt: new Date(Date.now() + 86400000).toISOString(),
    voucherExpireAt: new Date(Date.now() + 12 * 86400000).toISOString(),
    storeIds: [String(seed.store._id)],
    ...overrides,
  });

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      binary: { version: '8.0.15', downloadDir: resolve(__dirname, '../.cache/mongodb') },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    Object.assign(process.env, {
      NODE_ENV: 'test',
      MONGODB_URI: mongo.getUri('voucher_test'),
      JWT_SECRET: 'test-jwt-secret-'.repeat(4),
      OTP_SECRET: 'test-otp-secret-'.repeat(4),
      MAIL_PROVIDER: 'local',
      PAYMENT_MODE: 'demo',
      DEMO_PAYMENT_ENABLED: 'true',
    });
    // Import after setting env, because ConfigModule.forRoot reads environment at definition time.
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendOtp: async (email: string, code: string) => {
          codes.set(email, code);
        },
      })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(Database);
    seed = await seedData(db, 'Voucher@123');
    const login = async (email: string) =>
      (await call('post', '/auth/login').send({ email, password: 'Voucher@123' }).expect(201)).body.data
        .accessToken as string;
    admin = await login('admin@voucher.local');
    owner = await login('owner@voucher.local');
    staff = await login('staff@voucher.local');
    const user = await newCustomer();
    customer = user.accessToken;
    customerId = user.user.id;
    await call('post', '/auth/select-store', staff)
      .send({ storeId: String(seed.store._id) })
      .expect(201);
  });
  afterAll(async () => {
    if (app) await app.close();
    if (mongo) await mongo.stop();
  });

  it('health and Swagger are available; envelope matches the established contract', async () => {
    const res = await call('get', '/health').expect(200);
    expect(res.body).toEqual({
      data: { status: 'ok', database: 'MongoDB', paymentMode: 'DEMO' },
      error: null,
      meta: null,
    });
    await request(app.getHttpServer()).get('/docs-json').expect(200);
  });
  it('keeps credentials out of JSON, validates body and rejects role escalation', async () => {
    const res = await call('post', '/auth/login')
      .send({ email: 'admin@voucher.local', password: 'Voucher@123' })
      .expect(201);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user._id).toBeUndefined();
    await call('post', '/auth/login')
      .send({ email: 'admin@voucher.local', password: 'wrongpass' })
      .expect(401);
    await call('post', '/auth/otp/verify')
      .send({ email: 'x@example.com', code: '123456', role: 'ADMIN' })
      .expect(400);
    await call('post', '/auth/otp/request').send({ email: 'admin@voucher.local' }).expect(400);
    await call('get', '/admin/orders', customer).expect(403);
    await call('get', '/wallet').expect(401);
    await call('get', '/wallet/not-an-id', customer).expect(400);
  });
  it('enforces OTP cooldown, five failed attempts, expiry and one-time consumption', async () => {
    const email = 'otp-security@example.com';
    await call('post', '/auth/otp/request').send({ email }).expect(201);
    await call('post', '/auth/otp/request').send({ email }).expect(400);
    const code = codes.get(email)!;
    for (let i = 0; i < 5; i++)
      await call('post', '/auth/otp/verify').send({ email, code: '000000' }).expect(401);
    await call('post', '/auth/otp/verify').send({ email, code }).expect(401);
    expect((await db.otps.findOne({ email }))!.attempts).toBe(5);
    const another = 'otp-expired@example.com';
    await call('post', '/auth/otp/request').send({ email: another }).expect(201);
    await db.otps.updateOne({ email: another }, { $set: { expiresAt: new Date(0) } });
    await call('post', '/auth/otp/verify')
      .send({ email: another, code: codes.get(another) })
      .expect(401);
    const one = await newCustomer();
    const usedEmail = 'test' + counter + '@example.com';
    await call('post', '/auth/otp/verify')
      .send({ email: usedEmail, code: codes.get(usedEmail) })
      .expect(401);
    expect(one.accessToken).toBeTruthy();
  });
  it('rotates refresh tokens and revokes access immediately on logout', async () => {
    const user = await newCustomer();
    const refreshed = await call('post', '/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(201);
    await call('post', '/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    await call('post', '/auth/logout', refreshed.body.data.accessToken).send({}).expect(201);
    await call('get', '/users/me', user.accessToken).expect(401);
    await call('post', '/auth/refresh').send({ refreshToken: refreshed.body.data.refreshToken }).expect(401);
  });
  it('creates brand-owner accounts only through the admin role', async () => {
    const payload = { email: 'newowner@example.com', fullName: 'Owner Two', password: 'Voucher@123' };
    await call('post', '/admin/users/brand-owners', customer).send(payload).expect(403);
    const response = await call('post', '/admin/users/brand-owners', admin).send(payload).expect(201);
    expect(response.body.data.role).toBe('BRAND_OWNER');
    expect(response.body.data.passwordHash).toBeUndefined();
  });
  it('brand approval gates submitting a campaign and protects other owners', async () => {
    const other = await call('post', '/auth/login')
      .send({ email: 'newowner@example.com', password: 'Voucher@123' })
      .expect(201);
    const otherToken = other.body.data.accessToken;
    const brand = await call('post', '/brands', otherToken).send({ name: 'Other brand' }).expect(201);
    const id = brand.body.data.id;
    await call('post', '/brands/' + id + '/stores', owner)
      .send({ name: 'Foreign', address: 'Address foreign', latitude: 10.7, longitude: 106.7 })
      .expect(403);
    const store = await call('post', '/brands/' + id + '/stores', otherToken)
      .send({ name: 'Other store', address: 'Address other store', latitude: 10.7, longitude: 106.7 })
      .expect(201);
    const c = await call('post', '/campaigns/brand/' + id, otherToken)
      .send(campaignBody({ storeIds: [store.body.data.id] }))
      .expect(201);
    await call('patch', '/campaigns/' + c.body.data.id + '/submit', otherToken)
      .send({})
      .expect(400);
    await call('patch', '/brands/' + id + '/approve', admin)
      .send({})
      .expect(200);
    await call('patch', '/campaigns/' + c.body.data.id + '/submit', otherToken)
      .send({})
      .expect(200);
  });
  for (const voucherType of ['DISCOUNT', 'PREPAID', 'COMBO'])
    it('rejects equal and higher prices for ' + voucherType, async () => {
      for (const salePrice of [50000, 60000])
        await call('post', '/campaigns/brand/' + seed.brand._id, owner)
          .send(
            campaignBody({
              voucherType,
              salePrice,
              comboItems: 'Two drinks',
              discountType: 'AMOUNT',
              discountValue: 10000,
            }),
          )
          .expect(400);
    });
  it('enforces expiry window, valid stores and merged prices when editing', async () => {
    await call('post', '/campaigns/brand/' + seed.brand._id, owner)
      .send(campaignBody({ voucherExpireAt: new Date(Date.now() + 2 * 86400000).toISOString() }))
      .expect(400);
    await call('post', '/campaigns/brand/' + seed.brand._id, owner)
      .send(campaignBody({ storeIds: [String(new Types.ObjectId())] }))
      .expect(400);
    const c = await call('post', '/campaigns/brand/' + seed.brand._id, owner)
      .send(campaignBody())
      .expect(201);
    await call('patch', '/campaigns/' + c.body.data.id, owner)
      .send({ faceValue: 30000 })
      .expect(400);
    await call('patch', '/campaigns/' + c.body.data.id, owner)
      .send({ storeIds: null })
      .expect(400);
  });
  it('publishes approved campaigns to public catalog, pauses and requires reapproval after edits', async () => {
    const c = await call('post', '/campaigns/brand/' + seed.brand._id, owner)
      .send(campaignBody())
      .expect(201);
    const id = c.body.data.id;
    await call('get', '/vouchers/' + id).expect(404);
    await call('patch', '/campaigns/' + id + '/submit', owner)
      .send({})
      .expect(200);
    await call('patch', '/campaigns/' + id + '/approve', owner)
      .send({})
      .expect(403);
    await call('patch', '/campaigns/' + id + '/approve', admin)
      .send({})
      .expect(200);
    await call('get', '/vouchers/' + id).expect(200);
    await call('patch', '/campaigns/' + id + '/pause', owner)
      .send({})
      .expect(200);
    await call('get', '/vouchers/' + id).expect(404);
    await call('patch', '/campaigns/' + id + '/resume', owner)
      .send({})
      .expect(200);
    const updated = await call('patch', '/campaigns/' + id, owner)
      .send({ title: 'Edited requires approval' })
      .expect(200);
    expect(updated.body.data.status).toBe('PENDING');
    await call('get', '/vouchers/' + id).expect(404);
  });
  it('filters by real stored coordinates, rejects incomplete location and escapes regex', async () => {
    const nearby = await call('get', '/vouchers?latitude=10.776&longitude=106.7&radiusKm=3').expect(200);
    expect(nearby.body.data.total).toBeGreaterThanOrEqual(7);
    expect(nearby.body.data.items[0].distanceKm).toBeLessThan(3);
    const far = await call('get', '/vouchers?latitude=37.42&longitude=-122.084&radiusKm=10').expect(200);
    expect(far.body.data.total).toBe(0);
    await call('get', '/vouchers?radiusKm=5').expect(400);
    const regex = await call('get', '/vouchers?q=%5B').expect(200);
    expect(regex.body.data.total).toBe(0);
  });
  it('keeps pending orders out of wallet, fulfills once under concurrent payment confirmations', async () => {
    const user = await newCustomer();
    const created = await checkout(user.accessToken, undefined, 2).expect(201);
    const id = created.body.data.id;
    expect(created.body.data.status).toBe('PENDING');
    expect((await call('get', '/wallet', user.accessToken)).body.data).toHaveLength(0);
    const results = await Promise.all(
      [1, 2].map(() =>
        call('post', '/orders/' + id + '/simulate-payment', user.accessToken).send({ success: true }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await db.payments.countDocuments({ orderId: id })).toBe(1);
    expect(await db.vouchers.countDocuments({ orderId: id })).toBe(2);
    expect((await db.orders.findById(id))!.status).toBe('FULFILLED');
    await call('get', '/orders/' + id, customer).expect(404);
  });
  it('deduplicates retried checkout and rejects reusing a key for different quantities', async () => {
    const user = await newCustomer();
    const key = randomUUID();
    const results = await Promise.all([1, 2].map(() => checkout(user.accessToken, undefined, 1, key)));
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.data.id).toBe(results[1].body.data.id);
    await checkout(user.accessToken, undefined, 2, key).expect(400);
    expect(await db.orders.countDocuments({ customerId: user.user.id })).toBe(1);
  });
  it('prevents overselling the final voucher under concurrent buyers', async () => {
    const c = await db.campaigns.create({
      ...campaignBody({ totalQuantity: 1 }),
      brandId: seed.brand._id,
      status: CampaignStatus.PUBLISHED,
    });
    const users = [await newCustomer(), await newCustomer()];
    const results = await Promise.all(users.map((u) => checkout(u.accessToken, String(c._id))));
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const stock = await db.campaigns.findById(c._id);
    expect(stock!.reservedQuantity).toBe(1);
    expect(stock!.soldQuantity).toBe(0);
  });
  it('enforces per-user quota for simultaneous checkouts and rolls back rejected reservations', async () => {
    const user = await newCustomer();
    const c = await db.campaigns.create({
      ...campaignBody({ totalQuantity: 20, limitPerUser: 2 }),
      brandId: seed.brand._id,
      status: CampaignStatus.PUBLISHED,
    });
    const results = await Promise.all([1, 2, 3, 4].map(() => checkout(user.accessToken, String(c._id))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);
    expect((await db.campaigns.findById(c._id))!.reservedQuantity).toBe(2);
  });
  it('cancels expired orders and returns stock exactly once; expired payment cannot issue vouchers', async () => {
    const user = await newCustomer();
    const order = await checkout(user.accessToken).expect(201);
    const id = order.body.data.id;
    await db.orders.updateOne({ _id: id }, { $set: { expiresAt: new Date(0) } });
    await call('post', '/orders/' + id + '/simulate-payment', user.accessToken)
      .send({})
      .expect(400);
    expect((await db.orders.findById(id))!.status).toBe('CANCELLED');
    const stock = (await db.campaigns.findById(seed.campaigns[0]._id))!.reservedQuantity;
    await call('post', '/orders/' + id + '/cancel', user.accessToken)
      .send({})
      .expect(201);
    expect((await db.campaigns.findById(seed.campaigns[0]._id))!.reservedQuantity).toBe(stock);
    expect(await db.vouchers.countDocuments({ orderId: id })).toBe(0);
  });
  it('scheduled maintenance expires unpaid orders without deleting history', async () => {
    const user = await newCustomer();
    const order = await checkout(user.accessToken).expect(201);
    await db.orders.updateOne({ _id: order.body.data.id }, { $set: { expiresAt: new Date(0) } });
    await app.get(OrdersService).maintenance();
    expect((await db.orders.findById(order.body.data.id))!.status).toBe('CANCELLED');
  });
  it('requires selected store, invalidates older QR and records one successful redemption', async () => {
    const user = await newCustomer();
    const { voucher } = await paidVoucher(user.accessToken);
    const first = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: voucher.id })
      .expect(201);
    const second = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: voucher.id })
      .expect(201);
    const payload = {
      storeId: String(seed.store._id),
      qrPayload: second.body.data.qrPayload,
      billAmount: 80000,
    };
    await call('post', '/redeem', admin).send(payload).expect(403);
    await call('post', '/redeem', staff)
      .send({ ...payload, storeId: String(seed.secondStore._id) })
      .expect(403);
    await call('post', '/redeem', staff)
      .send({ ...payload, qrPayload: first.body.data.qrPayload })
      .expect(400);
    const results = await Promise.all([1, 2].map(() => call('post', '/redeem', staff).send(payload)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await db.redemptions.countDocuments({ voucherId: voucher.id })).toBe(1);
    expect((await db.vouchers.findById(voucher.id))!.status).toBe('USED');
    expect(results.find((r) => r.status === 201)!.body.data.amountDue).toBe(30000);
    await call('post', '/refunds', user.accessToken)
      .send({ voucherItemId: voucher.id, reason: 'Cannot refund used voucher' })
      .expect(400);
  });
  it('supports redeem OTP, rejects expired codes and protects another customer wallet', async () => {
    const user = await newCustomer();
    const { voucher } = await paidVoucher(user.accessToken);
    await call('get', '/wallet/' + voucher.id, customer).expect(404);
    const code = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: voucher.id })
      .expect(201);
    await db.tokens.updateOne({ voucherId: voucher.id }, { $set: { expiresAt: new Date(0) } });
    await call('post', '/redeem', staff)
      .send({ storeId: String(seed.store._id), otpCode: code.body.data.otpCode, billAmount: 100000 })
      .expect(400);
    const fresh = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: voucher.id })
      .expect(201);
    await call('post', '/redeem', staff)
      .send({ storeId: String(seed.store._id), otpCode: fresh.body.data.otpCode, billAmount: 100000 })
      .expect(201);
  });
  it('locks refund-pending vouchers; manual refund completes once and restores stock', async () => {
    const user = await newCustomer();
    const { voucher } = await paidVoucher(user.accessToken);
    const before = (await db.campaigns.findById(voucher.campaignId))!.soldQuantity;
    const refund = await call('post', '/refunds', user.accessToken)
      .send({ voucherItemId: voucher.id, reason: 'Không còn nhu cầu sử dụng' })
      .expect(201);
    await call('post', '/redeem/token', user.accessToken).send({ voucherItemId: voucher.id }).expect(400);
    const id = refund.body.data.id;
    await call('patch', '/refunds/' + id + '/confirm-manual', admin)
      .send({ reference: 'DEMO-REFUND-001' })
      .expect(200);
    await call('patch', '/refunds/' + id + '/confirm-manual', admin)
      .send({ reference: 'DEMO-REFUND-001' })
      .expect(400);
    expect((await db.vouchers.findById(voucher.id))!.status).toBe('REFUNDED');
    expect((await db.campaigns.findById(voucher.campaignId))!.soldQuantity).toBe(before - 1);
  });
  it('rejected refund restores the unused voucher', async () => {
    const user = await newCustomer();
    const { voucher } = await paidVoucher(user.accessToken);
    const refund = await call('post', '/refunds', user.accessToken)
      .send({ voucherItemId: voucher.id, reason: 'Yêu cầu hoàn' })
      .expect(201);
    await call('patch', '/refunds/' + refund.body.data.id + '/reject', admin)
      .send({ reason: 'Không chấp nhận' })
      .expect(200);
    expect((await db.vouchers.findById(voucher.id))!.status).toBe('ACTIVE');
  });
  it('admin can see redemption results and gross/net revenue', async () => {
    const history = await call('get', '/admin/redemptions', admin).expect(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(2);
    const report = await call('get', '/admin/reports/overview', admin).expect(200);
    expect(report.body.data.grossRevenue).toBeGreaterThan(0);
    expect(report.body.data.netRevenue).toBe(report.body.data.grossRevenue - report.body.data.refundedAmount);
  });
});
