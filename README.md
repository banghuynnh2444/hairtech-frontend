# HairTech 3D Desktop

Ứng dụng Tauri + React dùng để quản lý khách hàng và thiết kế sơ đồ cắt/uốn tóc 2D–3D.

## Chạy phát triển

1. Sao chép `.env.example` thành `.env.local` và đặt `VITE_API_URL` về backend local.
2. Chạy `npm install`.
3. Chạy `npm run tauri dev`.

## Kiểm tra và đóng gói

- `npm run build`: kiểm tra TypeScript và tạo frontend production.
- `npm run tauri build`: tạo bộ cài Windows trong `src-tauri/target/release/bundle`.

File `.env.production` chỉ chứa URL công khai của backend. Không đặt Supabase secret, JWT secret hoặc private key trong frontend.
# HairTech 3D frontend

## Chạy development khi Windows bật Smart App Control

Smart App Control có thể chặn `cargo run` với mã lỗi 4551 vì executable và proc-macro
do Rust tạo trong lúc development chưa có chữ ký của CA công khai. Không cần tắt bảo vệ
Windows để kiểm tra giao diện và API:

1. Đặt `VITE_DEV_DEVICE_FINGERPRINT` trong `.env` local. Giá trị này chỉ được đọc khi
   Vite chạy development và không được đặt trong `.env.production`.
2. Chạy `npm run dev`.
3. Mở `http://127.0.0.1:1420/`.

Chế độ trình duyệt giữ token trong bộ nhớ của tab và không hỗ trợ offline license. Bản
production vẫn bắt buộc Tauri/Rust, kho phiên mã hóa bằng Windows DPAPI và xác minh Ed25519.
Để chạy executable native trên máy bật Smart App Control, cần ký toàn bộ binary bằng
chứng thư code-signing từ CA thuộc Microsoft Trusted Root Program.
