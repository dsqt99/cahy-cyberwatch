# CAHY CyberWatch — Hệ thống Giám sát & Điều hành Không gian mạng (All-in-One Desktop v2.0)

Ứng dụng Desktop **All-in-One** chuyên dụng của **Công an tỉnh Hưng Yên**, hợp nhất toàn bộ hệ sinh thái giám sát mạng xã hội, điều khiển tự động hóa **n8n**, quản lý tài khoản trình duyệt chống phát hiện **FoxProfile Antidetect**, chụp bằng chứng số và trích xuất Cookie Facebook trong một giao diện điều hành duy nhất.

---

## Kiến trúc Hợp nhất (All-in-One)

1. **Thanh Điều hành Trung tâm (Custom Command Chrome & Login Gate)**:
   - Khóa phân quyền toàn bộ không gian quản trị hạ tầng (`Tài khoản Antidetect`, `n8n Studio`, `Quản trị Trạm`) cho đến khi cán bộ đăng nhập hợp lệ với quyền `admin`.
   - Hỗ trợ phím tắt chuyển nhanh không gian làm việc:
     - `Ctrl+1` — **Giám sát & Điều hành (Dashboard + Điều khiển n8n)** (`http://localhost:5690`)
     - `Ctrl+2` — **Tài khoản Antidetect (FoxProfile Panel)** (`http://127.0.0.1:8010`)
     - `Ctrl+3` — **n8n Workflow Studio** (`https://n8n.anm05.com` hoặc n8n nội bộ)
     - `Ctrl+4` — **Quản trị Trạm Desktop** (cấu hình trực tiếp `config.json`, khởi động lại FoxProfile, kiểm thử chụp ảnh & cookie, xem `app.log`)
   - Thu nhỏ xuống **Khay hệ thống (System Tray)** để duy trì dịch vụ Webhook `127.0.0.1:5680` hoạt động liên tục 24/7 phục vụ n8n.

2. **Hệ thống Đăng nhập Đa chế độ (Điều phối qua n8n & Supabase RBAC)**:
   - **Tài khoản / n8n Auth (`Email + Mật khẩu`)**: Xác thực qua workflow n8n (`POST /webhook/auth-login` từ file `n8n_workflow/Auth & Điều khiển Hệ thống CyberWatch.json`) kết hợp Supabase Auth và bảng phân quyền `profiles` / `allowed_users` (`admin` | `guest`).
   - **Google OAuth SSO**: Tương thích 100% với luồng Supabase Google OAuth hiện hữu (cần thêm `http://localhost:5690/login` vào Redirect URLs trên Supabase GoTrue).
   - **Mã Điều hành Trạm Desktop (`desktopOperatorPasscode`)**: Tùy chọn mở khóa quản trị cục bộ trên máy trạm khi cấu hình trong `config.json`.

3. **Trung tâm Điều khiển Workflow n8n (Ngay trên Dashboard)**:
   - Nạp hàng loạt URL bài viết vào hàng đợi thu thập (`add-link-to-pending-queue`).
   - Bóc tách nhanh nội dung bài viết (`get-post-content`) và phát lệnh quét nguồn chủ động (`trigger-collection`).
   - Kích hoạt chiến dịch Auto Comment (`run-comment`), sinh bài đấu tranh phản bác (`run-rebuttal`) và tổng hợp báo cáo xu hướng AI (`run-trend-report`).
   - Quản lý lịch chạy tự động trên bảng `settings` (Supabase) và **bật/tắt trực tiếp các workflow trên máy chủ n8n** qua n8n Public REST API (`/api/v1/workflows`).
   - Quản lý trình duyệt FoxProfile, kiểm tra Cookie Facebook và chụp thử bằng chứng số kèm xem trước ảnh trực tiếp.

4. **Local Webhook & Evidence Engine (`127.0.0.1:5680` — Thay thế hoàn toàn `n8n-antidetect` MultiProfile)**:
   - `GET/POST /webhook/screenshot_{fb,fbpđ,news,tiktok}`:
     - Giữ nguyên 100% hợp đồng dữ liệu trả về `[{"outputFilePath": ["C:\\...\\post_<type>_<id>.png"]}]`.
     - **Tự động chọn Profile thông minh**: Khi workflow (như `Báo ver2`) không truyền `profile_id` và `defaultProfile` để trống, hệ thống tự động chọn profile phù hợp trong FoxProfile (hoặc tự khởi tạo `cahy-news-default` cho tin báo chí).
     - Xếp hàng tuần tự (per-profile queue) chống xung đột khi nhiều luồng n8n gọi cùng một tài khoản.
   - `GET/POST /webhook/export_fb_cookie`:
     - Trích xuất trực tiếp Cookie Facebook (bao gồm `c_user` và `xs` httpOnly) từ profile FoxProfile đã dừng, trả về `{ ok, profile_id, c_user, cookie }` thay thế hoàn toàn luồng CDP cũ.
   - `GET /webhook/health`: Kiểm tra sức khỏe toàn trạm.

---

## Cấu hình `config.json`

Đặt file `config.json` cạnh file thực thi `.exe` (hoặc trong thư mục `cahy-cyberwatch/` khi chạy dev), hoặc chỉnh sửa trực tiếp trong tab **Quản trị Trạm (`Ctrl+4`)**:

| Khóa cấu hình | Mặc định | Mô tả |
| --- | --- | --- |
| `foxprofileDir` | `foxprofile` | Thư mục FoxProfile (chứa `.venv`). Đường dẫn tương đối tính từ thư mục app |
| `foxprofilePort` | `8010` | Cổng REST API & Web Panel của FoxProfile |
| `foxprofileToken` | `""` | Bearer token nếu FoxProfile bật xác thực |
| `headed` | `true` | `true`: hiển thị cửa sổ trình duyệt khi chụp; `false`: chạy ẩn |
| `webhookHost` / `webhookPort` | `127.0.0.1` / `5680` | Địa chỉ lắng nghe Webhook chụp ảnh & cookie cho n8n |
| `screenshotDir` | `screenshots` | Thư mục lưu ảnh bằng chứng số. Phải khớp `SCREENSHOT_HOST_DIR` trong `stack/.env` |
| `defaultProfile` | `""` | Profile mặc định (để trống = tự động chọn thông minh) |
| `dashboardPort` | `5690` | Cổng phục vụ giao diện Dashboard cục bộ |
| `n8nUrl` | `http://localhost:5678` | Địa chỉ máy chủ n8n |
| `n8nWebhookBase` | `http://localhost:5678/webhook/` | Tiền tố URL gọi các webhook điều khiển n8n |
| `n8nApiKey` | `""` | `X-N8N-API-KEY` từ n8n Settings > n8n API để bật/tắt workflows từ app |
| `desktopOperatorPasscode` | `""` | Mã mở khóa quản trị viên máy trạm cục bộ (tùy chọn) |
| `minimizeToTray` | `true` | Thu nhỏ xuống khay hệ thống khi đóng cửa sổ để giữ webhook chạy ngầm |
| `webhookToken` | `""` | Nếu đặt: `/webhook/*` (trừ health) yêu cầu header `Authorization: Bearer <token>` hoặc `x-cahy-token`. Bắt buộc đặt khi `webhookHost` ≠ `127.0.0.1`. `/api/desktop/*` luôn chỉ cho loopback (hoặc kèm token) |
| `browserIdleSeconds` | `120` | Giữ trình duyệt profile mở sẵn giữa các lần chụp để chụp hàng loạt nhanh hơn; `0` = đóng ngay sau mỗi ảnh. Tự đóng khi xuất cookie |
| `screenshotRetentionDays` | `0` | Tự xóa ảnh bằng chứng cũ hơn N ngày (quét mỗi 24h); `0` = tắt, giữ vĩnh viễn |
| `captureRetries` | `1` | Số lần thử lại khi chụp lỗi mạng/timeout (không retry lỗi auth wall hoặc 4xx) |
| `captureJitterMinSeconds` / `MaxSeconds` | `2` / `6` | Khoảng nghỉ ngẫu nhiên giữa các lượt chụp liên tiếp trên cùng profile FB/TikTok |
| `maxConcurrentBrowsers` | `3` | Giới hạn số trình duyệt chụp ảnh chạy song song tối đa trên toàn trạm (`0` = không giới hạn) |

---

## Cài đặt, Kiểm thử & Đóng gói Portable `.exe`

Repo tự chứa đủ 4 phần, không cần thư mục ngoài:

| Thư mục | Nội dung | File cấu hình |
| --- | --- | --- |
| `./` | App Electron (shell, webhook 5680, dashboard 5690) | `config.json` (mẫu: `config.example.json`) |
| `dashboard/` | Giao diện React/Vite, build ra `dashboard/dist` | `dashboard/.env` (mẫu: `dashboard/.env.example`) |
| `foxprofile/` | FoxProfile Antidetect (Python, bản vendored từ chienbm98/foxprofile) | `foxprofile/.env` (mẫu: `foxprofile/.env.example`) |
| `stack/` | n8n + PostgreSQL + postgres-api (Docker) và các workflow JSON | `stack/.env` (mẫu: `stack/.env.example`) |

Các file `.env`, `config.json`, `foxprofile/camoufox_data` (cookie đăng nhập), `foxprofile/profiles.json` không được commit.

### 1. Cấu hình
```powershell
copy config.example.json config.json
copy dashboard\.env.example dashboard\.env
copy foxprofile\.env.example foxprofile\.env
copy stack\.env.example stack\.env
```
Điền API key vào `stack/.env` và `dashboard/.env`. `FOXPROFILE_API_TOKEN` trong `stack/.env` phải trùng `foxprofileToken` trong `config.json`.

### 2. Cài đặt (Node 20+, Python 3.10+, Docker Desktop)
```powershell
npm run setup          # npm install, cài + build dashboard, tạo foxprofile/.venv
foxprofile\.venv\Scripts\python -m camoufox fetch   # tải trình duyệt Camoufox (một lần mỗi máy)
```

### 3. Bật n8n + PostgreSQL
```powershell
cd stack
docker compose -f docker-compose.local.yml up -d --build
```
n8n tại `http://localhost:5678`, postgres-api tại `http://localhost:5434`. Import các file `stack/*.json` vào n8n (bắt đầu với `Auth & Điều khiển Hệ thống CyberWatch.json`) rồi bật **Active**.

### 4. Chạy app
```powershell
npm test               # unit & HTTP integration tests
npm start              # mở CAHY CyberWatch, app tự khởi động FoxProfile
```
### 5. Đóng gói bản Portable `.exe` cho Windows
```powershell
cd cahy-cyberwatch
npm run dist
```
File thực thi hoàn chỉnh sẽ được xuất tại `cahy-cyberwatch/dist/CAHY CyberWatch 2.0.0.exe`.
