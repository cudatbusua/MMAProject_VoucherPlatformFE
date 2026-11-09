# Voucher Web — quản trị, thương hiệu, cửa hàng

React 19 + Vite + TypeScript + React Router. Đăng nhập email/mật khẩu cho **ADMIN, BRAND_OWNER, BRAND_MANAGER, STORE_STAFF**. Tài khoản CUSTOMER bị từ chối và được hướng dẫn dùng ứng dụng di động.

## Chạy

Yêu cầu backend đang chạy (xem README gốc).

```powershell
cd web
npm.cmd install
npm.cmd run dev      # http://127.0.0.1:5173
npm.cmd run build    # kiểm tra kiểu + build production vào dist/
```

API mặc định `http://127.0.0.1:4100/api`; đổi bằng `VITE_API_URL` trong `web/.env`. Cổng 5173 đã có trong `CORS_ORIGINS` của backend.

## Màn hình theo vai trò

- **ADMIN**: tổng quan doanh thu; tài khoản (tạo, đổi vai trò, gán thương hiệu cho quản lý / cửa hàng cho nhân viên, khóa, đặt lại mật khẩu); thương hiệu (tạo gắn chủ sở hữu; xem hồ sơ pháp lý và file, duyệt/trả hồ sơ, đình chỉ/khôi phục; báo cáo và cửa hàng); duyệt/từ chối chiến dịch; xác nhận/từ chối hoàn tiền thủ công; đơn hàng, lượt sử dụng, nhật ký.
- **BRAND_OWNER**: báo cáo số liệu thương hiệu; *Hồ sơ pháp lý*: nộp giấy phép kinh doanh và chứng nhận an toàn thực phẩm (PDF/PNG/JPG), gửi duyệt, xem lý do bị trả.
- **BRAND_MANAGER**: tổng quan; chiến dịch (tạo/sửa theo 3 loại DISCOUNT/PREPAID/COMBO với kiểm tra giá ngay khi nhập, % ưu đãi nhân viên kèm xem trước giá NV, gửi duyệt, rút về nháp, tạm dừng, mở lại, xem tồn kho); cửa hàng (tạo, sửa tọa độ, đóng/mở); tạo nhân viên (hiển thị mã nhân viên).
- **STORE_STAFF**: chọn cửa hàng làm việc; xác nhận voucher bằng camera QR, dán mã QR hoặc OTP 6 số kèm tổng hóa đơn; hiển thị số tiền khách trả và số lượt còn lại; xác nhận thêm lượt với cùng mã; lịch sử hôm nay. *Mua voucher* (nhập mã nhân viên để được giá ưu đãi với voucher thương hiệu mình), *Đơn của tôi* (thanh toán demo, hủy), *Ví của tôi* (QR/OTP đưa đồng nghiệp xác nhận, hoàn tiền). Mỗi lần bấm xác nhận dùng một `idempotencyKey`, khi lỗi mạng bấm “Thử lại” sẽ gửi lại đúng key cũ.

## Cấu trúc

- `src/features/{auth,admin,owner,manager,staff}/` — trang theo vai trò.
- `src/components/` — layout, UI dùng chung, định dạng, chọn thương hiệu.
- `src/services/` — client API (tự refresh token) và phiên đăng nhập.
- `src/types/` — kiểu dữ liệu theo schema backend.
