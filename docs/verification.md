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

## Cập nhật 07/11/2026 — phân quyền và voucher nhiều lượt

- Typecheck, build, format check: pass.
- 33/33 test chức năng pass trên MongoDB replica set thật tách biệt.
- Bao phủ 5 role cùng mua vé; owner chỉ đọc báo cáo của mình; manager không thao tác thương hiệu khác; staff không tự quét voucher đã mua.
- Mua 5 vé chỉ cấp 1 voucher; cùng QR xác nhận đủ 5 lần, lần 6 bị chặn; 8 lượt quét song song chỉ có 5 lượt thành công.
- Retry đồng thời cùng idempotencyKey chỉ trừ 1 lượt; cùng key đổi nội dung bị từ chối.
- Hoàn toàn bộ gói chưa dùng trả đúng tổng tiền, tồn kho và quota; gói dùng một phần không được hoàn.
- Backfill voucher cũ lặp lại an toàn; index chỉ một redemption/voucher cũ được thay bằng index theo sequence.
- Đã seed đủ 5 tài khoản local; không ghi đè mật khẩu hoặc dữ liệu đã có. Thay đổi BE chưa được commit/push trong lần cập nhật này.
