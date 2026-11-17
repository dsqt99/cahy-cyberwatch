-- ============================================================
-- Google OAuth + bảng profiles cho Supabase Auth
-- Chạy trong: Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1) Bảng profiles: lưu role (admin/guest) cho mỗi user
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'guest' check (role in ('admin','guest')),
  created_at timestamptz default now()
);

-- 2) Bật Row Level Security
alter table public.profiles enable row level security;

-- 3) Policy: user chỉ đọc được profile của chính mình
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- (Tùy chọn) user tự cập nhật profile của mình — KHÔNG cho đổi role.
-- Việc gán role để admin làm thủ công bằng SQL (mục 6).

-- 3b) Bảng allowed_users: danh sách email được phép đăng nhập.
--     Chỉ email nằm trong bảng này mới tạo được tài khoản.
create table if not exists public.allowed_users (
  email text primary key,
  role text not null default 'guest' check (role in ('admin','guest')),
  note text,
  created_at timestamptz default now()
);

alter table public.allowed_users enable row level security;

-- Chỉ admin (theo profiles.role) được đọc/sửa danh sách whitelist.
drop policy if exists "admin manage allowed_users" on public.allowed_users;
create policy "admin manage allowed_users" on public.allowed_users
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 4) Hàm: tạo profile khi user mới đăng nhập — CHỈ nếu email có trong allowed_users.
--    Email ngoài whitelist -> raise exception -> GoTrue rollback -> login thất bại.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_role text;
begin
  select role into allowed_role
  from public.allowed_users
  where lower(email) = lower(new.email);

  if allowed_role is null then
    raise exception 'Email % không được phép đăng nhập.', new.email
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    allowed_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5) Trigger: chạy hàm trên mỗi khi auth.users có user mới
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 6) Thêm email vào whitelist (LÀM TRƯỚC KHI user đăng nhập lần đầu).
--    Đổi email cho đúng. role: 'admin' hoặc 'guest'.
-- ============================================================
-- insert into public.allowed_users (email, role, note) values
--   ('admin@gmail.com', 'admin', 'Quản trị'),
--   ('canbo@gmail.com', 'guest', 'Cán bộ')
-- on conflict (email) do update set role = excluded.role;

-- Gán/đổi quyền cho user ĐÃ đăng nhập:
-- update public.profiles set role = 'admin' where email = 'you@gmail.com';

-- Kiểm tra:
-- select email, role from public.allowed_users order by created_at desc;
-- select id, email, role, created_at from public.profiles order by created_at desc;
