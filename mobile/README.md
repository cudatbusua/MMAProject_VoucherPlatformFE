# Voucher Mobile

Khung app khách hàng dự kiến dùng React Native + Expo + TypeScript. Chưa khởi tạo Expo, cài thư viện hoặc triển khai màn hình; thư mục này chưa có lệnh chạy.

- src/app/: điều hướng và màn hình khi khởi tạo Expo Router.
- src/components/: giao diện dùng chung.
- src/features/: OTP, khám phá, giỏ hàng, đơn hàng, ví, QR/OTP sử dụng.
- src/services/: client API.
- src/state/: phiên và giỏ hàng.
- src/types/: kiểu dữ liệu.
- assets/: ảnh và font.

Luồng: email → OTP → chọn voucher → giỏ hàng → tạo đơn từng loại → thanh toán demo → ví → QR/OTP sử dụng.

Android Emulator gọi http://10.0.2.2:4100/api. Thiết bị thật cần địa chỉ LAN của máy chạy BE.

Xem [quy ước kết nối](../docs/client-integration.md).
