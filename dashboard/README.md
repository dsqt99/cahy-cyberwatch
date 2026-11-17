# Social Tracking Dashboard

Ứng dụng dashboard theo dõi nội dung mạng xã hội, xây dựng bằng Vite + React + TypeScript, sử dụng shadcn/ui, TailwindCSS và Supabase cho dữ liệu.

## Công nghệ chính
- React 18, TypeScript
- Vite (dev server chạy ở cổng `8080`)
- TailwindCSS, shadcn/ui (Radix UI)
- Supabase (`@supabase/supabase-js`)
- React Router, TanStack Query

## Yêu cầu hệ thống
- Node.js 18+ (khuyến nghị 18 hoặc 20)
- Trình quản lý package: `npm` (hoặc `pnpm`/`yarn` tùy chọn)

## Cài đặt và chạy
1) Cài dependencies:
   ```bash
   npm install
   # hoặc
   pnpm install
   ```
2) Tạo file `.env` và điền biến môi trường (xem phần dưới). Project hiện đã có `.env` mẫu.
3) Chạy dev server:
   ```bash
   npm run dev
   ```
   Ứng dụng chạy tại: `http://localhost:8080/`
4) Build và preview bản sản xuất:
   ```bash
   npm run build
   npm run preview
   ```
5) Kiểm tra lint:
   ```bash
   npm run lint
   ```

## Biến môi trường
Khai báo trong `.env` (Vite sẽ đọc với tiền tố `VITE_`):
```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```
Ứng dụng lấy các biến này ở `src/lib/supabase.ts`.

## Cấu trúc thư mục
```
src/
├── pages/          # Các trang: Index, Posts, NotFound
├── components/     # Thành phần UI (shadcn/ui)
├── hooks/          # Hook tiện ích (toast, mobile)
├── lib/            # supabase client, utils
├── utils/          # Tiện ích hiển thị toast
├── main.tsx        # Entry file
├── App.tsx         # Khung ứng dụng
```
Các cấu hình:
- `vite.config.ts`: alias `@` -> `src`, server `port: 8080`.
- `tailwind.config.ts`, `postcss.config.js`: cấu hình Tailwind.
- `vercel.json`: cấu hình rewrite SPA (`/(.*)` -> `/index.html`).

## Triển khai
- Vercel: có thể deploy trực tiếp. Bảo đảm `vercel.json` tồn tại và biến môi trường `VITE_*` được cấu hình trong Project Settings của Vercel.
- Supabase: tạo project và copy `URL`, `anon key` vào `.env` (hoặc biến môi trường trên nền tảng deploy).

## Scripts tiện dụng
- `dev`: chạy dev server Vite.
- `build`: build sản xuất.
- `build:dev`: build ở mode development.
- `preview`: preview build.
- `lint`: eslint toàn dự án.

## Ghi chú
- `npm audit` có thể báo một số cảnh báo ở môi trường dev, nhưng không ảnh hưởng chạy cục bộ.
- Nếu muốn đổi cổng, chỉnh `server.port` trong `vite.config.ts`.

## Tài liệu dữ liệu hệ thống
- Báo cáo chi tiết về dữ liệu, định dạng, lưu trữ, sao lưu và chia sẻ: `docs/bao-cao-du-lieu-he-thong.md`.

## License
Không đính kèm giấy phép. Vui lòng thêm nếu cần cho dự án của bạn.