# Quy ước kết nối web/mobile mới

- Backend local: http://127.0.0.1:4100/api.
- Android Emulator: http://10.0.2.2:4100/api.
- Swagger: http://127.0.0.1:4100/docs.
- Thành công: { "data": ..., "error": null, "meta": null }.
- Lỗi: { "data": null, "error": { "statusCode": 400, "message": "..." }, "meta": null }. message có thể là mảng khi validate DTO.
- ID bản ghi là MongoDB ObjectId 24 ký tự. idempotencyKey checkout là UUID v4.
- Tiền dùng VND nguyên; thời gian ISO-8601 kèm timezone.
- Xác nhận kết quả thanh toán bằng trạng thái đơn từ server.
- Hiện chỉ thanh toán DEMO, không có QR chuyển tiền thật.
- OTP đăng nhập local xuất hiện trong console BE. OTP redeem là mã khác, hạn 60 giây.
- Client xử lý refresh/logout; không đưa JWT_SECRET, OTP_SECRET, khóa Brevo hoặc URI MongoDB vào bundle.
- Client đọc id, không đọc _id. Trong voucher công khai, brandId có thể là object thương hiệu đã populate.
- Tìm kiếm trả data.items, data.total, data.page, data.limit.
- Swagger đang chạy là hợp đồng thực tế. FE/mobile cũ không tự tương thích với backend mới.

Xem [demo API](demo-api.md) và [nghiệp vụ](business-rules.md).
