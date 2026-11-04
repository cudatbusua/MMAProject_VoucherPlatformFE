# Kết quả kiểm tra — 04/11/2026

- `npm run typecheck`: pass.
- `npm run build`: pass.
- `npm test`: 23/23 test chức năng pass trên MongoDB 8.0.15 replica set tạm riêng. Bộ test giữ AccessGuard và truy vấn/transaction thật; thay MailService bằng bộ thu mã trong RAM, thay HTTP ThrottlerGuard để nhiều trường hợp chạy liên tiếp. Cooldown, số lần sai OTP và thời hạn trong DB vẫn kiểm tra thật.
- `npm run test:persistence`: pass. Tạo bản ghi, dừng hẳn mongod, khởi động lại từ cùng thư mục WiredTiger và đọc lại bản ghi thành công. Dùng thư mục tạm, không ảnh hưởng database local.
- API local `/api/health`: 200, MongoDB, DEMO.
- `/api/vouchers`: 200, có 7 chiến dịch mẫu.
- `/docs-json`: 200, có 53 đường dẫn Swagger.
- CORS preflight từ `http://127.0.0.1:5173`: trả Access-Control-Allow-Origin tương ứng.
- `.gitignore` chặn `.env`, `.data`, `.cache`, `node_modules`, `dist`.

Test đã bao phủ: OTP giới hạn/hết hạn/đã dùng; rotate refresh/logout; phân quyền và truy cập chéo thương hiệu; giá ba loại voucher; mốc thời gian; tạo/duyệt/tạm dừng/duyệt lại chiến dịch; khoảng cách thực thi trên GeoJSON; pending không cấp voucher; payment đồng thời cấp đúng một lần; checkout idempotency; mua đồng thời không vượt tồn kho/hạn mức; hết hạn trả reservation đúng một lần; QR cũ bị vô hiệu; QR/OTP hết hạn; quét đồng thời một thành công; REFUND_PENDING khóa sử dụng; xác nhận/từ chối hoàn và báo cáo admin.

Chưa kiểm tra end-to-end với giao diện mới vì FE/mobile mới chưa làm. Chưa gửi email thật hoặc thanh toán thật. Docker Compose đã chuẩn bị nhưng chưa chạy do Docker Engine trên máy chưa hoạt động. CI GitHub chỉ được tạo file, chưa có kết quả chạy từ GitHub.
