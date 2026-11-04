# Voucher Platform — project độc lập

Backend mới dùng **NestJS 11 + TypeScript + MongoDB 8 + Mongoose 9**. Project nằm riêng với `Web_BE`; không đọc database, tài khoản, khóa email hoặc khóa thanh toán của project cũ.

```text
voucher-platform/
  backend/       API và cấu hình MongoDB
  web/           Khung web quản trị/chủ thương hiệu/nhân viên
  mobile/        Khung app khách hàng React Native
  docs/          Database, nghiệp vụ, hướng dẫn demo
  .github/       CI cho backend
```

Đã tạo khung thư mục web/mobile; chưa triển khai hoặc kết nối giao diện. Xem [cấu trúc repo](docs/repository-structure.md), [Web](web/README.md), [Mobile](mobile/README.md) và [quy ước đóng góp](CONTRIBUTING.md).

## Chạy trên máy hiện tại

Terminal 1 — MongoDB (giữ terminal mở):

```powershell
cd "D:\voucher-platform\backend"
npm.cmd run db:local
```

Terminal 2 — API (giữ terminal mở):

```powershell
cd "D:\voucher-platform\backend"
npm.cmd run start:dev
```

MongoDB hiện đã được cài binary riêng trong `.cache/mongodb`; dữ liệu bền vững nằm trong `backend/.data/mongo`. Khởi động lại BE hoặc MongoDB với cùng thư mục không xóa dữ liệu. Không chạy hai tiến trình MongoDB trên cùng thư mục/cổng.

- Swagger: http://127.0.0.1:4100/docs
- API: http://127.0.0.1:4100/api
- Health: http://127.0.0.1:4100/api/health
- MongoDB Compass: `mongodb://127.0.0.1:27018/voucher_platform?replicaSet=rs0&directConnection=true`
- Android Emulator khi kết nối sau: `http://10.0.2.2:4100/api`.

## Tài khoản mẫu

Đã seed ba tài khoản, mật khẩu local chung **`Voucher@123`** (giá trị `SEED_PASSWORD` trong `.env`):

| Email | Vai trò |
|---|---|
| admin@voucher.local | ADMIN |
| owner@voucher.local | BRAND_OWNER |
| staff@voucher.local | STORE_STAFF |

Khách hàng dùng email + OTP, không dùng mật khẩu. Mặc định `MAIL_PROVIDER=local`: OTP xuất hiện trong terminal BE, **không gửi email thật**. API không trả OTP trong response. Muốn gửi email thật: đặt `MAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `MAIL_FROM_EMAIL` là sender đã xác thực rồi khởi động lại BE. Không đưa khóa vào GitHub.

Seed có 1 thương hiệu, 2 cửa hàng với tọa độ mẫu TP.HCM và 7 chiến dịch giá 30K–100K. Đây là dữ liệu giả để kiểm thử, không phải cửa hàng đã được xác minh. Chạy lại seed bằng `npm.cmd run db:seed`; chỉ thêm bản ghi chưa có, không ghi đè dữ liệu đã sửa.

## Cài ở máy khác

Yêu cầu Node.js 22.15 trở lên, npm và mạng để tải thư viện/binary MongoDB lần đầu.

```powershell
cd backend
npm.cmd ci
Copy-Item .env.example .env
```

Trong `.env`, thay `JWT_SECRET` và `OTP_SECRET` bằng hai chuỗi ngẫu nhiên khác nhau, mỗi chuỗi ít nhất 32 ký tự; đặt `SEED_PASSWORD` ít nhất 8 ký tự. Có thể tạo từng secret bằng `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

Sau đó chạy `db:local`, chạy `db:seed` ở terminal khác rồi `start:dev`. `.env` trên máy hiện tại đã được tạo với secret ngẫu nhiên.

Nếu dùng Docker thay cho `db:local`: `docker compose up -d --wait` trong thư mục `backend`. Docker chưa được kiểm thử trên máy này vì Docker Engine chưa chạy. Chọn một trong hai cách vì chúng dùng chung cổng 27018 và có nơi lưu dữ liệu khác nhau.

MongoDB Atlas cũng dùng được: đổi `MONGODB_URI` sang URI của cluster riêng. Không dùng MongoDB standalone vì nghiệp vụ cần transaction. Bản local chỉ bind MongoDB vào loopback, không có xác thực DB; khi triển khai ngoài máy cá nhân cần cluster có tài khoản, TLS và phân quyền.

## Chức năng đã triển khai

- JWT + refresh token luân phiên + logout thu hồi phiên; phân quyền 4 vai trò.
- Đăng nhập khách hàng OTP, tự tạo CUSTOMER lần đầu; giới hạn gửi lại, số lần nhập và thời hạn mã.
- Admin tạo chủ thương hiệu; chủ thương hiệu tạo cửa hàng và nhân viên.
- Duyệt thương hiệu, đình chỉ/khôi phục; chiến dịch nháp → chờ duyệt → được duyệt/mở bán, tạm dừng và duyệt lại sau chỉnh sửa.
- Ba loại voucher DISCOUNT/PREPAID/COMBO, kiểm tra giá và thời gian, cửa hàng áp dụng.
- Danh mục, tìm kiếm, sắp xếp, phân trang, lọc khoảng cách bằng GeoJSON/2dsphere.
- Đơn hàng cho từng loại voucher, giữ chỗ 15 phút, giới hạn mua, hủy/đơn hết hạn trả tồn kho.
- Thanh toán **DEMO**, xác nhận lặp không cấp trùng; ví chỉ có voucher đã thanh toán.
- Sinh QR payload/OTP dùng voucher có hiệu lực 60 giây; chọn cửa hàng làm việc; chỉ sử dụng thành công một lần.
- Yêu cầu hoàn voucher, khóa khi đang hoàn, admin xác nhận/từ chối thủ công; báo cáo doanh thu và lịch sử quét.

## Phạm vi bản hiện tại

Đây là backend cho luồng chính, **chưa phải bản chuyển toàn bộ tính năng của hệ thống cũ**. Chưa có payOS thật/webhook, đối soát thương hiệu, thông báo đẩy, yêu thích, đánh giá, upload ảnh, kích hoạt tài khoản/reset mật khẩu qua email. Hoàn tiền chỉ ghi nhận xác nhận thủ công/demo, không gọi ngân hàng. Không bật thanh toán demo ở production.

API giữ dạng envelope `{ data, error, meta }` và phần lớn đường dẫn của luồng chính; **không tương thích hoàn toàn với FE/mobile cũ**: MongoDB dùng ObjectId 24 ký tự thay UUID, một số trường và phân trang khác. Cần nối adapter/client mới khi làm FE/mobile.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run test:persistence
```

Test chức năng khởi chạy replica set tạm riêng rồi xóa database test khi kết thúc. Không kết nối database local đang demo. Mail được giả lập trong test, không gửi email; giới hạn tốc độ HTTP được thay thế trong fixture chức năng để chạy nhiều ca liên tiếp; cooldown/số lần thử OTP trong database vẫn được kiểm tra.

Các file cấu hình mẫu, mã nguồn và `package-lock.json` có thể đưa lên GitHub. `.env`, dữ liệu `.data`, binary `.cache`, `node_modules` và `dist` đã nằm trong `.gitignore`. Repository: [MMAProject_VoucherPlatformFE](https://github.com/cudatbusua/MMAProject_VoucherPlatformFE). Khung hiện gồm backend, web và mobile trong cùng repo.

Xem [kịch bản Swagger](docs/demo-api.md), [thiết kế database](docs/database.md), [quy tắc nghiệp vụ](docs/business-rules.md).
