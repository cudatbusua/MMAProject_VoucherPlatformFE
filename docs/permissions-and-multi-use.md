# Phân quyền và voucher nhiều lượt — 07/11/2026

| Nghiệp vụ | ADMIN | BRAND_OWNER | BRAND_MANAGER | STORE_STAFF | CUSTOMER |
|---|---|---|---|---|---|
| Mua vé, đơn/ví cá nhân, OTP dùng voucher | Có | Có | Có | Có | Có |
| Tạo/cập nhật role và phân công | Có | Không | Không | Không | Không |
| Tạo thương hiệu gắn owner | Có | Không | Không | Không | Không |
| Xem báo cáo thương hiệu | Tất cả | Chỉ của mình | Được phân công | Không | Không |
| Tạo cửa hàng, tạo nhân viên, vận hành chiến dịch | Không qua API manager | Không | Được phân công | Không | Không |
| Duyệt chiến dịch/thương hiệu, hoàn thủ công | Có | Không | Không | Không | Không |
| Xác nhận sử dụng vé | Không | Không | Không | Cửa hàng được gán, không tự quét vé mình | Không |

Owner chỉ đọc trong nghiệp vụ thương hiệu, nhưng vẫn có quyền mua cá nhân như các role khác. Manager không được tự cấp ADMIN/OWNER/MANAGER hoặc truy cập thương hiệu ngoài brandIds.

## Ràng buộc cần giữ

1. Giá: 0 < salePrice < faceValue; tiền VND nguyên. Số vé mua từ 1 đến hạn mức và đủ tồn kho.
2. Chiến dịch: đúng cửa hàng/thương hiệu, được duyệt, trong thời gian bán; hạn voucher sau giờ kết thúc bán ít nhất 10 ngày.
3. Mua: giữ chỗ 15 phút; tồn kho và quota tính theo số vé, không tính theo số voucher gộp.
4. Thanh toán: chỉ server cấp quyền lợi, một payment và một voucher/đơn mới; xác nhận lặp không cấp thêm lượt.
5. Sử dụng: đúng nhân viên, đúng chi nhánh, thương hiệu hoạt động, voucher ACTIVE còn hạn và remainingUses > 0. Mỗi xác nhận đúng 1 vé.
6. Đồng thời: transaction và unique index đảm bảo usedCount + remainingUses = usageLimit khi còn hiệu lực. USED chỉ khi hết lượt; REFUNDED đặt remainingUses=0.
7. Retry: idempotencyKey duy nhất cho ý định xác nhận của staff. Cùng key/cùng nội dung trả biên nhận cũ; khác nội dung báo lỗi.
8. Hoàn: gói chưa dùng lượt nào, trong 7 ngày sau thanh toán và còn 3 ngày tới hết hạn. Hoàn totalPrice và trả số vé tương ứng; không hoàn một phần.
9. Tài khoản: role do admin cấp, manager bắt buộc brandIds, staff bắt buộc storeIds; khóa/đổi quyền thu hồi phiên. Email OTP giữ nguyên role hiện có.
10. Báo cáo: owner chỉ có số liệu tổng hợp thuộc thương hiệu của mình, không có danh sách khách hàng hoặc dữ liệu thương hiệu khác.

## Ví dụ 5 vé

Thanh toán 5 x 30.000đ → 1 voucher totalPrice=150.000đ, usageLimit=5.
Xác nhận lần lượt: còn 4, 3, 2, 1, 0 lượt. Lần 6 bị từ chối.
Một QR có thể dùng cho các lần xác nhận trong thời gian mã còn hạn; làm mới QR không tạo voucher mới hoặc tăng lượt.

## Dữ liệu cũ và phạm vi

Backfill giữ voucher cũ thành voucher một lượt, không xóa/gộp quyền lợi đã cấp hoặc thay ID. Đơn thanh toán mới mới áp dụng gộp theo số lượng.
Bỏ index cũ chỉ cho một redemption/voucher; thay bằng voucherId+sequence và staffId+idempotencyKey.
Thay đổi nằm ở BE; web/mobile hiện là khung, chưa có màn hình quản lý mới. Thanh toán vẫn DEMO.
