import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';
import { hashPassword } from '../common/crypto';
import { Database } from '../database/database.module';
import { Role } from '../database/schemas';
import { Roles } from './security';

class OwnerDto {
  @ApiProperty()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
  @ApiProperty() @IsString() @Length(1, 100) fullName: string;
  @ApiProperty() @IsString() @Length(8, 128) password: string;
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
  @Post('brand-owners') async create(@Body() dto: OwnerDto) {
    return this.db.users.create({
      email: dto.email,
      fullName: dto.fullName,
      role: Role.BRAND_OWNER,
      passwordHash: await hashPassword(dto.password),
    });
  }
}
