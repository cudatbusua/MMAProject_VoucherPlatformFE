# Demo luồng chính qua Swagger

Mở http://127.0.0.1:4100/docs. Mỗi lần đổi vai trò, bấm Authorize và thay accessToken; nhập token thuần, Swagger tự thêm Bearer. JSON response dùng `data`.

## 1. Duyệt chiến dịch từ web

1. POST `/api/auth/login`: manager@voucher.local / Voucher@123. Lấy data.accessToken và Authorize.
2. GET `/api/brands/me` lấy brand.id; GET `/api/brands/{id}/stores` lấy store.id.
3. POST `/api/campaigns/brand/{brandId}`. Ví dụ, thay storeIds và ngày phù hợp hôm demo:

```json
{
  "title": "Combo cà phê buổi sáng",
  "category": "FOOD_DRINK",
  "voucherType": "COMBO",
  "salePrice": 40000,
  "faceValue": 60000,
  "comboItems": "Một cà phê và một bánh",
  "totalQuantity": 100,
  "limitPerUser": 5,
  "saleStartAt": "2026-11-04T00:00:00+07:00",
  "saleEndAt": "2026-12-04T23:59:59+07:00",
  "voucherExpireAt": "2026-12-15T23:59:59+07:00",
  "storeIds": ["THAY_BANG_STORE_ID_24_KY_TU"]
}
```

4. PATCH `/api/campaigns/{id}/submit`.
5. Login admin@voucher.local / Voucher@123, thay token; GET `/api/campaigns/pending`; PATCH `/api/campaigns/{id}/approve`.
6. GET `/api/vouchers` hoặc `/api/vouchers/{id}` thấy chiến dịch nếu đang trong giờ bán. Chiến dịch đã seed sẵn có thể dùng ngay.

## 2. Khách mua và thanh toán demo

1. POST `/api/auth/otp/request` với email của khách. MAIL_PROVIDER=local: xem mã ở terminal BE, không gửi Gmail.
2. POST `/api/auth/otp/verify` với `{ "email": "customer@example.com", "code": "MA_6_SO" }`.
3. Authorize bằng token CUSTOMER.
4. POST `/api/orders`:

```json
{
  "campaignId": "THAY_BANG_CAMPAIGN_ID",
  "quantity": 1,
  "idempotencyKey": "e3c032f7-8d1a-4a85-9f6f-0c6bc3e91834"
}
```

Sinh UUID mới cho lần checkout mới; cùng key là retry cùng một đơn.

5. GET `/api/orders/me`: PENDING. GET `/api/wallet`: chưa có voucher của đơn này.
6. POST `/api/orders/{id}/simulate-payment` với `{ "success": true }`.
7. GET `/api/wallet`: có voucher ACTIVE; đơn FULFILLED. Không có QR chuyển tiền thật trong project này.

## 3. Sử dụng tại cửa hàng

1. Token khách: POST `/api/redeem/token` với `{ "voucherItemId": "ID_TRONG_VI" }`.
2. Lưu otpCode hoặc qrPayload trong response. Hai mã cùng đại diện một voucher, hiệu lực 60 giây.
3. Login staff@voucher.local / Voucher@123 và thay token.
4. GET `/api/redeem/my-stores`, POST `/api/auth/select-store` với `{ "storeId": "ID_CUA_HANG" }`.
5. POST `/api/redeem` với storeId, billAmount và một trong qrPayload/otpCode:

```json
{
  "storeId": "THAY_BANG_STORE_ID",
  "idempotencyKey": "a378c3a1-6d7d-4bf9-a7a0-0ee1c5bef248",
  "otpCode": "MA_6_SO",
  "billAmount": 100000
}
```

6. Kết quả có remainingUses, voucher, redemption và amountDue. Mỗi xác nhận trừ 1 lượt; còn lượt thì ACTIVE, hết lượt mới USED. Retry cùng key trả kết quả cũ; mỗi lượt dùng key mới.
7. Login admin, GET `/api/admin/redemptions` và `/api/admin/reports/overview` để xem kết quả; người mua GET wallet thấy số lượt còn lại, hết lượt mới USED.

## 4. Kiểm tra hoàn và khoảng cách

- Mua thêm một voucher chưa dùng → POST `/api/refunds`; admin xem `/api/refunds/manual-pending`, xác nhận `/confirm-manual` hoặc `/reject`. Voucher đang chờ hoàn không dùng được.
- GET `/api/vouchers?latitude=10.776&longitude=106.7&radiusKm=3` dùng tọa độ gần cửa hàng mẫu. Thử radiusKm=5 hoặc 10; dùng vị trí Mỹ sẽ không có kết quả gần cửa hàng TP.HCM.
- Tạo đơn và chờ hết 15 phút hoặc bấm `/orders/{id}/cancel`; reservation được trả, lịch sử đơn vẫn giữ.
