# Báo cáo dữ liệu hệ thống — Social Tracking Dashboard

Tài liệu này mô tả dữ liệu hệ thống thu thập tin tức social: mô hình, định dạng, lưu trữ, quy trình sao lưu và cách chia sẻ dữ liệu cho đơn vị sử dụng.

## 1) Tổng quan hệ thống dữ liệu
- Mục tiêu: thu thập, chuẩn hóa, phân loại và phân tích tin tức từ Facebook, các báo điện tử (RSS/Sitemap) để phục vụ theo dõi tình hình trật tự xã hội, thông tin dư luận.
- Nền tảng lưu trữ: PostgreSQL do Supabase quản lý; ảnh chụp/screenshot và tệp có thể lưu ở Device Storage, tạo đường dẫn public.
 

## 2) Mô hình dữ liệu (Database schema)
Hệ thống gồm 4 bảng chính, quan hệ như sau:
```
news ──┬── sources ── types
       └── sentiments
```

### Bảng `types` (loại nguồn)
- Trường chính: `id`, `name`.
- Vai trò: định danh loại platform/nguồn (ví dụ: `trang`, `nhóm`, `trang cá nhân`).

### Bảng `sentiments` (cảm xúc)
- Trường chính: `id`, `name`.
- Vai trò: phân loại cảm xúc bài tin (`Tích cực`, `Tiêu cực`, `Trung lập`).

### Bảng `sources` (nguồn)
- Trường chính: `id`, `name`, `link`, `metadata`, `type_id`, `parent_id`, `created_at`, `updated_at`, `deleted_at`.
- `type_id` → `types.id` (Many-to-One): mỗi nguồn thuộc một loại.
- `parent_id` → `sources.id` (tùy chọn): hỗ trợ phân cấp (ví dụ: `Facebook` là parent của các page/group).
- `metadata` dạng `JSONB`: lưu thông tin bổ sung (ví dụ: `page_id`, `channel_id`, định dạng RSS/Sitemap).

### Bảng `news` (bài tin)
- Trường chính: `id`, `source_id`, `group_id`, `content`, `link`, `publish_date`, `sentiment_id`, `summary`, `keywords`, `screenshot`, `metadata`, `created_at`, `updated_at`, `deleted_at`.
- `source_id` → `sources.id` (Many-to-One).
- `sentiment_id` → `sentiments.id` (Many-to-One).
- `metadata` dạng `JSONB`: lưu thông tin xử lý (`processed_at`, `original_source`, v.v.).
- `screenshot` (TEXT): đường dẫn ảnh chụp.

Ghi chú: Chi tiết tạo bảng, chỉ mục và seed dữ liệu xem tệp `data/create_tables.sql`.

## 3) Định dạng dữ liệu (nhập/xuất)
### Cấu trúc trường theo bảng
- Bảng `types`: cột `id`, `name`, `created_at`, `updated_at`, `deleted_at`.
- Bảng `sentiments`: cột `id`, `name`, `created_at`, `updated_at`, `deleted_at`.
- Bảng `sources`: cột `id`, `name`, `link`, `metadata`, `type_id`, `parent_id`, `created_at`, `updated_at`, `deleted_at`.
  - `metadata` là JSON (ví dụ: thông tin RSS/Sitemap, `page_id`).
- Bảng `news`: cột `id`, `source_id`, `content`, `link`, `publish_date`, `sentiment_id`, `summary`, `keywords`, `screenshot`, `metadata`, `created_at`, `updated_at`, `deleted_at`.
  - `publish_date` là `TIMESTAMP` (có thể rỗng với một số nguồn xã hội).
  - `metadata` là JSON (ví dụ: `processed_at`, `original_source`).

### Quy ước xử lý nhập
- Mã định danh (`id`) dùng UUID v4.
- Trường có thể để trống: `publish_date`, `screenshot`, `deleted_at`, `parent_id`, `type_id` tùy nguồn.
- Dấu phẩy và xuống dòng trong `content`/`summary`: nếu xuất/nhập dạng CSV cần bao bằng nháy kép.
- `keywords`: có thể lưu chuỗi phân tách bằng dấu phẩy hoặc đưa vào `metadata` nếu cần cấu trúc phong phú hơn.

### Định dạng xuất
- Hỗ trợ xuất/nhập CSV hoặc JSON theo schema bảng nêu trên.

## 4) Lưu trữ dữ liệu
- CSDL chính: Supabase với các bảng `types`, `sentiments`, `sources`, `news`.
- Lưu trữ tệp/screenshot: Device storage: `screenshots/`. Đường dẫn được export thành link public "https://n8n.anm05.com/screenshots/facebook/post_facebook_109533114737743_841121858258671.png"

  - Trường `news.screenshot` lưu đường dẫn tương đối, ví dụ: `screenshots/2025/10/abc123.png`.
- Ảnh/chứng cứ lớn: dùng bucket riêng hoặc object storage ngoài (S3) nếu dung lượng tăng mạnh.
- Chỉ mục: đã tạo index trên các cột tra cứu chính (ví dụ: `news(source_id)`, `news(sentiment_id)`, `news(publish_date)`, `sources(type_id)`, `sources(parent_id)`).

## 5) Luồng dữ liệu điển hình
- Thu thập: crawler/worker lấy từ RSS, Sitemap, Facebook.
- Chuẩn hóa: ánh xạ field theo schema đã xác định; bổ sung `metadata` (nguồn gốc, thời gian xử lý, ID kênh/trang).
- Phân loại: gán `sentiment_id` theo mô hình/heuristics; gán `type_id` cho `sources` và `parent_id` theo cây nguồn.
- Lưu trữ: insert vào Supabase `news`; nếu có ảnh thì lưu đường dẫn vào `screenshot`.
- Phục vụ hiển thị: ứng dụng React lấy dữ liệu qua Supabase client (`src/lib/supabase.ts`) với join tới `sources`, `types`, `sentiments`.

## 6) Sao lưu (Backup) và khôi phục (Restore)
### Mục tiêu
- Bảo toàn dữ liệu lịch sử bài tin, nguồn, phân loại cảm xúc.
- Phòng sự cố (xóa nhầm, rủi ro vận hành, sự cố hạ tầng).

### Chính sách đề xuất
- Tần suất: sao lưu logic hàng ngày (daily), lưu bản tuần (weekly) và tháng (monthly) với vòng đời 90–180 ngày.
- Loại sao lưu:
  - Sao lưu CSDL (logical dump): `pg_dump` mức schema + data cho các bảng.
  - Xuất dữ liệu định kỳ (CSV/JSON) khi cần phục vụ báo cáo/trao đổi.
- Lưu trữ bản sao: ít nhất 2 nơi (primary + offsite), mã hóa khi lưu trữ (AES-256 ở object storage). 
- Kiểm thử khôi phục: định kỳ test restore bản gần nhất vào môi trường staging.

### Ví dụ lệnh (tham khảo môi trường PostgreSQL)
- Xuất dump toàn bộ schema:
  - `pg_dump -Fc -h <host> -U <user> -d <database> -f backup_YYYYMMDD.dump`
- Khôi phục:
  - `pg_restore -h <host> -U <user> -d <database> --clean --if-exists backup_YYYYMMDD.dump`
- Xuất CSV từng bảng (chạy trong `psql`):
  - `\copy types TO 'types_rows_YYYYMMDD.csv' CSV HEADER`
  - `\copy sentiments TO 'sentiments_rows_YYYYMMDD.csv' CSV HEADER`
  - `\copy sources TO 'sources_rows_YYYYMMDD.csv' CSV HEADER`
  - `\copy news TO 'news_rows_YYYYMMDD.csv' CSV HEADER`

Ghi chú: Với Supabase, có thể dùng tính năng `Backups` hoặc kết nối trực tiếp DB Hosting để chạy lệnh trên CI (GitHub Actions/cron job máy chủ).

## 7) Chia sẻ dữ liệu cho đơn vị sử dụng
### Các hình thức chia sẻ
- API đọc (Read-only):
  - Sử dụng PostgREST/Supabase: cung cấp endpoint `GET /news?select=*,source:sources(*,type:types(*)),sentiment:sentiments(*)` với RLS cho phép đọc.
  - Tạo `service role` hoặc `anon` key read-only, giới hạn bảng và cột cần thiết.
- Dashboard truy cập:
  - Đơn vị được cấp tài khoản truy cập ứng dụng (Vercel) để xem dữ liệu trực tiếp.

### Kiểm soát truy cập và an toàn
- Kích hoạt RLS (Row Level Security) trên các bảng, cấp policy chỉ đọc cho nhóm người dùng chia sẻ.
- Nhật ký truy cập: log request API để kiểm soát và truy vết.

## 8) Khuyến nghị vận hành
- Chuẩn hóa naming: thống nhất quy ước đặt tên giữa DB và frontend.
- Dòng thời gian: lưu `created_at`, `updated_at`, `deleted_at` phục vụ audit và soft delete.
- Tự động hóa:
  - Thiết lập job sao lưu định kỳ.
  - Thiết lập job xuất dữ liệu định kỳ phục vụ báo cáo.
- Tài liệu hóa:
  - Cập nhật changelog khi thay đổi schema.
  - Ghi rõ phiên bản dataset khi phát hành snapshot.