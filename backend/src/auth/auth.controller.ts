import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Database } from '../database/database.module';
import { Role } from '../database/schemas';
import { AuthService } from './auth.service';
import { EmailDto, LoginDto, RefreshDto, SelectStoreDto, UpdateProfileDto, VerifyOtpDto } from './auth.dto';
import { CurrentUser, Principal, Public, Roles } from './security';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('otp/request') request(
    @Body() dto: EmailDto,
  ) {
    return this.auth.requestOtp(dto.email);
  }
  @Public() @Throttle({ default: { limit: 10, ttl: 60000 } }) @Post('otp/verify') verify(
    @Body() dto: VerifyOtpDto,
  ) {
    return this.auth.verifyOtp(dto.email, dto.code);
  }
  @Public() @Throttle({ default: { limit: 10, ttl: 60000 } }) @Post('login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }
  @Public() @Post('refresh') refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
  @ApiBearerAuth() @Post('logout') logout(@CurrentUser() user: Principal) {
    return this.auth.logout(user);
  }
  @ApiBearerAuth() @Roles(Role.STORE_STAFF) @Post('select-store') selectStore(
    @CurrentUser() user: Principal,
    @Body() dto: SelectStoreDto,
  ) {
    return this.auth.selectStore(user, dto.storeId);
  }
}
@ApiTags('Profile')
@ApiBearerAuth()
@Controller('users')
export class ProfileController {
  constructor(private readonly db: Database) {}
  @Get('me') me(@CurrentUser() user: Principal) {
    return this.db.users.findById(user.userId);
  }
  @Patch('me') update(@CurrentUser() user: Principal, @Body() dto: UpdateProfileDto) {
    return this.db.users.findByIdAndUpdate(
      user.userId,
      { $set: { fullName: dto.fullName } },
      { returnDocument: 'after' },
    );
  }
}
