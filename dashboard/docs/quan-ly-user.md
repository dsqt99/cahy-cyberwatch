# Quản lý user (thêm/sửa/xóa admin & guest)

Chạy SQL ở **psql** hoặc **Studio SQL Editor** của `https://supabase.anm05.com`.

## Quy tắc nhớ

- **User MỚI** (chưa từng login) → chỉ cần thêm vào `allowed_users`.
  Trigger tự tạo `profiles` đúng role khi họ login lần đầu.
- **User ĐÃ login** → profile đã tạo rồi, phải sửa cả `profiles`.

---

## 1. Thêm admin / guest mới (chưa login)

```sql
-- Một người
insert into public.allowed_users (email, role, note) values
  ('admin_moi@gmail.com', 'admin', 'Tên admin')
on conflict (email) do update set role = excluded.role;

-- Nhiều người cùng lúc
insert into public.allowed_users (email, role, note) values
  ('a@gmail.com', 'admin', 'A'),
  ('b@gmail.com', 'guest', 'B'),
  ('c@gmail.com', 'guest', 'C')
on conflict (email) do update set role = excluded.role;
```

Xong → báo họ đăng nhập Google. Trigger tự tạo profile.

## 2. Đổi quyền / thêm quyền cho user ĐÃ login

Phải update cả 2 bảng:

```sql
update public.allowed_users set role = 'admin' where email = 'x@gmail.com';
update public.profiles      set role = 'admin' where email = 'x@gmail.com';
```

## 3. Backfill profile cho user đã login trước khi có whitelist

Dùng khi user đã có trong `auth.users` nhưng thiếu `profiles` (lỗi 406 khi đọc profile):

```sql
-- Bước 1: đảm bảo email có trong whitelist
insert into public.allowed_users (email, role, note) values
  ('x@gmail.com', 'admin', 'ghi chú')
on conflict (email) do update set role = excluded.role;

-- Bước 2: tạo profile cho MỌI user đã login mà có trong whitelist
insert into public.profiles (id, email, full_name, avatar_url, role)
select
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'avatar_url',
  a.role
from auth.users u
join public.allowed_users a on lower(a.email) = lower(u.email)
on conflict (id) do update set role = excluded.role;
```

## 4. Chặn / xóa user

```sql
-- Bỏ khỏi whitelist (không cho login lại)
delete from public.allowed_users where email = 'x@gmail.com';

-- Xóa hẳn tài khoản (đá session hiện tại, login lại sẽ bị chặn)
delete from auth.users where email = 'x@gmail.com';
-- profiles có ON DELETE CASCADE nên tự xóa theo.
```

## 5. Xem danh sách

```sql
-- Whitelist
select email, role, note, created_at from public.allowed_users order by created_at desc;

-- User đã có profile
select id, email, role, created_at from public.profiles order by created_at desc;

-- User đã login nhưng CHƯA có profile (cần backfill mục 3)
select u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
```
