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
| `foxprofileDir` | `D:\code\foxprofile` | Đường dẫn thư mục mã nguồn FoxProfile (chứa `.venv`) |
| `foxprofilePort` | `8010` | Cổng REST API & Web Panel của FoxProfile |
| `foxprofileToken` | `""` | Bearer token nếu FoxProfile bật xác thực |
| `headed` | `true` | `true`: hiển thị cửa sổ trình duyệt khi chụp; `false`: chạy ẩn |
| `webhookHost` / `webhookPort` | `127.0.0.1` / `5680` | Địa chỉ lắng nghe Webhook chụp ảnh & cookie cho n8n |
| `screenshotDir` | `C:\Users\Administrator\n8n-docker\data\screenshot` | Thư mục gốc lưu ảnh bằng chứng số |
| `defaultProfile` | `""` | Profile mặc định (để trống = tự động chọn thông minh) |
| `dashboardPort` | `5690` | Cổng phục vụ giao diện Dashboard cục bộ |
| `n8nUrl` | `https://n8n.anm05.com` | Địa chỉ máy chủ n8n |
| `n8nWebhookBase` | `https://n8n.anm05.com/webhook/` | Tiền tố URL gọi các webhook điều khiển n8n |
| `n8nApiKey` | `""` | `X-N8N-API-KEY` từ n8n Settings > n8n API để bật/tắt workflows từ app |
| `desktopOperatorPasscode` | `""` | Mã mở khóa quản trị viên máy trạm cục bộ (tùy chọn) |
| `minimizeToTray` | `true` | Thu nhỏ xuống khay hệ thống khi đóng cửa sổ để giữ webhook chạy ngầm |

---

## Cài đặt, Kiểm thử & Đóng gói Portable `.exe`

### 1. Chuẩn bị FoxProfile (Python 3.10+)
```powershell
git clone https://github.com/chienbm98/foxprofile.git D:\code\foxprofile
cd D:\code\foxprofile
git checkout v2.3.1
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m camoufox sync
.venv\Scripts\python -m camoufox set official/stable/152.0.4-beta.31
.venv\Scripts\python -m camoufox fetch
```

### 2. Import Workflow Điều khiển & Xác thực lên n8n
Import file `../n8n_workflow/Auth & Điều khiển Hệ thống CyberWatch.json` vào máy chủ n8n và bật **Active** để kích hoạt các webhook `/webhook/auth-login`, `/webhook/trigger-collection`, `/webhook/run-trend-report`.

### 3. Chạy phát triển & Kiểm thử tự động
```powershell
cd cahy-cyberwatch
npm install
npm run build:dashboard   # Build giao diện Dashboard mới nhất
npm test                  # Chạy bộ unit & HTTP integration tests
npm run smoke             # Kiểm thử khởi động Electron + dịch vụ cục bộ
npm start                 # Mở ứng dụng CAHY CyberWatch Desktop
```

### 4. Đóng gói bản Portable `.exe` cho Windows
```powershell
cd cahy-cyberwatch
npm run dist
```
File thực thi hoàn chỉnh sẽ được xuất tại `cahy-cyberwatch/dist/CAHY CyberWatch 2.0.0.exe`.
