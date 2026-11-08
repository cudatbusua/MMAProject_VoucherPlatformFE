import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { VoucherType } from '../database/schemas';

export class BrandDto {
  @ApiProperty() @IsString() @Length(2, 150) name: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() logo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class ReasonDto {
  @ApiProperty() @IsString() @Length(3, 500) reason: string;
}
export class StoreDto {
  @ApiProperty() @IsString() @Length(2, 150) name: string;
  @ApiProperty() @IsString() @Length(5, 300) address: string;
  @ApiProperty({ example: 10.776 }) @IsNumber() @Min(-90) @Max(90) latitude: number;
  @ApiProperty({ example: 106.7 }) @IsNumber() @Min(-180) @Max(180) longitude: number;
}
export class UpdateStoreDto extends PartialType(StoreDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
export class StaffDto {
  @ApiProperty()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  email: string;
  @ApiProperty() @IsString() @Length(1, 100) fullName: string;
  @ApiProperty() @IsString() @Length(8, 128) password: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  storeIds: string[];
}
export class CampaignDto {
  @ApiProperty() @IsString() @Length(3, 200) title: string;
  @ApiPropertyOptional({ default: 'OTHER' }) @IsOptional() @IsString() @Length(1, 80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() image?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) terms?: string;
  @ApiProperty({ enum: VoucherType }) @IsEnum(VoucherType) voucherType: VoucherType;
  @ApiProperty({ example: 40000 }) @IsInt() @Min(1) @Max(1000000000) salePrice: number;
  @ApiProperty({ example: 50000 }) @IsInt() @Min(1) @Max(1000000000) faceValue: number;
  @ApiPropertyOptional({ enum: ['AMOUNT', 'PERCENT'] })
  @IsOptional()
  @IsIn(['AMOUNT', 'PERCENT'])
  discountType?: 'AMOUNT' | 'PERCENT';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000000000) discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000000000) maxDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 2000) comboItems?: string;
  @ApiProperty({ example: 100 }) @IsInt() @Min(1) @Max(1000000) totalQuantity: number;
  @ApiPropertyOptional({ default: 5 }) @IsOptional() @IsInt() @Min(1) @Max(100) limitPerUser?: number;
  @ApiProperty() @IsDateString() saleStartAt: string;
  @ApiProperty() @IsDateString() saleEndAt: string;
  @ApiProperty() @IsDateString() voucherExpireAt: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  storeIds: string[];
}
export class UpdateCampaignDto extends PartialType(CampaignDto) {}
export class SearchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
  @ApiPropertyOptional({ description: 'Bán kính km; cần latitude và longitude', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm?: number;
  @ApiPropertyOptional({ enum: ['newest', 'price', 'best'] })
  @IsOptional()
  @IsIn(['newest', 'price', 'best'])
  sort?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page =
    1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit =
    20;
}

export class CreateBrandDto extends BrandDto {
  @ApiProperty({ description: 'Chủ sở hữu chỉ xem số liệu; admin chọn tài khoản BRAND_OWNER.' })
  @IsMongoId()
  ownerId: string;
}
