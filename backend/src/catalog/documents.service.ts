import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { Principal } from '../auth/security';
import { Database } from '../database/database.module';
import { BrandDocument, Role } from '../database/schemas';
import { DocumentDto } from './catalog.dto';
import { DAY, documentProblem, FOOD_SAFETY_MIN_VALID_DAYS, LICENSE_LABEL, LicenseType } from './rules';

export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  size: number;
}
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** Detects the real file type from magic bytes; the client-declared MIME type is not trusted. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  return null;
}

export function uploadDir() {
  return resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
}

/** Writes a license file and returns its random key. Shared with the seed script. */
export async function storeDocumentFile(buffer: Buffer, ext: string) {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const key = randomBytes(16).toString('hex') + '.' + ext;
  await writeFile(join(dir, key), buffer);
  return key;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly db: Database) {}

  private async ownedBrand(id: string, user: Principal) {
    const brand = await this.db.brands.findById(id);
    if (!brand) throw new NotFoundException('Không tìm thấy thương hiệu.');
    if (user.role !== Role.BRAND_OWNER || String(brand.ownerId) !== user.userId)
      throw new ForbiddenException('Chỉ chủ thương hiệu được nộp hồ sơ pháp lý.');
    return brand;
  }

  async upload(id: string, user: Principal, dto: DocumentDto, file?: UploadedFileLike) {
    const brand = await this.ownedBrand(id, user);
    if (brand.status !== 'DRAFT' && brand.status !== 'REJECTED')
      throw new BadRequestException(
        'Chỉ cập nhật hồ sơ khi thương hiệu ở trạng thái Nháp hoặc Bị trả hồ sơ.',
      );
    // Plain objects only: spreading a Mongoose subdocument would copy its internals, not its fields.
    const current = brand.toObject().documents;
    const existing = current.find((d) => d.type === dto.type);
    if (!file && !existing) throw new BadRequestException('Vui lòng chọn file ảnh hoặc PDF.');
    const issuedAt = new Date(dto.issuedAt);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (issuedAt.getTime() > Date.now() + DAY)
      throw new BadRequestException('Ngày cấp không được ở tương lai.');
    if (expiresAt && expiresAt <= issuedAt) throw new BadRequestException('Ngày hết hạn phải sau ngày cấp.');
    if (dto.type === 'FOOD_SAFETY' && !expiresAt)
      throw new BadRequestException('Chứng nhận an toàn thực phẩm cần ngày hết hạn.');

    let fileMeta: Pick<BrandDocument, 'fileKey' | 'fileName' | 'mimeType' | 'size'>;
    if (file) {
      if (file.size > MAX_DOCUMENT_BYTES) throw new BadRequestException('File tối đa 5MB.');
      const kind = sniff(file.buffer);
      if (!kind) throw new BadRequestException('Chỉ nhận file PDF, PNG hoặc JPG.');
      fileMeta = {
        fileKey: await storeDocumentFile(file.buffer, kind.ext),
        fileName: (file.originalname || 'giay-to.' + kind.ext).slice(0, 200),
        mimeType: kind.mime,
        size: file.size,
      };
    } else
      fileMeta = {
        fileKey: existing!.fileKey,
        fileName: existing!.fileName,
        mimeType: existing!.mimeType,
        size: existing!.size,
      };

    const doc: BrandDocument = {
      type: dto.type,
      number: dto.number.trim(),
      issuer: dto.issuer.trim(),
      issuedAt,
      expiresAt,
      ...fileMeta,
      uploadedAt: file ? new Date() : existing!.uploadedAt,
    };
    const documents = [...current.filter((d) => d.type !== dto.type), doc];
    // updatedAt in the filter makes concurrent edits fail instead of silently overwriting each other.
    const updated = await this.db.brands.findOneAndUpdate(
      { _id: id, status: { $in: ['DRAFT', 'REJECTED'] }, updatedAt: brand.updatedAt },
      { $set: { documents } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw new BadRequestException('Thương hiệu vừa đổi trạng thái. Vui lòng tải lại.');
    if (file && existing && existing.fileKey !== doc.fileKey)
      await unlink(join(uploadDir(), existing.fileKey)).catch(() => undefined);
    await this.db.audits.create({
      actorId: user.userId,
      action: 'BRAND_DOCUMENT_UPLOADED',
      resourceId: id,
      detail: LICENSE_LABEL[dto.type] + ' ' + doc.number,
    });
    return updated;
  }

  async submit(id: string, user: Principal) {
    const brand = await this.ownedBrand(id, user);
    if (brand.status !== 'DRAFT' && brand.status !== 'REJECTED')
      throw new BadRequestException('Hồ sơ đã được gửi hoặc đã duyệt.');
    const problem = documentProblem(brand.documents, FOOD_SAFETY_MIN_VALID_DAYS);
    if (problem) throw new BadRequestException(problem);
    const updated = await this.db.brands.findOneAndUpdate(
      { _id: id, status: brand.status },
      { $set: { status: 'PENDING', submittedAt: new Date() }, $unset: { reason: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) throw new BadRequestException('Thương hiệu vừa đổi trạng thái. Vui lòng tải lại.');
    await this.db.audits.create({ actorId: user.userId, action: 'BRAND_SUBMITTED', resourceId: id });
    return updated;
  }

  /** Admin, the brand owner and the brand's managers may view license files. */
  async file(id: string, type: LicenseType, user: Principal) {
    const brand = await this.db.brands.findById(id);
    if (!brand) throw new NotFoundException();
    const allowed =
      user.role === Role.ADMIN ||
      (user.role === Role.BRAND_OWNER && String(brand.ownerId) === user.userId) ||
      (user.role === Role.BRAND_MANAGER &&
        !!(await this.db.users.exists({ _id: user.userId, active: true, brandIds: id })));
    if (!allowed) throw new ForbiddenException('Không có quyền xem hồ sơ này.');
    const doc = brand.documents.find((d) => d.type === type);
    if (!doc) throw new NotFoundException('Chưa có giấy tờ này.');
    if (!/^[a-f0-9]{32}\.(pdf|png|jpg)$/.test(doc.fileKey)) throw new NotFoundException();
    const buffer = await readFile(join(uploadDir(), doc.fileKey)).catch(() => null);
    if (!buffer) throw new NotFoundException('File không còn trên máy chủ.');
    return { buffer, mimeType: doc.mimeType, fileName: doc.fileName };
  }
}
