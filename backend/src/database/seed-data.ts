import { Database } from './database.module';
import { CampaignStatus, Role, VoucherType } from './schemas';
import { hashPassword } from '../common/crypto';
import { DAY } from '../catalog/rules';
import { storeDocumentFile } from '../catalog/documents.service';
import { samplePdf } from './sample-pdf';

/** Placeholder license PDFs so the seeded APPROVED brand has a complete, reviewable file. */
async function sampleDocuments(brandName: string) {
  const docs = [
    { type: 'BUSINESS_LICENSE' as const, number: '0312345678', issuer: 'So KH&DT TP.HCM', years: [-2, 0] },
    {
      type: 'FOOD_SAFETY' as const,
      number: 'ATTP-2025-0915',
      issuer: 'Ban Quan ly ATTP TP.HCM',
      years: [-1, 2],
    },
  ];
  const out = [];
  for (const d of docs) {
    const issuedAt = new Date(Date.now() + d.years[0] * 365 * DAY);
    const expiresAt = d.years[1] ? new Date(Date.now() + d.years[1] * 365 * DAY) : undefined;
    const pdf = samplePdf([
      d.type === 'FOOD_SAFETY'
        ? 'GIAY CHUNG NHAN AN TOAN THUC PHAM (MAU)'
        : 'GIAY CHUNG NHAN DANG KY KINH DOANH (MAU)',
      'Ten co so: ' + brandName.normalize('NFD').replace(/[^ -~]/g, ''),
      'So: ' + d.number,
      'Co quan cap: ' + d.issuer,
      'Ngay cap: ' +
        issuedAt.toISOString().slice(0, 10) +
        (expiresAt ? '  -  Het han: ' + expiresAt.toISOString().slice(0, 10) : ''),
      'Du lieu mau de kiem thu, khong co gia tri phap ly.',
    ]);
    out.push({
      type: d.type,
      number: d.number,
      issuer: d.issuer,
      issuedAt,
      expiresAt,
      fileKey: await storeDocumentFile(pdf, 'pdf'),
      fileName: (d.type === 'FOOD_SAFETY' ? 'chung-nhan-attp' : 'giay-phep-kinh-doanh') + '-mau.pdf',
      mimeType: 'application/pdf',
      size: pdf.length,
      uploadedAt: new Date(),
    });
  }
  return out;
}

export async function seedData(db: Database, password: string) {
  const hash = await hashPassword(password);
  const admin = await db.users.findOneAndUpdate(
    { email: 'admin@voucher.local' },
    { $setOnInsert: { fullName: 'Quản trị viên', role: Role.ADMIN, active: true, passwordHash: hash } },
    { upsert: true, returnDocument: 'after' },
  );
  const owner = await db.users.findOneAndUpdate(
    { email: 'owner@voucher.local' },
    {
      $setOnInsert: { fullName: 'Chủ thương hiệu', role: Role.BRAND_OWNER, active: true, passwordHash: hash },
    },
    { upsert: true, returnDocument: 'after' },
  );
  let brand = await db.brands.findOneAndUpdate(
    { ownerId: owner._id, name: 'Vouch Coffee — mẫu' },
    {
      $setOnInsert: {
        description: 'Thương hiệu mẫu để kiểm thử; không đại diện cửa hàng kinh doanh thật.',
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: admin._id,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!brand.documents?.length)
    brand = (await db.brands.findByIdAndUpdate(
      brand._id,
      { $set: { documents: await sampleDocuments(brand.name), submittedAt: new Date() } },
      { returnDocument: 'after' },
    ))!;
  // A second brand still in DRAFT lets the demo show the owner submitting licenses for review.
  const draftBrand = await db.brands.findOneAndUpdate(
    { ownerId: owner._id, name: 'Trà Sữa Mây — mẫu' },
    {
      $setOnInsert: {
        description: 'Thương hiệu mới, chờ chủ sở hữu nộp giấy phép kinh doanh và chứng nhận ATTP.',
        status: 'DRAFT',
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const store = await db.stores.findOneAndUpdate(
    { brandId: brand._id, name: 'Vouch Quận 1 — mẫu' },
    {
      $setOnInsert: {
        address: 'Điểm mẫu Quận 1, TP.HCM',
        active: true,
        location: { type: 'Point', coordinates: [106.7, 10.776] },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const secondStore = await db.stores.findOneAndUpdate(
    { brandId: brand._id, name: 'Vouch Bình Thạnh — mẫu' },
    {
      $setOnInsert: {
        address: 'Điểm mẫu Bình Thạnh, TP.HCM',
        active: true,
        location: { type: 'Point', coordinates: [106.72, 10.82] },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const staff = await db.users.findOneAndUpdate(
    { email: 'staff@voucher.local' },
    {
      $setOnInsert: {
        fullName: 'Nhân viên cửa hàng',
        role: Role.STORE_STAFF,
        active: true,
        passwordHash: hash,
        storeIds: [store._id, secondStore._id],
        employeeCode: 'NV-STAFF1',
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  // Second staff member: staff may not confirm their own voucher, so a colleague confirms it.
  const staff2 = await db.users.findOneAndUpdate(
    { email: 'staff2@voucher.local' },
    {
      $setOnInsert: {
        fullName: 'Nhân viên ca 2',
        role: Role.STORE_STAFF,
        active: true,
        passwordHash: hash,
        storeIds: [store._id, secondStore._id],
        employeeCode: 'NV-STAFF2',
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const manager = await db.users.findOneAndUpdate(
    { email: 'manager@voucher.local' },
    {
      $setOnInsert: {
        fullName: 'Quản lý thương hiệu',
        role: Role.BRAND_MANAGER,
        active: true,
        passwordHash: hash,
        brandIds: [brand._id],
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const customer = await db.users.findOneAndUpdate(
    { email: 'customer@voucher.local' },
    { $setOnInsert: { fullName: 'Khách hàng mẫu', role: Role.CUSTOMER, active: true, passwordHash: hash } },
    { upsert: true, returnDocument: 'after' },
  );
  const definitions = [
    {
      title: 'Voucher cà phê 50K',
      voucherType: VoucherType.PREPAID,
      salePrice: 30000,
      faceValue: 50000,
      staffDiscountPercent: 20,
    },
    { title: 'Voucher đồ uống 70K', voucherType: VoucherType.PREPAID, salePrice: 45000, faceValue: 70000 },
    {
      title: 'Combo hai ly trà',
      voucherType: VoucherType.COMBO,
      salePrice: 50000,
      faceValue: 80000,
      comboItems: 'Hai ly trà size M',
      staffDiscountPercent: 30,
    },
    {
      title: 'Combo cà phê và bánh',
      voucherType: VoucherType.COMBO,
      salePrice: 60000,
      faceValue: 90000,
      comboItems: 'Một cà phê và một bánh ngọt',
    },
    {
      title: 'Mã giảm 30% đồ uống',
      voucherType: VoucherType.DISCOUNT,
      salePrice: 30000,
      faceValue: 100000,
      discountType: 'PERCENT' as const,
      discountValue: 30,
      maxDiscount: 100000,
    },
    {
      title: 'Voucher đồ uống 120K',
      voucherType: VoucherType.PREPAID,
      salePrice: 80000,
      faceValue: 120000,
      staffDiscountPercent: 15,
    },
    {
      title: 'Voucher nhóm bạn 150K',
      voucherType: VoucherType.PREPAID,
      salePrice: 100000,
      faceValue: 150000,
    },
  ];
  const campaigns = [];
  for (const item of definitions) {
    campaigns.push(
      await db.campaigns.findOneAndUpdate(
        { brandId: brand._id, title: item.title },
        {
          $setOnInsert: {
            staffDiscountPercent: 0,
            ...item,
            category: 'FOOD_DRINK',
            description: 'Dữ liệu mẫu cho project voucher độc lập.',
            totalQuantity: 100,
            soldQuantity: 0,
            reservedQuantity: 0,
            limitPerUser: 5,
            saleStartAt: new Date(Date.now() - DAY),
            saleEndAt: new Date(Date.now() + 30 * DAY),
            voucherExpireAt: new Date(Date.now() + 45 * DAY),
            storeIds: [store._id, secondStore._id],
            status: CampaignStatus.PUBLISHED,
            approvedBy: admin._id,
          },
        },
        { upsert: true, returnDocument: 'after' },
      ),
    );
  }
  return { admin, owner, manager, staff, staff2, customer, brand, draftBrand, store, secondStore, campaigns };
}
