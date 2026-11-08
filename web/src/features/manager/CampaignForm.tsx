import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { fromLocalInput, toLocalInput, typeLabel } from '../../components/format';
import { Alert, Field, Modal, useAction } from '../../components/ui';
import { api } from '../../services/api';
import type { Campaign, CampaignInput, Store, VoucherType } from '../../types';

const DAY = 86400000;

function defaults(): Record<string, string> {
  const start = new Date(Date.now() + 5 * 60000);
  const end = new Date(start.getTime() + 30 * DAY);
  const expire = new Date(end.getTime() + 30 * DAY);
  return {
    saleStartAt: toLocalInput(start.toISOString()),
    saleEndAt: toLocalInput(end.toISOString()),
    voucherExpireAt: toLocalInput(expire.toISOString()),
  };
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
  const [saleStartAt, setSaleStartAt] = useState(campaign ? toLocalInput(campaign.saleStartAt) : init.saleStartAt);
  const [saleEndAt, setSaleEndAt] = useState(campaign ? toLocalInput(campaign.saleEndAt) : init.saleEndAt);
  const [voucherExpireAt, setVoucherExpireAt] = useState(
    campaign ? toLocalInput(campaign.voucherExpireAt) : init.voucherExpireAt,
  );
  const [storeIds, setStoreIds] = useState<string[]>(campaign?.storeIds ?? stores.filter((s) => s.active).map((s) => s.id));
  const { busy, error, setError, run } = useAction();
  const live = campaign && ['APPROVED', 'PUBLISHED', 'PAUSED'].includes(campaign.status);

  function build(): CampaignInput | string {
    const n = (v: string) => Number(v);
    const sale = n(salePrice);
    const face = n(faceValue);
    if (!Number.isInteger(sale) || !Number.isInteger(face) || sale <= 0 || sale >= face)
      return 'Giá bán phải là số nguyên dương và nhỏ hơn giá trị voucher.';
    const start = new Date(saleStartAt).getTime();
    const end = new Date(saleEndAt).getTime();
    const exp = new Date(voucherExpireAt).getTime();
    if (!(start < end)) return 'Thời gian bắt đầu bán phải trước thời gian kết thúc.';
    if (exp < end + 10 * DAY) return 'Hạn sử dụng phải sau ngày kết thúc bán ít nhất 10 ngày.';
    if (!storeIds.length) return 'Chọn ít nhất một cửa hàng áp dụng.';
    const dto: CampaignInput = {
      title: title.trim(),
      voucherType,
      salePrice: sale,
      faceValue: face,
      totalQuantity: n(totalQuantity),
      limitPerUser: n(limitPerUser),
      saleStartAt: fromLocalInput(saleStartAt),
      saleEndAt: fromLocalInput(saleEndAt),
      voucherExpireAt: fromLocalInput(voucherExpireAt),
      storeIds,
    };
    if (category.trim()) dto.category = category.trim();
    if (image.trim()) dto.image = image.trim();
    if (description.trim() || campaign?.description) dto.description = description.trim();
    if (terms.trim() || campaign?.terms) dto.terms = terms.trim();
    if (voucherType === 'DISCOUNT') {
      dto.discountType = discountType;
      dto.discountValue = n(discountValue);
      if (!dto.discountValue || dto.discountValue < 1) return 'Nhập giá trị giảm.';
      if (discountType === 'PERCENT') {
        if (dto.discountValue > 100) return 'Phần trăm giảm từ 1 đến 100.';
        dto.maxDiscount = n(maxDiscount);
        if (!dto.maxDiscount || dto.maxDiscount < 1) return 'Giảm theo % cần mức giảm tối đa.';
      }
    }
    if (voucherType === 'COMBO') {
      if (!comboItems.trim()) return 'Combo cần nội dung gói.';
      dto.comboItems = comboItems.trim();
    }
    return dto;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
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
            <select value={voucherType} onChange={(e) => setVoucherType(e.target.value as VoucherType)}>
              {(Object.keys(typeLabel) as VoucherType[]).map((t) => (
                <option key={t} value={t}>
                  {typeLabel[t]}
                </option>
              ))}
            </select>
          </Field>
          <div />
          <Field label="Giá bán mỗi vé (VND)">
            <input type="number" min={1} step={1} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} required />
          </Field>
          <Field label={voucherType === 'COMBO' ? 'Giá niêm yết gói (VND)' : 'Giá trị voucher (VND)'} hint="Phải lớn hơn giá bán">
            <input type="number" min={1} step={1} value={faceValue} onChange={(e) => setFaceValue(e.target.value)} required />
          </Field>
          {voucherType === 'DISCOUNT' ? (
            <>
              <Field label="Kiểu giảm">
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'AMOUNT' | 'PERCENT')}>
                  <option value="AMOUNT">Số tiền cố định</option>
                  <option value="PERCENT">Phần trăm</option>
                </select>
              </Field>
              <Field label={discountType === 'PERCENT' ? 'Phần trăm giảm (1–100)' : 'Số tiền giảm (VND)'}>
                <input type="number" min={1} step={1} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} required />
              </Field>
              {discountType === 'PERCENT' ? (
                <Field label="Giảm tối đa (VND)">
                  <input type="number" min={1} step={1} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} required />
                </Field>
              ) : null}
            </>
          ) : null}
          {voucherType === 'COMBO' ? (
            <div className="full">
              <Field label="Nội dung combo">
                <textarea value={comboItems} onChange={(e) => setComboItems(e.target.value)} maxLength={2000} required />
              </Field>
            </div>
          ) : null}
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
