import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import { Types } from 'mongoose';
import { Database } from '../database/database.module';
import { Role } from '../database/schemas';
import { digest, randomToken, verifyPassword } from '../common/crypto';
import { MailService } from './mail.service';
import { Principal } from './security';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}
  private hash(value: string) {
    return digest(value, this.config.getOrThrow('OTP_SECRET'));
  }
  async requestOtp(email: string) {
    const existing = await this.db.users.findOne({ email });
    if (existing && (existing.role !== Role.CUSTOMER || !existing.active))
      throw new BadRequestException('Email này không dùng cho đăng nhập khách hàng.');
    const code = randomInt(100000, 1000000).toString();
    const now = new Date();
    // Unique email + conditional upsert makes the cooldown apply across server instances.
    try {
      await this.db.otps.findOneAndUpdate(
        {
          email,
          $or: [{ requestedAt: { $lte: new Date(Date.now() - 60000) } }, { requestedAt: { $exists: false } }],
        },
        {
          $set: {
            hash: this.hash(email + ':' + code),
            attempts: 0,
            consumed: false,
            expiresAt: new Date(Date.now() + 300000),
            requestedAt: now,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if ((error as { code: number }).code === 11000)
        throw new BadRequestException('Vui lòng chờ 60 giây trước khi gửi lại OTP.');
      throw error;
    }
    try {
      await this.mail.sendOtp(email, code);
    } catch (error) {
      await this.db.otps.deleteOne({ email, requestedAt: now });
      throw error;
    }
    return { message: 'Đã gửi mã đăng nhập.', expiresIn: 300 };
  }
  async verifyOtp(email: string, code: string) {
    return this.db.connection
      .transaction(async (session) => {
        const otp = await this.db.otps
          .findOne({ email, consumed: false, attempts: { $lt: 5 }, expiresAt: { $gt: new Date() } })
          .select('+hash')
          .session(session);
        if (!otp) return null;
        if (otp.hash !== this.hash(email + ':' + code)) {
          await this.db.otps.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } }, { session });
          return null; // Commit the failed-attempt counter before throwing outside the transaction.
        }
        await this.db.otps.updateOne({ _id: otp._id }, { $set: { consumed: true } }, { session });
        const user = await this.db.users.findOneAndUpdate(
          { email },
          { $setOnInsert: { role: Role.CUSTOMER, fullName: '', active: true, storeIds: [] } },
          { upsert: true, returnDocument: 'after', session },
        );
        if (user.role !== Role.CUSTOMER || !user.active) throw new ForbiddenException();
        const refreshToken = randomToken();
        const [saved] = await this.db.sessions.create(
          [
            {
              userId: user._id,
              refreshHash: this.hash(refreshToken),
              expiresAt: new Date(Date.now() + 30 * 86400000),
            },
          ],
          { session },
        );
        return {
          user,
          accessToken: await this.jwt.signAsync({ sub: String(user._id), sid: String(saved._id) }),
          refreshToken,
        };
      })
      .then((result) => {
        if (!result) throw new UnauthorizedException('OTP không hợp lệ, đã dùng hoặc hết hạn.');
        return result;
      });
  }
  async login(email: string, password: string) {
    const user = await this.db.users
      .findOne({ email, active: true, role: { $ne: Role.CUSTOMER } })
      .select('+passwordHash');
    if (!(await verifyPassword(password, user?.passwordHash)) || !user)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    const refreshToken = randomToken();
    const saved = await this.db.sessions.create({
      userId: user._id,
      refreshHash: this.hash(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    return {
      user,
      accessToken: await this.jwt.signAsync({ sub: String(user._id), sid: String(saved._id) }),
      refreshToken,
    };
  }
  async refresh(token: string) {
    const refreshToken = randomToken();
    const session = await this.db.sessions.findOneAndUpdate(
      { refreshHash: this.hash(token), expiresAt: { $gt: new Date() } },
      { $set: { refreshHash: this.hash(refreshToken) } },
      { returnDocument: 'after' },
    );
    const user = session && (await this.db.users.findOne({ _id: session.userId, active: true }));
    if (!session || !user) throw new UnauthorizedException();
    return {
      user,
      accessToken: await this.jwt.signAsync({ sub: String(user._id), sid: String(session._id) }),
      refreshToken,
    };
  }
  async selectStore(user: Principal, storeId: string) {
    const assigned = await this.db.users.exists({ _id: user.userId, storeIds: storeId });
    const store = await this.db.stores.findOne({ _id: storeId, active: true });
    if (!assigned || !store || !(await this.db.brands.exists({ _id: store.brandId, status: 'APPROVED' })))
      throw new ForbiddenException('Không được phân công cửa hàng này.');
    await this.db.sessions.updateOne(
      { _id: user.sessionId },
      { $set: { activeStoreId: new Types.ObjectId(storeId) } },
    );
    return { activeStoreId: storeId };
  }
  async logout(user: Principal) {
    await this.db.sessions.deleteOne({ _id: user.sessionId });
    return { success: true };
  }
}
