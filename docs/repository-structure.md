# Khung repository

Một repository, ba ứng dụng độc lập. Backend đã chạy; web/mobile mới là thư mục chuẩn bị.

~~~text
voucher-platform/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/backend.yml
│   └── pull_request_template.md
├── backend/
│   ├── src/
│   │   ├── auth/
│   │   ├── catalog/
│   │   ├── common/
│   │   ├── database/
│   │   └── orders/
│   ├── scripts/
│   ├── test/
│   ├── .env.example
│   ├── compose.yaml
│   ├── package.json
│   └── package-lock.json
├── web/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── features/
│   │   ├── services/
│   │   └── types/
│   └── README.md
├── mobile/
│   ├── assets/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── services/
│   │   ├── state/
│   │   └── types/
│   └── README.md
├── docs/
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .nvmrc
├── CONTRIBUTING.md
└── README.md
~~~

Các file .gitkeep giúp Git lưu thư mục trống; xóa khi có mã nguồn thực tế. Mỗi ứng dụng có manifest và lockfile riêng khi triển khai, không cài dependency chung ở root.

Backend chứa schema Mongoose và scripts khởi động/seed DB. Không đưa dữ liệu WiredTiger hoặc binary MongoDB lên GitHub.

CI hiện kiểm tra backend. Chỉ thêm job web/mobile khi có mã nguồn và lệnh kiểm tra chạy được. Chưa cấu hình deploy tự động.

Repository GitHub: https://github.com/cudatbusua/MMAProject_VoucherPlatformFE

Remote origin dùng URL repo trên; nhánh chính main. Repo chứa cả backend và khung web/mobile theo cấu trúc này. Không dùng force push để ghi đè lịch sử.
