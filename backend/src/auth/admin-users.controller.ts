import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { Types } from 'mongoose';
import { hashPassword } from '../common/crypto';
import { ObjectIdPipe } from '../common/http';
import { Database } from '../database/database.module';
import { Role } from '../database/schemas';
import { createWithEmployeeCode, ensureEmployeeCode } from './employee-code';
import { CurrentUser, Principal, Roles } from './security';

class OwnerDto {
  @ApiProperty()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
  @ApiProperty() @IsString() @Length(1, 100) fullName: string;
  @ApiProperty() @IsString() @Length(8, 128) password: string;
}
class AccountDto extends OwnerDto {
  @ApiProperty({ enum: Role }) @IsEnum(Role) role: Role;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  brandIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  storeIds?: string[];
}
class AssignmentDto {
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(8, 128) password?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  brandIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  storeIds?: string[];
}
@ApiTags('Admin users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly db: Database) {}
  @Get() list() {
    return this.db.users.find().sort({ createdAt: -1 }).limit(200);
  }
  private async validateScopes(role: Role, brandIds: string[], storeIds: string[]) {
    if (
      role === Role.BRAND_MANAGER &&
      (!brandIds.length ||
        (await this.db.brands.countDocuments({ _id: { $in: brandIds } })) !== brandIds.length)
    )
      throw new BadRequestException('Quản lý phải được gán ít nhất một thương hiệu hợp lệ.');
    if (
      role === Role.STORE_STAFF &&
      (!storeIds.length ||
        (await this.db.stores.countDocuments({ _id: { $in: storeIds }, active: true })) !== storeIds.length)
    )
      throw new BadRequestException('Nhân viên phải được gán cửa hàng đang hoạt động.');
    if (role !== Role.BRAND_MANAGER && brandIds.length)
      throw new BadRequestException('brandIds chỉ dành cho quản lý thương hiệu.');
    if (role !== Role.STORE_STAFF && storeIds.length)
      throw new BadRequestException('storeIds chỉ dành cho nhân viên cửa hàng.');
  }
  @Post('brand-owners') createOwner(@Body() dto: OwnerDto) {
    return this.create({ ...dto, role: Role.BRAND_OWNER });
  }
  @Post() async create(@Body() dto: AccountDto) {
    const brandIds = dto.brandIds ?? [],
      storeIds = dto.storeIds ?? [];
    await this.validateScopes(dto.role, brandIds, storeIds);
    return createWithEmployeeCode(this.db, {
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role,
      passwordHash: await hashPassword(dto.password),
      brandIds,
      storeIds,
    });
  }
  @Patch(':id') async update(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() actor: Principal,
    @Body() dto: AssignmentDto,
  ) {
    if (id === actor.userId && (dto.active === false || (dto.role && dto.role !== Role.ADMIN)))
      throw new BadRequestException('Không được tự khóa hoặc hạ quyền quản trị viên.');
    const passwordHash = dto.password ? await hashPassword(dto.password) : undefined;
    return this.db.connection.transaction(async (session) => {
      // Serialize changes with changes to the acting admin, preventing two admins disabling each other.
      const admin = await this.db.users.findOneAndUpdate(
        { _id: actor.userId, role: Role.ADMIN, active: true },
        { $inc: { __v: 1 } },
        { session },
      );
      if (!admin) throw new ForbiddenException('Quản trị viên không còn hoạt động.');
      const target = await this.db.users.findById(id).session(session);
      if (!target) throw new BadRequestException('Không tìm thấy tài khoản.');
      const role = dto.role ?? target.role;
      const brandIds = dto.brandIds ?? (role === Role.BRAND_MANAGER ? target.brandIds.map(String) : []);
      const storeIds = dto.storeIds ?? (role === Role.STORE_STAFF ? target.storeIds.map(String) : []);
      await this.validateScopes(role, brandIds, storeIds);

      const saved = await this.db.users.findByIdAndUpdate(
        id,
        {
          $set: {
            role,
            active: dto.active ?? target.active,
            brandIds: brandIds.map((v) => new Types.ObjectId(v)),
            storeIds: storeIds.map((v) => new Types.ObjectId(v)),
            ...(passwordHash ? { passwordHash } : {}),
          },
          ...(role !== Role.STORE_STAFF ? { $unset: { employeeCode: 1 } } : {}),
        },
        { session, returnDocument: 'after', runValidators: true },
      );
      await this.db.sessions.deleteMany({ userId: id }, { session });
      await this.db.audits.create([{ actorId: actor.userId, action: 'ACCOUNT_UPDATED', resourceId: id }], {
        session,
      });
      if (role === Role.STORE_STAFF && !saved?.employeeCode) {
        await ensureEmployeeCode(this.db, id, session);
        return this.db.users.findById(id).session(session);
      }
      return saved;
    });
  }
}
