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
  let admin: string, manager: string, owner: string, staff: string, customer: string, customerId: string;
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
  const loginAs = async (email: string) =>
    (await call('post', '/auth/login').send({ email, password: 'Voucher@123' }).expect(201)).body.data
      .accessToken as string;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n', 'latin1');
  const uploadDoc = (
    token: string,
    brandId: string,
    type: 'BUSINESS_LICENSE' | 'FOOD_SAFETY',
    o: { expiresAt?: string | null; file?: Buffer | null; issuedAt?: string } = {},
  ) => {
    const req = call('post', '/brands/' + brandId + '/documents', token)
      .field('type', type)
      .field('number', type === 'FOOD_SAFETY' ? 'ATTP-001' : 'GPKD-001')
      .field('issuer', 'Sở kiểm thử')
      .field('issuedAt', o.issuedAt ?? new Date(Date.now() - 30 * 86400000).toISOString());
    const expiresAt =
      o.expiresAt === undefined ? new Date(Date.now() + 365 * 86400000).toISOString() : o.expiresAt;
    if (expiresAt) req.field('expiresAt', expiresAt);
    if (o.file !== null)
      req.attach('file', o.file ?? pdf, { filename: type + '.pdf', contentType: 'application/pdf' });
    return req;
  };
  let otherBrandCampaignId = '';
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
    manager = await login('manager@voucher.local');
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
  it('removes the legacy one-redemption-per-voucher unique index before accepting multi-use scans', async () => {
    await db.redemptions.collection.createIndex({ voucherId: 1 }, { unique: true });
    await db.onModuleInit();
    const indexes = await db.redemptions.collection.listIndexes().toArray();
    expect(indexes.some((i) => i.unique && Object.keys(i.key).length === 1 && i.key.voucherId === 1)).toBe(
      false,
    );
    expect(indexes.some((i) => i.unique && i.key.voucherId === 1 && i.key.sequence === 1)).toBe(true);
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
    await call('post', '/auth/otp/request').send({ email: 'admin@voucher.local' }).expect(201);
    const otpAdmin = await call('post', '/auth/otp/verify')
      .send({ email: 'admin@voucher.local', code: codes.get('admin@voucher.local') })
      .expect(201);
    expect(otpAdmin.body.data.user.role).toBe('ADMIN');
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
  it('brand approval gates manager submission and blocks cross-brand access', async () => {
    const otherOwner = await db.users.findOne({ email: 'newowner@example.com' });
    const brand = await call('post', '/brands', admin)
      .send({ name: 'Other brand', ownerId: String(otherOwner!._id) })
      .expect(201);
    const id = brand.body.data.id;
    await call('post', '/admin/users', admin)
      .send({
        email: 'manager2@example.com',
        fullName: 'Other Manager',
        password: 'Voucher@123',
        role: 'BRAND_MANAGER',
        brandIds: [id],
      })
      .expect(201);
    const login = await call('post', '/auth/login')
      .send({ email: 'manager2@example.com', password: 'Voucher@123' })
      .expect(201);
    const otherToken = login.body.data.accessToken;
    await call('post', '/brands/' + id + '/stores', manager)
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
    // DRAFT brands cannot be approved until the owner submits both licenses.
    await call('patch', '/brands/' + id + '/approve', admin)
      .send({})
      .expect(400);
    const owner2 = await loginAs('newowner@example.com');
    await uploadDoc(owner2, id, 'BUSINESS_LICENSE').expect(201);
    await uploadDoc(owner2, id, 'FOOD_SAFETY').expect(201);
    await call('patch', '/brands/' + id + '/submit', owner2)
      .send({})
      .expect(200);
    otherBrandCampaignId = c.body.data.id;
    await call('patch', '/brands/' + id + '/approve', admin)
      .send({})
      .expect(200);
    await call('patch', '/campaigns/' + c.body.data.id + '/submit', otherToken)
      .send({})
      .expect(200);
    await call('get', '/brands/' + id + '/reports/overview', owner).expect(403);
    await call('get', '/brands/' + id + '/reports/overview', manager).expect(403);
  });
  for (const voucherType of ['DISCOUNT', 'PREPAID', 'COMBO'])
    it('rejects equal and higher prices for ' + voucherType, async () => {
      for (const salePrice of [50000, 60000])
        await call('post', '/campaigns/brand/' + seed.brand._id, manager)
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
    await call('post', '/campaigns/brand/' + seed.brand._id, manager)
      .send(campaignBody({ voucherExpireAt: new Date(Date.now() + 2 * 86400000).toISOString() }))
      .expect(400);
    await call('post', '/campaigns/brand/' + seed.brand._id, manager)
      .send(campaignBody({ storeIds: [String(new Types.ObjectId())] }))
      .expect(400);
    const c = await call('post', '/campaigns/brand/' + seed.brand._id, manager)
      .send(campaignBody())
      .expect(201);
    await call('patch', '/campaigns/' + c.body.data.id, manager)
      .send({ faceValue: 30000 })
      .expect(400);
    await call('patch', '/campaigns/' + c.body.data.id, manager)
      .send({ storeIds: null })
      .expect(400);
  });
  it('publishes approved campaigns to public catalog, pauses and requires reapproval after edits', async () => {
    const c = await call('post', '/campaigns/brand/' + seed.brand._id, manager)
      .send(campaignBody())
      .expect(201);
    const id = c.body.data.id;
    await call('get', '/vouchers/' + id).expect(404);
    await call('patch', '/campaigns/' + id + '/submit', manager)
      .send({})
      .expect(200);
    await call('patch', '/campaigns/' + id + '/approve', manager)
      .send({})
      .expect(403);
    await call('patch', '/campaigns/' + id + '/approve', admin)
      .send({})
      .expect(200);
    await call('get', '/vouchers/' + id).expect(200);
    await call('patch', '/campaigns/' + id + '/pause', manager)
      .send({})
      .expect(200);
    await call('get', '/vouchers/' + id).expect(404);
    await call('patch', '/campaigns/' + id + '/resume', manager)
      .send({})
      .expect(200);
    const updated = await call('patch', '/campaigns/' + id, manager)
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
    expect(await db.vouchers.countDocuments({ orderId: id })).toBe(1);
    const bundle = await db.vouchers.findOne({ orderId: id });
    expect(bundle!.usageLimit).toBe(2);
    expect(bundle!.remainingUses).toBe(2);
    expect(bundle!.totalPrice).toBe(60000);
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
      idempotencyKey: randomUUID(),
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
    const results = await Promise.all(
      [1, 2].map(() => call('post', '/redeem', staff).send({ ...payload, idempotencyKey: randomUUID() })),
    );
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
      .send({
        idempotencyKey: randomUUID(),
        storeId: String(seed.store._id),
        otpCode: code.body.data.otpCode,
        billAmount: 100000,
      })
      .expect(400);
    const fresh = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: voucher.id })
      .expect(201);
    await call('post', '/redeem', staff)
      .send({
        idempotencyKey: randomUUID(),
        storeId: String(seed.store._id),
        otpCode: fresh.body.data.otpCode,
        billAmount: 100000,
      })
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
  it('owner is read-only for brand operations and sees scoped statistics', async () => {
    const id = String(seed.brand._id);
    await call('get', '/brands/me', owner).expect(200);
    const report = await call('get', '/brands/' + id + '/reports/overview', owner).expect(200);
    expect(report.body.data.currency).toBe('VND');
    expect(report.body.data.netRevenue).toBe(report.body.data.grossRevenue - report.body.data.refundedAmount);
    expect(report.body.data.items).toBeUndefined();
    await call('post', '/brands', owner)
      .send({ name: 'Owner cannot create', ownerId: String(seed.owner._id) })
      .expect(403);
    await call('post', '/campaigns/brand/' + id, owner)
      .send(campaignBody())
      .expect(403);
    await call('patch', '/campaigns/' + seed.campaigns[0]._id, owner)
      .send({ title: 'Forbidden' })
      .expect(403);
    await call('post', '/brands/' + id + '/stores', owner)
      .send({ name: 'Forbidden', address: 'Forbidden', latitude: 10, longitude: 106 })
      .expect(403);
    await call('post', '/brands/' + id + '/staff', owner)
      .send({})
      .expect(403);
    await call('get', '/admin/reports/overview', owner).expect(403);
  });
  it('all five roles can buy and receive a private wallet without changing role', async () => {
    const login = await call('post', '/auth/login')
      .send({ email: 'customer@voucher.local', password: 'Voucher@123' })
      .expect(201);
    for (const token of [admin, owner, manager, staff, login.body.data.accessToken]) {
      const order = await checkout(token, String(seed.campaigns[1]._id)).expect(201);
      await call('post', '/orders/' + order.body.data.id + '/simulate-payment', token)
        .send({})
        .expect(201);
      const wallet = await call('get', '/wallet', token).expect(200);
      expect(wallet.body.data.some((v: { orderId: string }) => v.orderId === order.body.data.id)).toBe(true);
    }
    const otp = await call('post', '/auth/otp/request').send({ email: 'staff@voucher.local' }).expect(201);
    const verified = await call('post', '/auth/otp/verify')
      .send({ email: 'staff@voucher.local', code: codes.get('staff@voucher.local') })
      .expect(201);
    expect(verified.body.data.user.role).toBe('STORE_STAFF');
  });
  it('buying five tickets produces one voucher; the same QR allows exactly five confirmed uses', async () => {
    const user = await newCustomer();
    const order = await checkout(user.accessToken, undefined, 5).expect(201);
    const id = order.body.data.id;
    await call('post', '/orders/' + id + '/simulate-payment', user.accessToken)
      .send({})
      .expect(201);
    expect(await db.vouchers.countDocuments({ orderId: id })).toBe(1);
    const voucher = await db.vouchers.findOne({ orderId: id });
    const code = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: String(voucher!._id) })
      .expect(201);
    const payload = {
      storeId: String(seed.store._id),
      qrPayload: code.body.data.qrPayload,
      billAmount: 100000,
    };
    for (let use = 1; use <= 5; use++) {
      const result = await call('post', '/redeem', staff)
        .send({ ...payload, idempotencyKey: randomUUID() })
        .expect(201);
      expect(result.body.data.remainingUses).toBe(5 - use);
      expect(result.body.data.redemption.sequence).toBe(use);
      expect(result.body.data.voucher.status).toBe(use === 5 ? 'USED' : 'ACTIVE');
      if (use === 1)
        await call('post', '/refunds', user.accessToken)
          .send({ voucherItemId: String(voucher!._id), reason: 'Cannot refund partially used bundle' })
          .expect(400);
    }
    await call('post', '/redeem', staff)
      .send({ ...payload, idempotencyKey: randomUUID() })
      .expect(400);
    expect(await db.redemptions.countDocuments({ voucherId: voucher!._id })).toBe(5);
    const detail = await call('get', '/wallet/' + voucher!._id, user.accessToken).expect(200);
    expect(detail.body.data.redemptions).toHaveLength(5);
  });
  it('retrying one redemption key concurrently consumes one use and rejects a changed payload', async () => {
    const user = await newCustomer();
    const order = await checkout(user.accessToken, undefined, 2).expect(201);
    await call('post', '/orders/' + order.body.data.id + '/simulate-payment', user.accessToken)
      .send({})
      .expect(201);
    const voucher = await db.vouchers.findOne({ orderId: order.body.data.id });
    const code = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: String(voucher!._id) })
      .expect(201);
    const payload = {
      idempotencyKey: randomUUID(),
      storeId: String(seed.store._id),
      qrPayload: code.body.data.qrPayload,
      billAmount: 100000,
    };
    const results = await Promise.all([1, 2, 3].map(() => call('post', '/redeem', staff).send(payload)));
    expect(results.map((v) => v.status)).toEqual([201, 201, 201]);
    expect((await db.vouchers.findById(voucher!._id))!.remainingUses).toBe(1);
    expect(await db.redemptions.countDocuments({ voucherId: voucher!._id })).toBe(1);
    await call('post', '/redeem', staff)
      .send({ ...payload, billAmount: 110000 })
      .expect(400);
  });
  it('parallel distinct scans never exceed the purchased usage count', async () => {
    const user = await newCustomer();
    const order = await checkout(user.accessToken, undefined, 5).expect(201);
    await call('post', '/orders/' + order.body.data.id + '/simulate-payment', user.accessToken)
      .send({})
      .expect(201);
    const voucher = await db.vouchers.findOne({ orderId: order.body.data.id });
    const code = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: String(voucher!._id) })
      .expect(201);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        call('post', '/redeem', staff).send({
          idempotencyKey: randomUUID(),
          storeId: String(seed.store._id),
          otpCode: code.body.data.otpCode,
          billAmount: 100000,
        }),
      ),
    );
    expect(results.filter((v) => v.status === 201)).toHaveLength(5);
    expect(results.filter((v) => v.status === 400)).toHaveLength(3);
    expect((await db.vouchers.findById(voucher!._id))!.remainingUses).toBe(0);
    expect(await db.redemptions.countDocuments({ voucherId: voucher!._id })).toBe(5);
  });
  it('staff can buy but cannot redeem their own voucher; another assigned staff can', async () => {
    const order = await checkout(staff, String(seed.campaigns[2]._id)).expect(201);
    await call('post', '/orders/' + order.body.data.id + '/simulate-payment', staff)
      .send({})
      .expect(201);
    const voucher = await db.vouchers.findOne({ orderId: order.body.data.id });
    const code = await call('post', '/redeem/token', staff)
      .send({ voucherItemId: String(voucher!._id) })
      .expect(201);
    const payload = {
      idempotencyKey: randomUUID(),
      storeId: String(seed.store._id),
      qrPayload: code.body.data.qrPayload,
      billAmount: 100000,
    };
    await call('post', '/redeem', staff).send(payload).expect(403);
    await call('post', '/admin/users', admin)
      .send({
        email: 'staff2@example.com',
        fullName: 'Staff Two',
        password: 'Voucher@123',
        role: 'STORE_STAFF',
        storeIds: [String(seed.store._id)],
      })
      .expect(201);
    const login = await call('post', '/auth/login')
      .send({ email: 'staff2@example.com', password: 'Voucher@123' })
      .expect(201);
    const token = login.body.data.accessToken;
    await call('post', '/auth/select-store', token)
      .send({ storeId: String(seed.store._id) })
      .expect(201);
    await call('post', '/redeem', token)
      .send({ ...payload, idempotencyKey: randomUUID() })
      .expect(201);
  });
  it('refunds the full unused bundle amount and all reserved purchase quota', async () => {
    const user = await newCustomer();
    const order = await checkout(user.accessToken, undefined, 5).expect(201);
    await call('post', '/orders/' + order.body.data.id + '/simulate-payment', user.accessToken)
      .send({})
      .expect(201);
    const voucher = await db.vouchers.findOne({ orderId: order.body.data.id });
    const refund = await call('post', '/refunds', user.accessToken)
      .send({ voucherItemId: String(voucher!._id), reason: 'Full unused bundle refund' })
      .expect(201);
    expect(refund.body.data.amount).toBe(150000);
    await call('patch', '/refunds/' + refund.body.data.id + '/confirm-manual', admin)
      .send({ reference: 'BUNDLE-REFUND' })
      .expect(200);
    expect((await db.vouchers.findById(voucher!._id))!.remainingUses).toBe(0);
    expect(
      (await db.quotas.findOne({ userId: user.user.id, campaignId: seed.campaigns[0]._id }))!.purchased,
    ).toBe(0);
    await checkout(user.accessToken, undefined, 5).expect(201);
  });
  it('admin enforces manager/staff assignments, revokes sessions on scope changes and blocks self-demotion', async () => {
    await call('post', '/admin/users', admin)
      .send({
        email: 'invalid-manager@example.com',
        fullName: 'Invalid',
        password: 'Voucher@123',
        role: 'BRAND_MANAGER',
      })
      .expect(400);
    await call('post', '/admin/users', admin)
      .send({
        email: 'invalid-staff@example.com',
        fullName: 'Invalid',
        password: 'Voucher@123',
        role: 'STORE_STAFF',
        storeIds: [String(new Types.ObjectId())],
      })
      .expect(400);
    await call('post', '/admin/users', staff).send({}).expect(403);
    await call('patch', '/admin/users/' + seed.admin._id, admin)
      .send({ role: 'CUSTOMER' })
      .expect(400);
    const created = await call('post', '/admin/users', admin)
      .send({
        email: 'revoke@example.com',
        fullName: 'Revoke',
        password: 'Voucher@123',
        role: 'BRAND_MANAGER',
        brandIds: [String(seed.brand._id)],
      })
      .expect(201);
    const login = await call('post', '/auth/login')
      .send({ email: 'revoke@example.com', password: 'Voucher@123' })
      .expect(201);
    await call('patch', '/admin/users/' + created.body.data.id, admin)
      .send({ active: false })
      .expect(200);
    await call('get', '/brands/me', login.body.data.accessToken).expect(401);
    await call('post', '/auth/otp/request').send({ email: 'revoke@example.com' }).expect(400);
  });
  it('legacy single-use vouchers backfill repeatably without deleting records', async () => {
    const user = await newCustomer();
    const order = await checkout(user.accessToken).expect(201);
    await call('post', '/orders/' + order.body.data.id + '/simulate-payment', user.accessToken)
      .send({})
      .expect(201);
    const voucher = await db.vouchers.findOne({ orderId: order.body.data.id });
    await db.vouchers.collection.updateOne(
      { _id: voucher!._id },
      { $unset: { usageLimit: '', usedCount: '', remainingUses: '', totalPrice: '', formatVersion: '' } },
    );
    await db.onModuleInit();
    await db.onModuleInit();
    const legacy = await db.vouchers.findById(voucher!._id);
    expect(legacy!.formatVersion).toBe(1);
    expect(legacy!.usageLimit).toBe(1);
    expect(legacy!.remainingUses).toBe(1);
    expect(legacy!.totalPrice).toBe(30000);
    const indexes = await db.redemptions.collection.listIndexes().toArray();
    expect(indexes.some((i) => i.unique && Object.keys(i.key).length === 1 && i.key.voucherId === 1)).toBe(
      false,
    );
    const token = await call('post', '/redeem/token', user.accessToken)
      .send({ voucherItemId: String(voucher!._id) })
      .expect(201);
    await call('post', '/redeem', staff)
      .send({
        idempotencyKey: randomUUID(),
        storeId: String(seed.store._id),
        qrPayload: token.body.data.qrPayload,
        billAmount: 100000,
      })
      .expect(201);
    expect((await db.vouchers.findById(voucher!._id))!.status).toBe('USED');
  });

  // ---------- Brand licenses (business license + food safety) ----------
  it('brand licenses: owner-only upload, file sniffing, completeness, review loop and private files', async () => {
    const draft = String(seed.draftBrand._id);
    expect(seed.draftBrand.status).toBe('DRAFT');
    // Managers, customers and other owners cannot upload; only PDF/PNG/JPG accepted.
    await uploadDoc(manager, draft, 'BUSINESS_LICENSE').expect(403);
    await uploadDoc(customer, draft, 'BUSINESS_LICENSE').expect(403);
    await uploadDoc(await loginAs('newowner@example.com'), draft, 'BUSINESS_LICENSE').expect(403);
    await uploadDoc(owner, draft, 'BUSINESS_LICENSE', { file: Buffer.from('MZ fake exe') }).expect(400);
    await uploadDoc(owner, draft, 'BUSINESS_LICENSE', { file: null }).expect(400);
    await uploadDoc(owner, draft, 'BUSINESS_LICENSE', {
      issuedAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    }).expect(400);
    await uploadDoc(owner, draft, 'FOOD_SAFETY', { expiresAt: null }).expect(400);
    const one = await uploadDoc(owner, draft, 'BUSINESS_LICENSE', { expiresAt: null }).expect(201);
    expect(one.body.data.documents[0].fileKey).toBeUndefined();
    expect(one.body.data.documents[0].mimeType).toBe('application/pdf');
    // Incomplete or short-lived food-safety certificate cannot be submitted.
    await call('patch', '/brands/' + draft + '/submit', owner)
      .send({})
      .expect(400);
    await uploadDoc(owner, draft, 'FOOD_SAFETY', {
      expiresAt: new Date(Date.now() + 10 * 86400000).toISOString(),
    }).expect(201);
    const short = await call('patch', '/brands/' + draft + '/submit', owner)
      .send({})
      .expect(400);
    expect(short.body.error.message).toContain('30 ngày');
    // Editing details without a new file keeps the stored file but persists the new dates.
    const before = (await db.brands.findById(draft))!.documents.find((d) => d.type === 'FOOD_SAFETY')!;
    const newExpiry = new Date(Date.now() + 400 * 86400000);
    const edited = await uploadDoc(owner, draft, 'FOOD_SAFETY', {
      expiresAt: newExpiry.toISOString(),
      file: null,
    }).expect(201);
    const editedDoc = edited.body.data.documents.find((d: { type: string }) => d.type === 'FOOD_SAFETY');
    expect(new Date(editedDoc.expiresAt).getTime()).toBe(newExpiry.getTime());
    const brandDoc = await db.brands.findById(draft);
    expect(brandDoc!.documents).toHaveLength(2);
    const after = brandDoc!.documents.find((d) => d.type === 'FOOD_SAFETY')!;
    expect(after.expiresAt!.getTime()).toBe(newExpiry.getTime());
    expect(after.fileKey).toBe(before.fileKey);
    expect(after.mimeType).toBe('application/pdf');
    await call('patch', '/brands/' + draft + '/submit', manager)
      .send({})
      .expect(403);
    const sub = await call('patch', '/brands/' + draft + '/submit', owner)
      .send({})
      .expect(200);
    expect(sub.body.data.status).toBe('PENDING');
    // Locked while under review.
    await uploadDoc(owner, draft, 'FOOD_SAFETY').expect(400);
    // Files are private: admin + owner yes, customer / unrelated manager no.
    const file = await call('get', '/brands/' + draft + '/documents/FOOD_SAFETY/file', admin).expect(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(file.body.subarray(0, 5).toString()).toBe('%PDF-');
    await call('get', '/brands/' + draft + '/documents/FOOD_SAFETY/file', owner).expect(200);
    await call('get', '/brands/' + draft + '/documents/FOOD_SAFETY/file', customer).expect(403);
    await call('get', '/brands/' + draft + '/documents/FOOD_SAFETY/file', manager).expect(403);
    await call('get', '/brands/' + draft + '/documents/OTHER/file', admin).expect(400);
    // Admin returns the file with a reason; owner fixes and resubmits; admin approves.
    await call('patch', '/brands/' + draft + '/reject', admin)
      .send({ reason: 'Ảnh mờ' })
      .expect(200);
    const mine = await call('get', '/brands/me', owner).expect(200);
    const rejected = mine.body.data.find((b: { id: string }) => b.id === draft);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reason).toBe('Ảnh mờ');
    await uploadDoc(owner, draft, 'BUSINESS_LICENSE').expect(201);
    await call('patch', '/brands/' + draft + '/submit', owner)
      .send({})
      .expect(200);
    const ok = await call('patch', '/brands/' + draft + '/approve', admin)
      .send({})
      .expect(200);
    expect(ok.body.data.status).toBe('APPROVED');
    await call('patch', '/brands/' + draft + '/approve', admin)
      .send({})
      .expect(400);
    await call('patch', '/brands/' + draft + '/reinstate', admin)
      .send({})
      .expect(400);
    await call('patch', '/brands/' + draft + '/suspend', admin)
      .send({ reason: 'Kiểm tra' })
      .expect(200);
    await call('patch', '/brands/' + draft + '/reinstate', admin)
      .send({})
      .expect(200);
    // Seeded approved brand ships with both sample licenses.
    const seeded = await call(
      'get',
      '/brands/' + seed.brand._id + '/documents/BUSINESS_LICENSE/file',
      manager,
    );
    expect(seeded.status).toBe(200);
  });

  // ---------- Price constraints ----------
  it('price rules: whole thousands, max 70% off, DISCOUNT value consistency, staff discount bounds', async () => {
    const post = (o: Record<string, unknown>) =>
      call('post', '/campaigns/brand/' + seed.brand._id, manager).send(campaignBody(o));
    const msg = async (o: Record<string, unknown>) =>
      (await post(o).expect(400)).body.error.message as string;
    expect(await msg({ salePrice: 30500 })).toContain('1.000');
    expect(await msg({ salePrice: 500, faceValue: 1000 })).toContain('1.000');
    expect(await msg({ salePrice: 14000, faceValue: 50000 })).toContain('30%');
    await post({ salePrice: 15000, faceValue: 50000 }).expect(201);
    expect(
      await msg({ voucherType: 'DISCOUNT', discountType: 'AMOUNT', discountValue: 40000, faceValue: 50000 }),
    ).toContain('bằng đúng số tiền giảm');
    await post({
      voucherType: 'DISCOUNT',
      discountType: 'AMOUNT',
      discountValue: 50000,
      faceValue: 50000,
    }).expect(201);
    expect(
      await msg({ voucherType: 'DISCOUNT', discountType: 'PERCENT', discountValue: 20, maxDiscount: 60000 }),
    ).toContain('mức giảm tối đa');
    await post({
      voucherType: 'DISCOUNT',
      discountType: 'PERCENT',
      discountValue: 20,
      maxDiscount: 50000,
    }).expect(201);
    await post({ staffDiscountPercent: 60 }).expect(400);
    await post({ staffDiscountPercent: 10.5 }).expect(400);
    expect(await msg({ salePrice: 3000, faceValue: 5000, staffDiscountPercent: 50 })).toContain('50%');
    const ok = await post({ staffDiscountPercent: 50 }).expect(201);
    expect(ok.body.data.staffDiscountPercent).toBe(50);
    // After a sale, value/benefits may not be lowered.
    const c = await post({ title: 'Đã có vé bán ' + ++counter }).expect(201);
    await call('patch', '/campaigns/' + c.body.data.id + '/submit', manager)
      .send({})
      .expect(200);
    await call('patch', '/campaigns/' + c.body.data.id + '/approve', admin)
      .send({})
      .expect(200);
    await checkout(customer, c.body.data.id).expect(201);
    await call('patch', '/campaigns/' + c.body.data.id, manager)
      .send({ faceValue: 45000 })
      .expect(400);
    await call('patch', '/campaigns/' + c.body.data.id, manager)
      .send({ faceValue: 60000 })
      .expect(200);
  });

  // ---------- Staff purchase with employee code ----------
  it('staff buys at employee price with own code only, on own brand, when the campaign offers it', async () => {
    const me = await call('get', '/users/me', staff).expect(200);
    expect(me.body.data.employeeCode).toBe('NV-STAFF1');
    const discounted = String(seed.campaigns[0]._id); // 30.000đ, 20% staff discount
    const noDiscount = String(seed.campaigns[1]._id);
    const preview = await call(
      'get',
      '/orders/staff-price?campaignId=' + discounted + '&employeeCode=nv-staff1',
      staff,
    ).expect(200);
    expect(preview.body.data).toEqual({ percent: 20, listPrice: 30000, staffPrice: 24000 });
    await call(
      'get',
      '/orders/staff-price?campaignId=' + discounted + '&employeeCode=NV-STAFF1',
      customer,
    ).expect(403);
    const err = async (token: string, body: Record<string, unknown>) =>
      (
        await call('post', '/orders', token)
          .send({ quantity: 1, idempotencyKey: randomUUID(), ...body })
          .expect(400)
      ).body.error.message as string;
    expect(await err(staff, { campaignId: discounted, employeeCode: 'NV-STAFF2' })).toContain('không đúng');
    expect(await err(customer, { campaignId: discounted, employeeCode: 'NV-STAFF1' })).toContain(
      'Chỉ nhân viên',
    );
    expect(await err(staff, { campaignId: noDiscount, employeeCode: 'NV-STAFF1' })).toContain(
      'không có ưu đãi',
    );
    expect(await err(staff, { campaignId: discounted, employeeCode: 'BAD' })).toEqual([
      'Mã nhân viên có dạng NV-XXXXXX.',
    ]);
    const foreign = await call(
      'get',
      '/orders/staff-price?campaignId=' + otherBrandCampaignId + '&employeeCode=NV-STAFF1',
      staff,
    ).expect(400);
    expect(foreign.body.error.message).toContain('không thuộc thương hiệu');
    // Rejected attempts leave no reservation behind.
    const quota = await db.quotas.findOne({ userId: me.body.data.id, campaignId: discounted });
    expect(quota?.reserved ?? 0).toBe(0);
    const key = randomUUID();
    const order = await call('post', '/orders', staff)
      .send({ campaignId: discounted, quantity: 2, idempotencyKey: key, employeeCode: 'NV-STAFF1' })
      .expect(201);
    expect(order.body.data).toMatchObject({
      unitPrice: 24000,
      totalAmount: 48000,
      listUnitPrice: 30000,
      staffDiscountPercent: 20,
      employeeCode: 'NV-STAFF1',
    });
    await call('post', '/orders', staff)
      .send({ campaignId: discounted, quantity: 2, idempotencyKey: key })
      .expect(400);
    const replay = await call('post', '/orders', staff)
      .send({ campaignId: discounted, quantity: 2, idempotencyKey: key, employeeCode: 'NV-STAFF1' })
      .expect(201);
    expect(replay.body.data.id).toBe(order.body.data.id);
    await call('post', '/orders/' + order.body.data.id + '/simulate-payment', staff)
      .send({ success: true })
      .expect(201);
    const wallet = await call('get', '/wallet', staff).expect(200);
    const v = wallet.body.data.find((x: { orderId: string }) => x.orderId === order.body.data.id);
    expect(v).toMatchObject({ salePrice: 24000, totalPrice: 48000, usageLimit: 2, staffDiscountPercent: 20 });
    // Normal price still available to staff without a code.
    const normal = await call('post', '/orders', staff)
      .send({ campaignId: noDiscount, quantity: 1, idempotencyKey: randomUUID() })
      .expect(201);
    expect(normal.body.data.unitPrice).toBe(seed.campaigns[1].salePrice);
    // Own voucher cannot be self-redeemed; colleague confirms it.
    const code = await call('post', '/redeem/token', staff).send({ voucherItemId: v.id }).expect(201);
    const body = { storeId: String(seed.store._id), billAmount: 60000, otpCode: code.body.data.otpCode };
    await call('post', '/redeem', staff)
      .send({ ...body, idempotencyKey: randomUUID() })
      .expect(403);
    const staff2 = await loginAs('staff2@voucher.local');
    await call('post', '/auth/select-store', staff2)
      .send({ storeId: String(seed.store._id) })
      .expect(201);
    const used = await call('post', '/redeem', staff2)
      .send({ ...body, idempotencyKey: randomUUID() })
      .expect(201);
    expect(used.body.data.remainingUses).toBe(1);
    // Refund of an employee-price bundle returns what was actually paid.
    const o2 = await call('post', '/orders', staff)
      .send({ campaignId: discounted, quantity: 1, idempotencyKey: randomUUID(), employeeCode: 'NV-STAFF1' })
      .expect(201);
    await call('post', '/orders/' + o2.body.data.id + '/simulate-payment', staff)
      .send({ success: true })
      .expect(201);
    const v2 = (await call('get', '/wallet', staff)).body.data.find(
      (x: { orderId: string }) => x.orderId === o2.body.data.id,
    );
    const refund = await call('post', '/refunds', staff)
      .send({ voucherItemId: v2.id, reason: 'Thử hoàn' })
      .expect(201);
    expect(refund.body.data.amount).toBe(24000);
    // Brand report counts employee-price orders.
    const report = await call('get', '/brands/' + seed.brand._id + '/reports/overview', manager).expect(200);
    expect(report.body.data.staffOrders).toBeGreaterThanOrEqual(2);
  });

  it('employee codes: unique per staff, issued on creation and role change, removed when leaving staff', async () => {
    const created = await call('post', '/brands/' + seed.brand._id + '/staff', manager)
      .send({
        email: 'codes@example.com',
        fullName: 'Code Staff',
        password: 'Voucher@123',
        storeIds: [String(seed.store._id)],
      })
      .expect(201);
    expect(created.body.data.employeeCode).toMatch(/^NV-[A-Z0-9]{6}$/);
    const list = await call('get', '/brands/' + seed.brand._id + '/staff', manager).expect(200);
    const codes = list.body.data.map((u: { employeeCode: string }) => u.employeeCode);
    expect(new Set(codes).size).toBe(codes.length);
    const byAdmin = await call('post', '/admin/users', admin)
      .send({ email: 'promote@example.com', fullName: 'Promote', password: 'Voucher@123', role: 'CUSTOMER' })
      .expect(201);
    expect(byAdmin.body.data.employeeCode).toBeUndefined();
    const promoted = await call('patch', '/admin/users/' + byAdmin.body.data.id, admin)
      .send({ role: 'STORE_STAFF', storeIds: [String(seed.store._id)] })
      .expect(200);
    expect(promoted.body.data.employeeCode).toMatch(/^NV-[A-Z0-9]{6}$/);
    const demoted = await call('patch', '/admin/users/' + byAdmin.body.data.id, admin)
      .send({ role: 'CUSTOMER', storeIds: [] })
      .expect(200);
    expect(demoted.body.data.employeeCode).toBeUndefined();
  });
});
