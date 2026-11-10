# Kịch bản demo Voucher Platform

Tài liệu này hướng dẫn chạy hệ thống và demo từng luồng nghiệp vụ trên web (quản trị, thương hiệu, nhân viên) và app mobile (khách hàng). Mỗi bước ghi rõ **ai làm**, **ở đâu**, **thao tác** và **kết quả cần thấy**.

---

## 0. Chuẩn bị

### Mở 4 terminal (PowerShell), giữ nguyên trong suốt buổi demo

| Terminal | Lệnh | Sẵn sàng khi thấy |
|---|---|---|
| 1. MongoDB | `cd backend` → `npm.cmd run db:local` | `MongoDB local ready` |
| 2. Backend API | `cd backend` → `npm.cmd run start:dev` | `Nest application successfully started` |
| 3. Web | `cd web` → `npm.cmd run dev` | `Local: http://127.0.0.1:5173/` |
| 4. Mobile | `cd mobile` → `npx expo start` → nhấn **a** | App “Voucher” mở trên Android Emulator |

Lần đầu trên máy mới: chạy thêm `npm.cmd run db:seed` (trong `backend`) sau khi MongoDB sẵn sàng để tạo dữ liệu mẫu. Emulator cần được bật trước (Android Studio → Device Manager → ▶).

### Đường dẫn

- Web quản trị / thương hiệu / nhân viên: http://127.0.0.1:5173
- App khách hàng: Android Emulator (hoặc bản web để xem nhanh: http://localhost:8081)
- Swagger API: http://127.0.0.1:4100/docs

### Tài khoản mẫu — web dùng mật khẩu chung `Voucher@123`, khách hàng dùng mã OTP

| Email | Vai trò | Dùng ở | Ghi chú |
|---|---|---|---|
| admin@voucher.local | Quản trị viên | Web | |
| owner@voucher.local | Chủ thương hiệu | Web | Sở hữu “Vouch Coffee” (đã duyệt) và “Trà Sữa Mây” (nháp) |
| manager@voucher.local | Quản lý thương hiệu | Web | Quản lý “Vouch Coffee” |
| staff@voucher.local | Nhân viên | Web | Mã nhân viên `NV-STAFF1` |
| staff2@voucher.local | Nhân viên (đồng nghiệp) | Web | Mã nhân viên `NV-STAFF2` |
| customer@voucher.local | Khách hàng | App mobile | **Chỉ đăng nhập bằng OTP** (không có mật khẩu). Mã OTP in ở terminal 2 (Backend) |

Trang đăng nhập web có sẵn nút điền nhanh email tài khoản mẫu.

### File giấy phép mẫu để tải lên

Tạo 2 file PDF mẫu (một lần):

```powershell
cd backend
npx tsx scripts/demo-files.ts
```

File nằm ở thư mục `demo-files/` **cạnh** thư mục repo (không nằm trong repo), ví dụ `C:\MMA\demo-files\`: `giay-phep-kinh-doanh-tra-sua-may.pdf`, `chung-nhan-attp-tra-sua-may.pdf`. Có thể dùng ảnh PNG/JPG bất kỳ thay thế.

### Mẹo khi demo

- Mỗi trình duyệt chỉ giữ **một** phiên đăng nhập. Để demo nhiều vai trò song song, mở thêm cửa sổ ẩn danh hoặc trình duyệt khác (ví dụ: Chrome cho admin, Edge cho owner/manager, cửa sổ ẩn danh cho staff).
- Backend giới hạn **10 lần đăng nhập/phút** và gửi lại OTP sau **60 giây**. Nếu thấy lỗi “Too Many Requests”, chờ 1 phút.
- Khách hàng **không** đăng nhập bằng mật khẩu: app không có ô mật khẩu, và API `/auth/login` từ chối tài khoản khách hàng.
- Mã QR/OTP sử dụng voucher chỉ có hiệu lực **60 giây**; hết hạn thì bấm “Làm mới mã” (không mất lượt).
- Thanh toán là **DEMO**, không phát sinh tiền thật.

---

## Flow 1 — Hồ sơ pháp lý thương hiệu (Owner nộp → Admin trả hồ sơ → Owner sửa → Admin duyệt)

**Mục tiêu:** thương hiệu chỉ hoạt động khi có giấy phép kinh doanh và chứng nhận an toàn thực phẩm (ATTP) được admin duyệt.

| # | Ai / Ở đâu | Thao tác | Kết quả cần thấy |
|---|---|---|---|
| 1.1 | **admin** → *Thương hiệu* | Quan sát danh sách | “Vouch Coffee — mẫu”: **Đã duyệt**, cột hồ sơ **Đủ 2 giấy tờ**. “Trà Sữa Mây — mẫu”: **Chờ nộp hồ sơ**, **Chưa nộp** |
| 1.2 | *(tùy chọn)* **admin** → *+ Tạo thương hiệu* | Nhập tên, **chọn chủ sở hữu** `owner@voucher.local`, bấm *Tạo* | Nút *Tạo* bị khóa khi chưa chọn chủ sở hữu. Thương hiệu mới ở trạng thái **Chờ nộp hồ sơ** |
| 1.3 | **owner** → *Hồ sơ pháp lý* | Chọn “Trà Sữa Mây — mẫu” ở ô chọn thương hiệu góc phải | Thông báo “Thương hiệu chưa nộp hồ sơ…”; nút **Gửi duyệt bị khóa** |
| 1.4 | **owner** – thẻ *Giấy phép kinh doanh* | Số giấy `0319876543`, cơ quan cấp `Sở KH&ĐT TP.HCM`, ngày cấp (quá khứ), bỏ trống ngày hết hạn, chọn file `giay-phep-kinh-doanh-tra-sua-may.pdf` → *Lưu giấy tờ* | Thẻ chuyển sang **Đã tải lên**, hiện số giấy, “Không thời hạn”, nút *Xem file* |
| 1.5 | *(minh họa ràng buộc)* thẻ *Chứng nhận ATTP* | Số `ATTP-2026-0420`, cơ quan `BQL ATTP TP.HCM`, ngày cấp quá khứ, **ngày hết hạn = 10 ngày tới**, file `chung-nhan-attp-tra-sua-may.pdf` → *Lưu* | Lưu được, badge vàng **Còn … ngày**; dưới nút Gửi duyệt báo “*phải còn hạn ít nhất 30 ngày*”, nút vẫn khóa |
| 1.6 | **owner** – thẻ ATTP → *Sửa / thay file* | Đổi ngày hết hạn sang 2 năm sau (không cần chọn lại file) → *Lưu giấy tờ* | Ngày hết hạn cập nhật; nút **Gửi duyệt** sáng lên |
| 1.7 | **owner** | Bấm **Gửi duyệt** | Trạng thái **Chờ duyệt**, thông báo “Hồ sơ đã gửi lúc…”; form bị khóa, chỉ còn *Xem file* |
| 1.8 | **admin** → *Thương hiệu* (tải lại trang) | Badge **1 hồ sơ chờ duyệt**; bấm **Xem hồ sơ & duyệt** ở dòng “Trà Sữa Mây” | Cửa sổ hiện 2 giấy tờ: số giấy, cơ quan cấp, ngày cấp/hết hạn |
| 1.9 | **admin** | Bấm *Xem file* ở từng giấy | File PDF/ảnh hiển thị ngay trong trang (file riêng tư, chỉ admin/owner/manager của thương hiệu xem được). Nhấn **Esc** để đóng khung xem |
| 1.10 | **admin** | Bấm **Trả hồ sơ**, nhập lý do “Ảnh chứng nhận ATTP bị mờ, vui lòng tải lại” → *Trả hồ sơ* | Trạng thái **Bị trả hồ sơ** kèm lý do |
| 1.11 | **owner** → *Hồ sơ pháp lý* (tải lại) | Đọc thông báo | Hiện **lý do bị trả**; form mở lại để sửa |
| 1.12 | **owner** | *Sửa / thay file* ở thẻ ATTP → chọn lại file → *Lưu* → **Gửi duyệt** | Trạng thái **Chờ duyệt** |
| 1.13 | **admin** → *Xem hồ sơ & duyệt* | Bấm **Duyệt thương hiệu** | Trạng thái **Đã duyệt**, cột hồ sơ **Đủ 2 giấy tờ** |

**Điểm nhấn khi trình bày:** file kiểm tra theo nội dung (đổi đuôi `.exe` thành `.pdf` vẫn bị từ chối), ATTP phải còn hạn ≥ 30 ngày, không sửa được hồ sơ khi đang chờ duyệt, mọi thao tác ghi vào *Nhật ký* của admin.

---

## Flow 2 — Manager tạo chiến dịch: ràng buộc giá + ưu đãi nhân viên → Admin duyệt

**Mục tiêu:** giá bán hợp lệ (bội số 1.000đ, giảm tối đa 70%), có giá riêng cho nhân viên.

| # | Ai / Ở đâu | Thao tác | Kết quả cần thấy |
|---|---|---|---|
| 2.1 | **manager** → *Chiến dịch* → *+ Tạo chiến dịch* | Tên “Trà sữa trân châu 60K”, loại **Trả trước**, mệnh giá `60000` | Gợi ý dưới ô giá bán: “Từ 18.000đ đến dưới 60.000đ (giảm tối đa 70%)” |
| 2.2 | | Giá bán `15000` | Báo lỗi đỏ: **Giảm tối đa 70%: giá bán tối thiểu 18.000đ** |
| 2.3 | | Giá bán `42500` | Báo lỗi: **Bội số của 1.000đ** |
| 2.4 | | Giá bán `42000` | Hết lỗi; khung xem trước: Giá trị 60.000đ · Giá bán 42.000đ |
| 2.5 | | Ưu đãi nhân viên `60` | Báo lỗi: **Từ 0 đến 50%** |
| 2.6 | | Ưu đãi nhân viên `20` | Khung xem trước: **Giá nhân viên 33.000đ** (42.000 × 80% = 33.600, làm tròn xuống 1.000đ) |
| 2.7 | *(minh họa)* đổi loại sang **Giảm giá** → kiểu *Số tiền cố định*, số tiền giảm `40000` | Ô “Giá trị voucher (tự tính)” = **40.000đ** (giá trị luôn bằng mức giảm). Đổi lại **Trả trước** |
| 2.8 | | Giữ thời gian mặc định (bán ngay), chọn cửa hàng → **Tạo bản nháp** | Chiến dịch ở trạng thái **Nháp**, cột mô tả có “NV -20%” |
| 2.9 | **manager** | Bấm **Gửi duyệt** | Trạng thái **Chờ duyệt** |
| 2.10 | **admin** → *Duyệt chiến dịch* | *Xem* (có dòng “Ưu đãi nhân viên -20% → 33.000đ”) → **Duyệt** | Chiến dịch biến khỏi danh sách chờ; bên manager thành **Đang bán** |

**Điểm nhấn:** form báo lỗi ngay khi nhập, backend kiểm tra lại toàn bộ; chiến dịch đã có vé bán thì không được giảm giá trị/quyền lợi (thử *Sửa* và hạ mệnh giá sau Flow 3 → bị chặn).

---

## Flow 3 — Khách hàng mua voucher trên app mobile

| # | Ai / Ở đâu | Thao tác | Kết quả cần thấy |
|---|---|---|---|
| 3.1 | **customer** – app | Nhập email `customer@voucher.local` → **Gửi mã OTP** | Thông báo “Đã gửi mã đăng nhập… hiệu lực 5 phút”, xuất hiện ô nhập mã |
| 3.2 | Terminal 2 (Backend) | Tìm dòng `[LOCAL EMAIL] customer@voucher.local — OTP: xxxxxx` | Mã 6 số (chế độ local không gửi email thật) |
| 3.2b | **customer** – app | Nhập mã 6 số → **Đăng nhập** | Màn **Khám phá**: danh sách voucher đang mở bán. (Email chưa có tài khoản sẽ tự tạo tài khoản khách hàng) |
| 3.3 | **Khám phá** | Thử ô tìm kiếm, chip danh mục, sắp xếp *Giá thấp*, *📍 Gần tôi* + bán kính | Danh sách lọc/sắp xếp tương ứng |
| 3.4 | | Chạm “Voucher cà phê 50K” | Chi tiết: giá 30.000đ, mệnh giá 50.000đ, giới hạn 5 vé/người, 2 cửa hàng áp dụng |
| 3.5 | | Bấm **+** thành 2 vé → *Thêm vào giỏ* | Badge giỏ hàng = 2 |
| 3.6 | Tab **Giỏ hàng** | *Đặt hàng* | Màn **Đơn hàng**: “Thời gian giữ chỗ còn 14:59”, tổng 60.000đ |
| 3.7 | | **Thanh toán demo 60.000đ** | “Thanh toán giả lập thành công”, trạng thái **Đã thanh toán** |
| 3.8 | *Xem voucher trong ví* | Ví tab **Còn hiệu lực** | 1 voucher **Còn 2/2 lượt** (mua 2 vé = 1 voucher 2 lượt) |
| 3.9 | Chạm voucher → **Tạo mã sử dụng** | Hiện **mã QR + OTP 6 số**, đếm ngược 60 giây. **Giữ màn hình này** cho Flow 4 |

---

## Flow 4 — Nhân viên xác nhận voucher của khách (web)

| # | Ai / Ở đâu | Thao tác | Kết quả cần thấy |
|---|---|---|---|
| 4.1 | **staff** → đăng nhập web | | Trang **Chọn cửa hàng làm việc** (nhân viên phụ trách 2 cửa hàng) |
| 4.2 | | Chọn **Vouch Quận 1 — mẫu** | “Đang làm việc tại: Vouch Quận 1 — mẫu” |
| 4.3 | Tab **Nhập OTP** | Nhập OTP đang hiện trên app khách, *Tổng hóa đơn* `80000` → **Xác nhận sử dụng 1 lượt** | “Sử dụng một lượt thành công”, **Khách cần thanh toán 30.000đ** (giảm 50.000đ), **Lượt #1 · còn 1/2** |
| 4.4 | App khách (không cần thao tác) | Chờ vài giây | Voucher tự cập nhật **1/2 lượt**, lịch sử có “Lượt 1” |
| 4.5 | **staff** | *Xác nhận thêm 1 lượt với mã này* → hóa đơn `40000` → xác nhận | **còn 0/2**; app khách chuyển **Đã dùng hết** |
| 4.6 | **staff** → *Lịch sử hôm nay* | | 2 lượt, tổng hóa đơn / tổng giảm / khách trả |

Có thể dùng tab **Quét QR** (camera máy tính) hoặc **Dán mã QR**. Nếu mạng lỗi khi xác nhận, nút đổi thành **Thử lại** và gửi lại đúng yêu cầu cũ — không trừ thêm lượt.

---

## Flow 5 — Nhân viên mua voucher bằng mã nhân viên

**Mục tiêu:** nhân viên được giá ưu đãi cho voucher thương hiệu mình; không tự xác nhận voucher của chính mình.

| # | Ai / Ở đâu | Thao tác | Kết quả cần thấy |
|---|---|---|---|
| 5.1 | **staff** – thanh bên trái | | Hiện **Mã NV `NV-STAFF1`** |
| 5.2 | **staff** → *Mua voucher* | | Voucher thương hiệu mình có badge **Ưu đãi NV -X%** và dòng “Giá nhân viên” (ví dụ “Voucher cà phê 50K” 30.000đ → **24.000đ**, “Trà sữa trân châu 60K” → **33.000đ**) |
| 5.3 | Chạm “Trà sữa trân châu 60K” | **+** thành 2 vé; mã nhân viên nhập `NV-STAFF2` → *Áp dụng* | Báo lỗi **Mã nhân viên không đúng với tài khoản của bạn** |
| 5.4 | | Sửa thành `NV-STAFF1` → *Áp dụng* | “Đã áp dụng mã nhân viên: giảm 20% mỗi vé”; đơn giá ~~42.000đ~~ **33.000đ**, tổng **66.000đ** |
| 5.5 | | **Đặt đơn** | Cửa sổ đơn hàng: đếm ngược giữ chỗ, dòng “Mã nhân viên NV-STAFF1 (-20%)” |
| 5.6 | | **Thanh toán demo 66.000đ** → *Xem voucher trong ví* | *Ví của tôi*: **Còn 2/2 lượt**, badge **Giá NV -20%** |
| 5.7 | Chạm voucher → **Tạo mã sử dụng** | Hiện QR + OTP. Ghi lại OTP |
| 5.8 | **staff** → đóng cửa sổ ví → *Xác nhận voucher* → tab *Nhập OTP* | Nhập chính OTP đó + hóa đơn → xác nhận (làm trong 60 giây) | Bị chặn: **Không được tự xác nhận voucher của mình. Nhờ nhân viên khác thực hiện.** |
| 5.9 | **staff2** → chọn cửa hàng → *Xác nhận voucher* | Nhập OTP + hóa đơn `60000` → xác nhận | Thành công, **còn 1/2**; ví của staff tự cập nhật |

Các trường hợp bị từ chối khác (để hỏi đáp): khách hàng nhập mã nhân viên; chiến dịch không có ưu đãi NV (ví dụ “Voucher đồ uống 70K”); voucher thuộc thương hiệu khác.

---

## Flow 6 — Hoàn tiền

| # | Ai / Ở đâu | Thao tác | Kết quả cần thấy |
|---|---|---|---|
| 6.1 | **customer** – app | Mua thêm 1 voucher (Flow 3, bước 3.4–3.7), mở voucher chưa dùng trong ví | Có mục **Hoàn tiền** (chỉ voucher chưa dùng lượt nào, trong 7 ngày, còn ≥ 3 ngày hạn) |
| 6.2 | | *Yêu cầu hoàn tiền* → lý do “Đổi ý” → **Gửi yêu cầu hoàn** | Trạng thái **Đang chờ hoàn**, không tạo được mã sử dụng |
| 6.3 | **admin** → *Hoàn tiền* | **Xác nhận đã hoàn** → mã tham chiếu `CK-0001` | Thông báo đã xác nhận (demo, không chuyển tiền thật) |
| 6.4 | **customer** – *Tài khoản* → *Yêu cầu hoàn tiền của tôi* | | Trạng thái **Đã hoàn**, mã tham chiếu; voucher **Đã hoàn tiền** |

Staff cũng hoàn được voucher của mình trong *Ví của tôi*; số tiền hoàn là **số đã trả** (giá nhân viên).

---

## Flow 7 — Báo cáo & quản trị

| # | Ai / Ở đâu | Kết quả cần thấy |
|---|---|---|
| 7.1 | **owner** → *Báo cáo thương hiệu* (chọn Vouch Coffee) | Doanh thu gộp / đã hoàn / ròng, vé đã bán, **Đơn giá nhân viên**, lượt sử dụng. Owner chỉ xem, không có menu chiến dịch/cửa hàng |
| 7.2 | **manager** → *Tổng quan* | Số chiến dịch theo trạng thái, cửa hàng, nhân viên + số liệu doanh thu |
| 7.3 | **manager** → *Nhân viên* | Cột **Mã nhân viên** (`NV-STAFF1`, `NV-STAFF2`); *+ Tạo nhân viên* → nhân viên mới tự có mã `NV-XXXXXX` |
| 7.4 | **admin** → *Tổng quan* | Tổng người dùng, đơn, voucher, lượt dùng, doanh thu; việc cần xử lý |
| 7.5 | **admin** → *Tài khoản* | Tạo tài khoản theo vai trò, gán thương hiệu/cửa hàng, khóa tài khoản (bị đăng xuất ngay) |
| 7.6 | **admin** → *Đơn hàng*, *Lượt sử dụng*, *Nhật ký* | Toàn bộ đơn, lượt quét, và nhật ký thao tác (duyệt thương hiệu, nộp hồ sơ, xác nhận lượt…) |

---

## Phân quyền tóm tắt (để trả lời câu hỏi)

| Vai trò | Ứng dụng | Được làm |
|---|---|---|
| CUSTOMER | Mobile | Tìm, mua, thanh toán demo, ví, mã QR/OTP, hoàn tiền |
| STORE_STAFF | Web | Chọn cửa hàng, xác nhận voucher, mua voucher (giá NV với mã của mình), ví cá nhân |
| BRAND_MANAGER | Web | Chiến dịch, cửa hàng, nhân viên của thương hiệu được giao |
| BRAND_OWNER | Web | Xem báo cáo, nộp hồ sơ pháp lý |
| ADMIN | Web | Tài khoản, duyệt thương hiệu/chiến dịch, hoàn tiền, báo cáo, nhật ký |

Khách hàng chỉ đăng nhập bằng OTP trên app mobile; các vai trò còn lại đăng nhập web bằng email/mật khẩu. Đăng nhập sai ứng dụng sẽ được thông báo dùng đúng ứng dụng.

---

## Đưa dữ liệu về trạng thái ban đầu (trước buổi demo mới)

1. Dừng terminal 1 (MongoDB) bằng `Ctrl+C`; dừng terminal 2.
2. Xóa thư mục `backend/.data` và `backend/uploads`.
3. Chạy lại `npm.cmd run db:local`, rồi ở terminal khác `npm.cmd run db:seed`, rồi `npm.cmd run start:dev`.
