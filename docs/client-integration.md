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

## API nhiều lượt và vai trò mới

- BRAND_OWNER chỉ xem báo cáo GET /api/brands/:id/reports/overview của mình; BRAND_MANAGER có brandIds mới tạo/sửa/gửi duyệt chiến dịch.
- Admin POST /api/admin/users tạo tài khoản với role và brandIds (manager) hoặc storeIds (staff). PATCH /api/admin/users/:id đổi quyền/phạm vi/khóa tài khoản và thu hồi phiên.
- Các API orders/wallet/refunds của bản thân và redeem/token mở cho mọi role đang hoạt động.
- Sau thanh toán mỗi đơn nhận một voucher: usageLimit=quantity, usedCount=0, remainingUses=quantity, totalPrice=totalAmount.
- Chi tiết ví trả redemptions (mảng), không còn redemption đơn lẻ.
- POST /api/redeem bắt buộc idempotencyKey UUID v4. Một lần người dùng bấm xác nhận = một key; khi timeout/retry phải dùng lại key. Camera phải dừng sau khi nhận QR và chờ xác nhận, không tạo key mới cho từng frame.
- Cùng QR/OTP còn hạn có thể xác nhận nhiều lần; mỗi lần một vé. Hết 60 giây, người mua làm mới mã trên cùng voucher; số lượt không thay đổi.
- Render rõ còn X/Y lượt, không đánh dấu USED sau lần đầu nếu còn lượt.
- Staff có thể mua nhưng phải nhờ staff khác xác nhận voucher của mình.
- Hoàn toàn bộ gói chưa dùng lượt nào; số tiền là totalPrice. Chưa hỗ trợ hoàn phần còn lại của gói đã dùng.
