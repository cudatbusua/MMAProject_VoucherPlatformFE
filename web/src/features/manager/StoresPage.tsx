import { useState } from 'react';
import type { FormEvent } from 'react';
import { BrandPicker, useMyBrand } from '../../components/useMyBrand';
import { Alert, Badge, Empty, Field, Loadable, Modal, PageHeader, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { Store } from '../../types';

export function StoresPage() {
  const state = useMyBrand();
  const stores = useLoad(() => (state.brandId ? api.stores(state.brandId) : Promise.resolve([])), [state.brandId]);
  const [form, setForm] = useState<{ store?: Store } | null>(null);
  const { busy, error, run } = useAction();

  const toggle = (s: Store) =>
    run(s.id, async () => {
      await api.updateStore(s.id, { active: !s.active });
      await stores.reload();
    });

  return (
    <div className="stack">
      <PageHeader
        title="Cửa hàng"
        subtitle="Tọa độ dùng để khách tìm voucher gần họ trên ứng dụng."
        actions={
          <>
            <BrandPicker state={state} />
            <button className="btn" disabled={!state.brandId} onClick={() => setForm({})}>
              + Thêm cửa hàng
            </button>
          </>
        }
      />
      <Alert>{error}</Alert>
      <Loadable loading={stores.loading && !stores.data} error={stores.error}>
        {stores.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cửa hàng</th><th>Địa chỉ</th><th>Tọa độ</th><th>Trạng thái</th><th className="right">Thao tác</th></tr>
              </thead>
              <tbody>
                {stores.data.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td className="small">{s.address}</td>
                    <td className="mono small">{s.location.coordinates[1].toFixed(5)}, {s.location.coordinates[0].toFixed(5)}</td>
                    <td>{s.active ? <Badge tone="success">Hoạt động</Badge> : <Badge>Đã đóng</Badge>}</td>
                    <td className="right">
                      <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setForm({ store: s })}>Sửa</button>
                        <button className={'btn btn-sm ' + (s.active ? 'btn-danger' : 'btn-success')} disabled={!!busy} onClick={() => void toggle(s)}>
                          {s.active ? 'Đóng' : 'Mở lại'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Chưa có cửa hàng.</Empty>
        )}
      </Loadable>
      {form && state.brandId ? (
        <StoreForm
          brandId={state.brandId}
          store={form.store}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void stores.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function StoreForm({ brandId, store, onClose, onSaved }: { brandId: string; store?: Store; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(store?.name ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [lat, setLat] = useState(String(store?.location.coordinates[1] ?? '10.776'));
  const [lng, setLng] = useState(String(store?.location.coordinates[0] ?? '106.7'));
  const { busy, error, setError, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setError('Tọa độ không hợp lệ.');
      return;
    }
    const dto = { name: name.trim(), address: address.trim(), latitude, longitude };
    const ok = await run('save', () => (store ? api.updateStore(store.id, dto) : api.createStore(brandId, dto)));
    if (ok) onSaved();
  }

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
      },
      () => setError('Không lấy được vị trí trình duyệt.'),
    );
  }

  return (
    <Modal title={store ? 'Sửa cửa hàng' : 'Thêm cửa hàng'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Tên cửa hàng">
          <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={150} required />
        </Field>
        <Field label="Địa chỉ">
          <input value={address} onChange={(e) => setAddress(e.target.value)} minLength={5} maxLength={300} required />
        </Field>
        <div className="form-grid">
          <Field label="Vĩ độ (latitude)">
            <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" required />
          </Field>
          <Field label="Kinh độ (longitude)">
            <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" required />
          </Field>
        </div>
        <button type="button" className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} onClick={useMyLocation}>
          Dùng vị trí hiện tại
        </button>
        <Alert>{error}</Alert>
        <div className="row gap" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy</button>
          <button className="btn" disabled={!!busy}>Lưu</button>
        </div>
      </form>
    </Modal>
  );
}
