import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { fromLocalInput, money, toLocalInput, typeLabel } from '../../components/format';
import {
  MAX_STAFF_DISCOUNT_PERCENT,
  minSalePrice,
  priceErrors,
  staffUnitPrice,
} from '../../components/priceRules';
import { Alert, Field, Modal, useAction } from '../../components/ui';
import { api } from '../../services/api';
import type { Campaign, CampaignInput, Store, VoucherType } from '../../types';

const DAY = 86400000;

function defaults(): Record<string, string> {
  // Starts now (minute precision) so an approved campaign is on sale immediately; editable for scheduling.
  const start = new Date(Math.floor(Date.now() / 60000) * 60000);
  const end = new Date(start.getTime() + 30 * DAY);
  const expire = new Date(end.getTime() + 30 * DAY);
  return {
    saleStartAt: toLocalInput(start.toISOString()),
    saleEndAt: toLocalInput(end.toISOString()),
    voucherExpireAt: toLocalInput(expire.toISOString()),
  };
}

const FieldError = ({ text }: { text?: string }) => (text ? <span className="field-error">{text}</span> : null);
function PriceField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <Field label={label} hint={error ? undefined : hint}>
      {children}
      <FieldError text={error} />
    </Field>
  );
}

export function CampaignForm({
  brandId,
  stores,
  campaign,
  onClose,
  onSaved,
}: {
  brandId: string;
  stores: Store[];
  campaign?: Campaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const init = useMemo(defaults, []);
  const [title, setTitle] = useState(campaign?.title ?? '');
  const [category, setCategory] = useState(campaign?.category ?? '');
  const [image, setImage] = useState(campaign?.image ?? '');
  const [description, setDescription] = useState(campaign?.description ?? '');
  const [terms, setTerms] = useState(campaign?.terms ?? '');
  const [voucherType, setVoucherType] = useState<VoucherType>(campaign?.voucherType ?? 'PREPAID');
  const [salePrice, setSalePrice] = useState(String(campaign?.salePrice ?? ''));
  const [faceValue, setFaceValue] = useState(String(campaign?.faceValue ?? ''));
  const [discountType, setDiscountType] = useState<'AMOUNT' | 'PERCENT'>(campaign?.discountType ?? 'AMOUNT');
  const [discountValue, setDiscountValue] = useState(String(campaign?.discountValue ?? ''));
  const [maxDiscount, setMaxDiscount] = useState(String(campaign?.maxDiscount ?? ''));
  const [comboItems, setComboItems] = useState(campaign?.comboItems ?? '');
  const [totalQuantity, setTotalQuantity] = useState(String(campaign?.totalQuantity ?? '100'));
  const [limitPerUser, setLimitPerUser] = useState(String(campaign?.limitPerUser ?? '5'));
  const [staffPct, setStaffPct] = useState(String(campaign?.staffDiscountPercent ?? '0'));
  const [saleStartAt, setSaleStartAt] = useState(campaign ? toLocalInput(campaign.saleStartAt) : init.saleStartAt);
  const [saleEndAt, setSaleEndAt] = useState(campaign ? toLocalInput(campaign.saleEndAt) : init.saleEndAt);
  const [voucherExpireAt, setVoucherExpireAt] = useState(
    campaign ? toLocalInput(campaign.voucherExpireAt) : init.voucherExpireAt,
  );
  const [storeIds, setStoreIds] = useState<string[]>(campaign?.storeIds ?? stores.filter((s) => s.active).map((s) => s.id));
  const [submitted, setSubmitted] = useState(!!campaign);
  const { busy, error, setError, run } = useAction();
  const live = campaign && ['APPROVED', 'PUBLISHED', 'PAUSED'].includes(campaign.status);
  const sold = campaign ? campaign.soldQuantity + campaign.reservedQuantity > 0 : false;

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v));
  const isDiscount = voucherType === 'DISCOUNT';
  // DISCOUNT value is derived: amount off, or the cap for percentage discounts.
  const effectiveFace = isDiscount ? (discountType === 'AMOUNT' ? n(discountValue) : n(maxDiscount)) : n(faceValue);
  const prices = {
    voucherType,
    salePrice: n(salePrice),
    faceValue: effectiveFace,
    discountType,
    discountValue: n(discountValue),
    maxDiscount: n(maxDiscount),
    staffDiscountPercent: n(staffPct || '0'),
  };
  const errors = priceErrors(prices);
  const raw: Record<keyof typeof errors, string> = {
    voucherType: voucherType,
    salePrice,
    faceValue: isDiscount ? (discountType === 'AMOUNT' ? discountValue : maxDiscount) : faceValue,
    discountType,
    discountValue,
    maxDiscount,
    staffDiscountPercent: staffPct,
  };
  // Errors appear for fields the user already filled, and for all fields after a save attempt.
  const show = (k: keyof typeof errors) => (submitted || raw[k].trim() !== '' ? errors[k] : undefined);
  const staffPrice =
    !errors.salePrice && prices.staffDiscountPercent > 0 ? staffUnitPrice(prices.salePrice, prices.staffDiscountPercent) : null;

  function build(): CampaignInput | string {
    const firstError = Object.values(errors)[0];
    if (firstError) return 'Kiểm tra lại giá: ' + firstError;
    const start = new Date(saleStartAt).getTime();
    const end = new Date(saleEndAt).getTime();
    const exp = new Date(voucherExpireAt).getTime();
    if (!(start < end)) return 'Thời gian bắt đầu bán phải trước thời gian kết thúc.';
    if (exp < end + 10 * DAY) return 'Hạn sử dụng phải sau ngày kết thúc bán ít nhất 10 ngày.';
    if (!storeIds.length) return 'Chọn ít nhất một cửa hàng áp dụng.';
    if (voucherType === 'COMBO' && !comboItems.trim()) return 'Combo cần nội dung gói.';
    const dto: CampaignInput = {
      title: title.trim(),
      voucherType,
      salePrice: prices.salePrice,
      faceValue: effectiveFace,
      totalQuantity: Number(totalQuantity),
      limitPerUser: Number(limitPerUser),
      staffDiscountPercent: prices.staffDiscountPercent,
      saleStartAt: fromLocalInput(saleStartAt),
      saleEndAt: fromLocalInput(saleEndAt),
      voucherExpireAt: fromLocalInput(voucherExpireAt),
      storeIds,
    };
    if (category.trim()) dto.category = category.trim();
    if (image.trim()) dto.image = image.trim();
    if (description.trim() || campaign?.description) dto.description = description.trim();
    if (terms.trim() || campaign?.terms) dto.terms = terms.trim();
    if (isDiscount) {
      dto.discountType = discountType;
      dto.discountValue = prices.discountValue;
      if (discountType === 'PERCENT') dto.maxDiscount = prices.maxDiscount;
    }
    if (voucherType === 'COMBO') dto.comboItems = comboItems.trim();
    return dto;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const dto = build();
    if (typeof dto === 'string') {
      setError(dto);
      return;
    }
    const ok = await run('save', async () => {
      if (campaign) await api.updateCampaign(campaign.id, dto);
      else await api.createCampaign(brandId, dto);
    });
    if (ok) onSaved();
  }

  const toggleStore = (id: string) =>
    setStoreIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <Modal title={campaign ? 'Sửa chiến dịch' : 'Tạo chiến dịch'} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        {live ? (
          <Alert tone="warning">Chiến dịch đã được duyệt — lưu thay đổi sẽ đưa chiến dịch về trạng thái Chờ duyệt lại.</Alert>
        ) : null}
        {sold ? (
          <Alert tone="info">Đã có vé bán/giữ chỗ: không được đổi loại voucher hoặc giảm giá trị, quyền lợi.</Alert>
        ) : null}
        <div className="form-grid">
          <div className="full">
            <Field label="Tên chiến dịch">
              <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={200} required />
            </Field>
          </div>
          <Field label="Danh mục" hint="Ví dụ: Cà phê, Ăn uống… (mặc định OTHER)">
            <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Ảnh (URL)">
            <input type="url" value={image} onChange={(e) => setImage(e.target.value)} />
          </Field>
          <Field label="Loại voucher">
            <select value={voucherType} onChange={(e) => setVoucherType(e.target.value as VoucherType)} disabled={sold}>
              {(Object.keys(typeLabel) as VoucherType[]).map((t) => (
                <option key={t} value={t}>
                  {typeLabel[t]}
                </option>
              ))}
            </select>
          </Field>
          {isDiscount ? (
            <Field label="Kiểu giảm">
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'AMOUNT' | 'PERCENT')} disabled={sold}>
                <option value="AMOUNT">Số tiền cố định</option>
                <option value="PERCENT">Phần trăm</option>
              </select>
            </Field>
          ) : (
            <div />
          )}

          {isDiscount ? (
            <>
              <PriceField
                label={discountType === 'PERCENT' ? 'Phần trăm giảm (1–100)' : 'Số tiền giảm (VND)'}
                hint={discountType === 'AMOUNT' ? 'Bội số 1.000đ; cũng là giá trị voucher' : undefined}
                error={show('discountValue')}
              >
                <input type="number" min={1} step={discountType === 'PERCENT' ? 1 : 1000} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} required />
              </PriceField>
              {discountType === 'PERCENT' ? (
                <PriceField label="Giảm tối đa (VND)" hint="Bội số 1.000đ; cũng là giá trị voucher" error={show('maxDiscount')}>
                  <input type="number" min={1000} step={1000} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} required />
                </PriceField>
              ) : (
                <div />
              )}
              <PriceField label="Giá trị voucher (tự tính)" error={discountType === 'AMOUNT' ? show('faceValue') : undefined}>
                <input className="read-only" value={Number.isFinite(effectiveFace) ? money(effectiveFace) : '—'} readOnly tabIndex={-1} />
              </PriceField>
            </>
          ) : (
            <PriceField
              label={voucherType === 'COMBO' ? 'Giá niêm yết gói (VND)' : 'Mệnh giá voucher (VND)'}
              hint="Bội số 1.000đ"
              error={show('faceValue')}
            >
              <input type="number" min={1000} step={1000} value={faceValue} onChange={(e) => setFaceValue(e.target.value)} required />
            </PriceField>
          )}
          <PriceField
            label="Giá bán mỗi vé (VND)"
            hint={
              Number.isFinite(effectiveFace) && effectiveFace > 0
                ? 'Từ ' + money(minSalePrice(effectiveFace)) + ' đến dưới ' + money(effectiveFace) + ' (giảm tối đa 70%)'
                : 'Nhỏ hơn giá trị, giảm tối đa 70%'
            }
            error={show('salePrice')}
          >
            <input type="number" min={1000} step={1000} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} required />
          </PriceField>

          {voucherType === 'COMBO' ? (
            <div className="full">
              <Field label="Nội dung combo">
                <textarea value={comboItems} onChange={(e) => setComboItems(e.target.value)} maxLength={2000} required />
              </Field>
            </div>
          ) : null}

          <PriceField
            label={'Ưu đãi nhân viên (%) · 0–' + MAX_STAFF_DISCOUNT_PERCENT}
            hint="Nhân viên thương hiệu nhập mã nhân viên khi mua để được giá này. 0 = không áp dụng."
            error={show('staffDiscountPercent')}
          >
            <input type="number" min={0} max={MAX_STAFF_DISCOUNT_PERCENT} step={1} value={staffPct} onChange={(e) => setStaffPct(e.target.value)} />
          </PriceField>
          <div className="price-preview" style={{ alignSelf: 'end' }}>
            <div>
              <span className="muted small">Giá trị</span>
              <strong>{Number.isFinite(effectiveFace) ? money(effectiveFace) : '—'}</strong>
            </div>
            <div>
              <span className="muted small">Giá bán</span>
              <strong>{Number.isFinite(prices.salePrice) ? money(prices.salePrice) : '—'}</strong>
            </div>
            <div>
              <span className="muted small">Giá nhân viên</span>
              <strong>{staffPrice !== null ? money(staffPrice) : 'Không áp dụng'}</strong>
            </div>
          </div>

          <Field label="Số lượng phát hành">
            <input type="number" min={1} step={1} value={totalQuantity} onChange={(e) => setTotalQuantity(e.target.value)} required />
          </Field>
          <Field label="Giới hạn mỗi người (1–100)">
            <input type="number" min={1} max={100} step={1} value={limitPerUser} onChange={(e) => setLimitPerUser(e.target.value)} required />
          </Field>
          <Field label="Bắt đầu bán">
            <input type="datetime-local" value={saleStartAt} onChange={(e) => setSaleStartAt(e.target.value)} required />
          </Field>
          <Field label="Kết thúc bán">
            <input type="datetime-local" value={saleEndAt} onChange={(e) => setSaleEndAt(e.target.value)} required />
          </Field>
          <Field label="Hạn sử dụng voucher" hint="Ít nhất 10 ngày sau khi kết thúc bán">
            <input type="datetime-local" value={voucherExpireAt} onChange={(e) => setVoucherExpireAt(e.target.value)} required />
          </Field>
          <div />
          <div className="full">
            <Field label="Cửa hàng áp dụng">
              <div className="checks">
                {stores.filter((s) => s.active).map((s) => (
                  <label key={s.id}>
                    <input type="checkbox" checked={storeIds.includes(s.id)} onChange={() => toggleStore(s.id)} />
                    {s.name} <span className="muted small">· {s.address}</span>
                  </label>
                ))}
                {!stores.some((s) => s.active) ? <span className="muted small">Chưa có cửa hàng hoạt động — tạo cửa hàng trước.</span> : null}
              </div>
            </Field>
          </div>
          <div className="full">
            <Field label="Mô tả">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
            </Field>
          </div>
          <div className="full">
            <Field label="Điều kiện sử dụng">
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={5000} />
            </Field>
          </div>
        </div>
        <Alert>{error}</Alert>
        <div className="row gap" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn" disabled={!!busy}>
            {busy ? 'Đang lưu…' : campaign ? 'Lưu thay đổi' : 'Tạo bản nháp'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
