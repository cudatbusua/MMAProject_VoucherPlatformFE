# Làm việc trong repository

- backend/: API, phân quyền, nghiệp vụ và MongoDB.
- web/: quản trị, chủ thương hiệu và nhân viên.
- mobile/: app khách hàng.
- docs/: luồng, quy tắc, database và demo.

Nhánh tính năng có thể đặt feat/..., sửa lỗi fix/.... Nếu đổi hợp đồng API, cập nhật tài liệu và client liên quan.

Kiểm tra trong backend/:
~~~powershell
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
~~~
Khi sửa tầng lưu trữ, chạy thêm npm.cmd run test:persistence.

Web/mobile hiện chỉ là khung, chưa có lệnh build/test.

Chỉ lưu .env.example không chứa secret. Không đưa .env, .data, .cache, dependency, build hoặc khóa ký ứng dụng vào Git.

Repository dùng nhánh chính main. Làm chức năng trên nhánh riêng và tạo pull request để review.
