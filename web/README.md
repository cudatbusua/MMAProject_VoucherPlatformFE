# Voucher Web

Khung cho web ADMIN, BRAND_OWNER và STORE_STAFF. Chưa chọn framework, cài thư viện hoặc triển khai giao diện; thư mục này chưa có lệnh chạy.

- src/components/: giao diện dùng chung.
- src/features/: đăng nhập, thương hiệu, cửa hàng, chiến dịch, quét voucher, báo cáo.
- src/services/: client API và quản lý phiên.
- src/types/: kiểu dữ liệu.
- public/: tài nguyên công khai.

Backend local: http://127.0.0.1:4100/api.
Swagger: http://127.0.0.1:4100/docs.

Web dùng email/mật khẩu. Nhân viên phải chọn cửa hàng làm việc trước khi xác nhận QR/OTP.

Xem [quy ước kết nối](../docs/client-integration.md).
