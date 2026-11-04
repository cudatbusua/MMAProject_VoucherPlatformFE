# Nghiệp vụ trong backend mới

## Phân quyền

- CUSTOMER: OTP email, xem/mua voucher, đơn của mình, ví của mình, tạo mã redeem và yêu cầu hoàn.
- BRAND_OWNER: email/mật khẩu; thương hiệu, cửa hàng, nhân viên và chiến dịch thuộc mình.
- STORE_STAFF: email/mật khẩu; chọn chi nhánh được phân công, xác nhận voucher áp dụng tại chi nhánh đó.
- ADMIN: email/mật khẩu; tạo chủ thương hiệu, duyệt/đình chỉ thương hiệu, duyệt chiến dịch, hoàn thủ công và báo cáo. Admin không được dùng API redeem thay nhân viên.

## Chiến dịch

- Tất cả loại: tiền VND nguyên, `0 < salePrice < faceValue`.
- PREPAID: faceValue là mệnh giá; tiền còn dư không lưu thành số dư sau khi dùng.
- COMBO: faceValue là giá niêm yết gói; phải có comboItems.
- DISCOUNT: bắt buộc AMOUNT hoặc PERCENT và discountValue. PERCENT từ 1–100, bắt buộc maxDiscount.
- saleStartAt < saleEndAt; voucherExpireAt >= saleEndAt + 10 ngày. Thời gian truyền ISO-8601 có timezone; MongoDB lưu UTC.
- Cửa hàng phải thuộc thương hiệu và đang hoạt động. Chỉ thương hiệu APPROVED được gửi duyệt/mở bán.
- Sửa chiến dịch đã được duyệt/mở bán/tạm dừng đưa về PENDING; chiến dịch PENDING cần rút về DRAFT để sửa. Không sửa ENDED.
- PUBLISHED/APPROVED tới giờ bán, chưa hết giờ và thương hiệu APPROVED mới xuất hiện công khai. Hết tồn kho vẫn có thể hiển thị với remainingStock=0; API mua từ chối. Không có trạng thái SOLD_OUT riêng ở bản mới.

## Mua và thanh toán

- Mỗi đơn một loại voucher, nhiều số lượng; checkout có UUID idempotencyKey do client sinh. Cùng key/cùng nội dung trả lại đơn cũ; khác nội dung báo lỗi.
- Giá, quyền lợi, hạn dùng và danh sách chi nhánh được chụp vào snapshot khi tạo đơn. Chỉnh chiến dịch sau đó không thay quyền lợi của đơn đã tạo.
- Transaction cập nhật đồng thời đơn, tồn kho và hạn mức của khách.
- `soldQuantity + reservedQuantity <= totalQuantity`; `quota.purchased + quota.reserved <= limitPerUser` khi mua.
- PENDING giữ chỗ 15 phút. Hết hạn/hủy trả reservation đúng một lần. Lịch bảo trì chạy mỗi 15 giây, có kiểm tra hết hạn trực tiếp khi xem/thanh toán.
- Thanh toán demo thành công tạo payment, voucher và FULFILLED trong một transaction. UNIQUE orderId/eventId và orderId+itemIndex ngăn cấp trùng.
- Đơn hủy/hết hạn không được thanh toán demo; bản này không có giao dịch ngoài hệ thống đến muộn cần đối soát.

## Sử dụng và hoàn voucher

- Chỉ chủ voucher ACTIVE, còn hạn được sinh token. Token QR là chuỗi ngẫu nhiên đủ mạnh; client có thể mã hóa chuỗi đó thành hình QR. BE không sinh ảnh QR.
- OTP redeem 6 số, duy nhất trong tập token được lưu. QR và OTP chỉ lưu HMAC trong database, hạn 60 giây; làm mới vô hiệu mã cũ.
- Nhân viên phải chọn cửa hàng trong phiên, còn được phân công và cửa hàng đang hoạt động. Thương hiệu phải APPROVED; voucher phải áp dụng tại cửa hàng đó.
- Redeem nguyên tử: đánh dấu token dùng + voucher USED + log; hai lần quét đồng thời chỉ một lần thành công.
- PREPAID/COMBO ghi nhận giảm tối đa faceValue và không vượt hóa đơn. DISCOUNT tính theo loại, làm tròn xuống VND với phần trăm và áp dụng trần. Hóa đơn không âm; xác nhận sử dụng tiêu thụ cả voucher.
- Hoàn khi chưa dùng, trong 7 ngày từ lúc cấp sau thanh toán và còn ít nhất 3 ngày tới hết hạn. REFUND_PENDING không được sinh mã hoặc sử dụng.
- Admin xác nhận thủ công/demo → REFUNDED; trả tồn kho nếu chiến dịch chưa hết thời gian bán, giảm quota đã mua. Từ chối → ACTIVE hoặc EXPIRED tùy hạn.
- Hoàn tiền không thực hiện chuyển tiền thật. Báo cáo tổng thu dựa trên payment SUCCESS, trừ refund COMPLETED để ra doanh thu ròng.

## Khác với hệ thống cũ

Giữ luồng chính, không sao chép SQL hoặc chạy pg-mem. Chưa chuyển các chức năng phụ được liệt kê trong README; chưa đảm bảo tương thích client cũ. Dữ liệu mẫu và tài khoản cũ không tự chuyển sang database mới.
