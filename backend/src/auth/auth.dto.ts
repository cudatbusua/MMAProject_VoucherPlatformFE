import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsMongoId, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
export class EmailDto {
  @ApiProperty({ example: 'customer@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;
}
export class VerifyOtpDto extends EmailDto {
  @ApiProperty({ example: '123456' }) @IsString() @Matches(/^\d{6}$/) code: string;
}
export class LoginDto extends EmailDto {
  @ApiProperty({ example: 'Voucher@123' }) @IsString() @MinLength(8) @MaxLength(128) password: string;
}
export class RefreshDto {
  @ApiProperty() @IsString() @Length(40, 100) refreshToken: string;
}
export class SelectStoreDto {
  @ApiProperty() @IsMongoId() storeId: string;
}
export class UpdateProfileDto {
  @ApiProperty() @IsString() @Length(1, 100) fullName: string;
}
