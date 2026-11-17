# Thiết lập đăng nhập Google (OAuth) qua Supabase (self-hosted)

> Instance dùng: **`https://supabase.anm05.com`** (Supabase self-host bằng Docker,
> KHÔNG phải supabase.co). Vì vậy cấu hình provider nằm ở **biến môi trường GoTrue**,
> không có nút bật/tắt trong Dashboard.

Chỉ **email nằm trong bảng `allowed_users`** mới đăng nhập được. Email lạ bị từ chối
ngay tại DB (trigger raise exception) và bị `signOut` phía app.

---

## 1. Database

Chạy [`google-oauth-setup.sql`](./google-oauth-setup.sql) bằng **psql** hoặc **Studio SQL Editor**
của instance. Tạo: bảng `profiles`, bảng `allowed_users`, RLS, trigger auto tạo profile
(chỉ cho email whitelisted) khi user mới đăng nhập.

## 2. Google Cloud Console

1. https://console.cloud.google.com → tạo / chọn project
2. **APIs & Services → OAuth consent screen** → cấu hình (User type: External, tên app, email)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs** (callback của instance self-host):
     ```
     https://supabase.anm05.com/auth/v1/callback
     ```
4. Lưu **Client ID** và **Client Secret**

## 3. Server GoTrue (docker self-host) — `.env` của Supabase

Thêm/sửa các biến sau rồi restart service `auth`:

```env
# Bật provider Google
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<client_id>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<client_secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.anm05.com/auth/v1/callback

# Nơi redirect về sau khi login + allow list (nếu thiếu -> redirect về trang Studio)
GOTRUE_SITE_URL=http://localhost:8080
GOTRUE_URI_ALLOW_LIST=http://localhost:8080,http://localhost:8080/login,https://dashboard-tttt.anm05.com,https://dashboard-tttt.anm05.com/login
```

> Kiểm tra `docker-compose.yml`: service `auth` phải map các biến này trong block
> `environment:`. Nếu chưa có dòng `GOTRUE_EXTERNAL_GOOGLE_*` thì phải thêm, không thì
> `.env` bị bỏ qua.

Restart + verify:
```bash
docker compose up -d auth
# phải thấy "google":true
curl -s https://supabase.anm05.com/auth/v1/settings -H "apikey: <ANON_KEY>"
```

## 4. Quản lý user (whitelist)

Xem chi tiết ở [`quan-ly-user.md`](./quan-ly-user.md). Tóm tắt:

- **User mới** (chưa từng login) → chỉ cần thêm vào `allowed_users`, trigger tự tạo profile khi họ login.
- **User đã login** → phải sửa cả `profiles`.

```sql
-- Thêm admin/guest mới
insert into public.allowed_users (email, role, note) values
  ('admin@gmail.com', 'admin', 'Quản trị'),
  ('canbo@gmail.com', 'guest', 'Cán bộ')
on conflict (email) do update set role = excluded.role;
```

## Test

1. `npm run dev` → mở `http://localhost:8080/login`
2. Bấm **Đăng nhập với Google** → chọn tài khoản (phải nằm trong whitelist)
3. Quay về `http://localhost:8080/login#access_token=...` → app tự vào `/`.
   Email ngoài whitelist → hiện toast "không được phép truy cập".
4. Login username/password cũ vẫn chạy song song.

## Luồng hoạt động (tóm tắt)

- `signInWithGoogle()` → redirect sang Google → quay về `/login` kèm session (URL fragment `#access_token`).
- Client bật `detectSessionInUrl` + `flowType: 'implicit'` để bắt token từ fragment.
- `/login` và `ProtectedRoute` gọi `syncSessionToStorage()`: đọc session Supabase →
  lấy `role` từ `profiles`. Không có profile (email ngoài whitelist) → `signOut`, trả false.
- Có role → ghi `isAuthenticated` + `userRole` vào `sessionStorage` (UI đọc quyền từ đây).
- Logout gọi `signOut()`: clear cả session Supabase lẫn `sessionStorage`.

## Xử lý sự cố

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| `Unsupported provider: provider is not enabled` | GoTrue chưa bật Google | Mục 3, set `GOTRUE_EXTERNAL_GOOGLE_*`, restart |
| Login xong redirect về `.../project/default` (Studio) | `redirect_to` không nằm trong allow list | Mục 3, set `GOTRUE_SITE_URL` + `GOTRUE_URI_ALLOW_LIST` |
| `GET /rest/v1/profiles ... 406 Not Acceptable` | User có `auth.users` nhưng chưa có row `profiles` | Backfill profile — xem `quan-ly-user.md` |
| App đá ra login ngay sau khi login Google | Email không trong whitelist | Thêm vào `allowed_users` |
