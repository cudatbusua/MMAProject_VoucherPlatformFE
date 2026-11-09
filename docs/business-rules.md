# Nghiệp vụ trong backend mới

## Phân quyền

- Mọi role đều được mua, xem đơn/ví của mình, tạo mã sử dụng và yêu cầu hoàn. Email OTP không đổi role tài khoản đã tồn tại.
- CUSTOMER: mua và dùng voucher cá nhân.
- BRAND_OWNER: xem danh sách thương hiệu của mình, tồn kho tổng hợp và số liệu/doanh thu; nộp hồ sơ pháp lý của thương hiệu. Không tạo/sửa chiến dịch, cửa hàng hoặc nhân viên.
- BRAND_MANAGER: quản lý cửa hàng, tạo nhân viên và tạo/sửa/gửi duyệt chiến dịch trong brandIds được admin phân công.
- STORE_STAFF: email/mật khẩu; chọn chi nhánh được phân công, xác nhận voucher áp dụng tại chi nhánh đó. Có mã nhân viên riêng (NV-XXXXXX) để mua voucher thương hiệu mình với giá ưu đãi.
- ADMIN: tạo/cập nhật tài khoản đủ role, gán phạm vi manager/staff, tạo thương hiệu gắn owner, duyệt/đình chỉ thương hiệu, duyệt chiến dịch, hoàn thủ công và báo cáo. Admin không dùng API redeem thay nhân viên. Đổi quyền/phạm vi/mật khẩu hoặc khóa tài khoản thu hồi toàn bộ phiên.

## Chiến dịch

- Tất cả loại: tiền VND là bội số 1.000đ, tối thiểu 1.000đ; `salePrice < faceValue` và `salePrice ≥ 30% × faceValue` (giảm tối đa 70%).
- Đã có vé bán/giữ chỗ thì không được đổi loại voucher hoặc giảm giá trị/quyền lợi (faceValue, discountValue, maxDiscount); muốn đổi phải tạo chiến dịch mới.
- `staffDiscountPercent` từ 0 đến 50 (0 = không có ưu đãi nhân viên). Giá nhân viên = salePrice × (100 − %) làm tròn xuống 1.000đ, phải ≥ 1.000đ và ≥ 50% salePrice.
- PREPAID: faceValue là mệnh giá; tiền còn dư không lưu thành số dư sau khi dùng.
- COMBO: faceValue là giá niêm yết gói; phải có comboItems.
- DISCOUNT: bắt buộc AMOUNT hoặc PERCENT và discountValue. AMOUNT: faceValue = discountValue. PERCENT từ 1–100, bắt buộc maxDiscount và faceValue = maxDiscount.
- saleStartAt < saleEndAt; voucherExpireAt >= saleEndAt + 10 ngày. Thời gian truyền ISO-8601 có timezone; MongoDB lưu UTC.
- Cửa hàng phải thuộc thương hiệu và đang hoạt động. Chỉ thương hiệu APPROVED được gửi duyệt/mở bán.
- Sửa chiến dịch đã được duyệt/mở bán/tạm dừng đưa về PENDING; chiến dịch PENDING cần rút về DRAFT để sửa. Không sửa ENDED.
- PUBLISHED/APPROVED tới giờ bán, chưa hết giờ và thương hiệu APPROVED mới xuất hiện công khai. Hết tồn kho vẫn có thể hiển thị với remainingStock=0; API mua từ chối. Không có trạng thái SOLD_OUT riêng ở bản mới.

## Hồ sơ pháp lý thương hiệu

- Thương hiệu mới ở trạng thái DRAFT. Chủ thương hiệu (BRAND_OWNER) nộp **giấy phép kinh doanh** và **chứng nhận an toàn thực phẩm**: số giấy, cơ quan cấp, ngày cấp, ngày hết hạn (bắt buộc với ATTP) và file PDF/PNG/JPG ≤ 5MB (kiểm tra theo nội dung file, không tin phần mở rộng).
- Gửi duyệt (DRAFT/REJECTED → PENDING) khi đủ 2 giấy tờ, ngày cấp không ở tương lai, chứng nhận ATTP còn hạn ít nhất 30 ngày. Khi PENDING/APPROVED không sửa được giấy tờ.
- Admin xem file (chỉ admin, owner và manager của thương hiệu tải được file) rồi duyệt (PENDING → APPROVED, giấy tờ phải còn hạn) hoặc trả hồ sơ kèm lý do (→ REJECTED, owner sửa và gửi lại). Đình chỉ APPROVED → SUSPENDED; khôi phục SUSPENDED → APPROVED khi giấy tờ còn hạn.
- File lưu trong `backend/uploads` (UPLOAD_DIR), tên file ngẫu nhiên, không đưa lên Git.

## Nhân viên mua voucher

- Mọi STORE_STAFF có mã nhân viên duy nhất, cấp khi tạo tài khoản hoặc khi đổi role sang STORE_STAFF, xóa khi rời role.
- Staff mua mọi voucher với giá thường. Nhập mã nhân viên khi đặt đơn (`employeeCode`) để được giá nhân viên nếu: mã đúng là của chính tài khoản đang đăng nhập, chiến dịch thuộc thương hiệu có cửa hàng staff được phân công, và chiến dịch có `staffDiscountPercent > 0`. Xem trước giá: `GET /api/orders/staff-price`.
- Đơn lưu `employeeCode`, `listUnitPrice`, `staffDiscountPercent`; `unitPrice`/`totalAmount` là giá thực trả. Voucher lưu giá mỗi vé đã trả; hoàn tiền trả đúng số đã thanh toán. Cùng idempotencyKey mà khác mã bị từ chối.
- Staff không tự xác nhận voucher của mình; nhân viên khác xác nhận. Báo cáo thương hiệu có `staffOrders`.

## Mua và thanh toán

- Mỗi đơn một loại voucher, nhiều số lượng; checkout có UUID idempotencyKey do client sinh. Cùng key/cùng nội dung trả lại đơn cũ; khác nội dung báo lỗi.
- Giá, quyền lợi, hạn dùng và danh sách chi nhánh được chụp vào snapshot khi tạo đơn. Chỉnh chiến dịch sau đó không thay quyền lợi của đơn đã tạo.
- Transaction cập nhật đồng thời đơn, tồn kho và hạn mức của khách.
- `soldQuantity + reservedQuantity <= totalQuantity`; `quota.purchased + quota.reserved <= limitPerUser` khi mua.
- PENDING giữ chỗ 15 phút. Hết hạn/hủy trả reservation đúng một lần. Lịch bảo trì chạy mỗi 15 giây, có kiểm tra hết hạn trực tiếp khi xem/thanh toán.
- Thanh toán thành công tạo payment và đúng một voucher cho đơn, số lượt bằng quantity; đơn FULFILLED trong cùng transaction. UNIQUE orderId cho voucher formatVersion=2 và payment orderId/eventId ngăn cấp trùng. salePrice là giá mỗi vé, totalPrice là toàn bộ giá đơn.
- Đơn hủy/hết hạn không được thanh toán demo; bản này không có giao dịch ngoài hệ thống đến muộn cần đối soát.

## Sử dụng và hoàn voucher

- Chỉ chủ voucher ACTIVE, còn hạn được sinh token. Token QR là chuỗi ngẫu nhiên đủ mạnh; client có thể mã hóa chuỗi đó thành hình QR. BE không sinh ảnh QR.
- OTP redeem 6 số, duy nhất trong tập token được lưu. QR và OTP chỉ lưu HMAC trong database, hạn 60 giây; làm mới vô hiệu mã cũ. Cùng mã còn hạn được xác nhận nhiều lượt tới khi hết remainingUses.
- Nhân viên phải chọn cửa hàng trong phiên, còn được phân công và cửa hàng đang hoạt động. Thương hiệu phải APPROVED; voucher phải áp dụng tại cửa hàng đó.
- Redeem nguyên tử: tăng usedCount một, giảm remainingUses một và ghi log có sequence. Khi hết lượt mới USED và khóa mã. Quét đồng thời không vượt usageLimit. Mỗi lượt xác nhận dùng UUID idempotencyKey mới; retry giữ nguyên key để không trừ lần nữa. Staff không tự xác nhận voucher của mình.
- PREPAID/COMBO ghi nhận giảm tối đa faceValue và không vượt hóa đơn. DISCOUNT tính theo loại, làm tròn xuống VND với phần trăm và áp dụng trần. Hóa đơn không âm; mỗi xác nhận tiêu thụ đúng một lượt và áp dụng quyền lợi một vé.
- Chỉ hoàn toàn bộ gói khi usedCount=0 (chưa dùng lượt nào); chưa hỗ trợ hoàn một phần. Hoàn trong 7 ngày từ lúc cấp sau thanh toán và còn ít nhất 3 ngày tới hết hạn. REFUND_PENDING không được sinh mã hoặc sử dụng.
- Admin xác nhận thủ công/demo → REFUNDED; hoàn totalPrice, trả usageLimit vé về tồn kho nếu chưa hết giờ bán và giảm quota tương ứng, đặt remainingUses=0. Từ chối → ACTIVE hoặc EXPIRED tùy hạn.
- Hoàn tiền không thực hiện chuyển tiền thật. Báo cáo tổng thu dựa trên payment SUCCESS, trừ refund COMPLETED để ra doanh thu ròng.

## Khác với hệ thống cũ

Giữ luồng chính, không sao chép SQL hoặc chạy pg-mem. Chưa chuyển các chức năng phụ được liệt kê trong README; chưa đảm bảo tương thích client cũ. Dữ liệu mẫu và tài khoản cũ không tự chuyển sang database mới.
