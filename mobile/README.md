# Voucher Mobile — app khách hàng

React Native + Expo SDK 58 + Expo Router + TypeScript. **Chỉ dành cho role CUSTOMER.** Tài khoản ADMIN/BRAND_OWNER/BRAND_MANAGER/STORE_STAFF đăng nhập sẽ bị từ chối và được hướng dẫn dùng web.

## Chạy

Yêu cầu backend đang chạy (xem README gốc).

```powershell
cd mobile
npm.cmd install
npx expo start            # nhấn a để mở Android Emulator, w để mở bản web
```

- Android Emulator tự gọi `http://10.0.2.2:4100/api`; web/iOS simulator gọi `http://127.0.0.1:4100/api`.
- Thiết bị thật: tạo `mobile/.env` với `EXPO_PUBLIC_API_URL=http://<IP-LAN-máy-chạy-BE>:4100/api`.
- Chạy trên Expo Go (không cần build native). Kiểm tra kiểu: `npm.cmd run typecheck`.

## Chức năng

| Tab / màn hình | API |
|---|---|
| Đăng nhập **chỉ bằng OTP email** (khách hàng không có mật khẩu; API `auth/login` từ chối role CUSTOMER) | `auth/otp/request`, `auth/otp/verify`, `auth/refresh` |
| Khám phá: tìm kiếm, danh mục, sắp xếp, “Gần tôi” theo bán kính, cuộn trang | `categories`, `vouchers` |
| Chi tiết voucher, chọn số lượng, thêm giỏ / mua ngay | `vouchers/:id` |
| Giỏ hàng (lưu trên máy) → mỗi dòng tạo một đơn, có `idempotencyKey` | `orders` |
| Đơn hàng: đếm ngược giữ chỗ 15 phút, thanh toán DEMO, hủy | `orders/me`, `orders/:id`, `simulate-payment`, `cancel` |
| Ví: lọc trạng thái, hiển thị “Còn X/Y lượt” | `wallet` |
| Chi tiết voucher trong ví: tạo QR + OTP 60 giây, làm mới mã, tự cập nhật lượt khi nhân viên xác nhận, lịch sử dùng, yêu cầu hoàn | `wallet/:id`, `redeem/token`, `refunds` |
| Tài khoản: sửa họ tên, danh sách yêu cầu hoàn, đăng xuất | `users/me`, `refunds/me`, `auth/logout` |

## Cấu trúc

- `src/app/` — màn hình (Expo Router): `(auth)/login`, `(tabs)/…`, `campaign/[id]`, `order/[id]`, `wallet/[id]`, `refunds`.
- `src/components/` — UI dùng chung, định dạng tiền/ngày, QR (SVG), hook đếm ngược.
- `src/services/` — client API (envelope `{data,error}`, tự refresh token một lần cho mọi request), lưu refresh token bằng SecureStore.
- `src/state/` — phiên đăng nhập, giỏ hàng.
- `src/types/` — kiểu dữ liệu theo schema backend.
