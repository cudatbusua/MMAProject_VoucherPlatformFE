import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
export class CreateOrderDto {
  @ApiProperty() @IsMongoId() campaignId: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) @Max(100) quantity: number;
  @ApiProperty({ description: 'UUID mới cho mỗi lần checkout; gửi lại cùng key để tránh tạo trùng.' })
  @IsUUID('4')
  idempotencyKey: string;
  @ApiPropertyOptional({ example: 'NV-STAFF1', description: 'Mã nhân viên của chính tài khoản STORE_STAFF' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^NV-[A-Z0-9]{6}$/, { message: 'Mã nhân viên có dạng NV-XXXXXX.' })
  employeeCode?: string;
}
export class StaffPriceQueryDto {
  @ApiProperty() @IsMongoId() campaignId: string;
  @ApiProperty({ example: 'NV-STAFF1' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^NV-[A-Z0-9]{6}$/, { message: 'Mã nhân viên có dạng NV-XXXXXX.' })
  employeeCode: string;
}
export class DemoPaymentDto {
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() success?: boolean;
}
export class TokenDto {
  @ApiProperty() @IsMongoId() voucherItemId: string;
}
export class RedeemDto {
  @ApiProperty({ description: 'UUID v4 mới cho mỗi lượt xác nhận; giữ nguyên khi retry do lỗi mạng.' })
  @IsUUID('4')
  idempotencyKey: string;
  @ApiProperty() @IsMongoId() storeId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(20, 100) qrPayload?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^\d{6}$/) otpCode?: string;
  @ApiProperty({ example: 100000 }) @IsInt() @Min(0) @Max(1000000000) billAmount: number;
}
export class RefundDto extends TokenDto {
  @ApiProperty() @IsString() @Length(3, 500) reason: string;
}
export class ConfirmRefundDto {
  @ApiProperty({ description: 'Mã tham chiếu xác nhận hoàn tiền demo/thủ công' })
  @IsString()
  @Length(3, 100)
  reference: string;
}
