-- Bảng lưu báo cáo phân tích xu hướng theo khung thời gian cố định.
-- n8n chạy định kỳ (ngày/tuần/tháng), sinh báo cáo và insert vào bảng này.
-- Frontend (AlertReport.tsx) chỉ đọc + filter, không tự sinh báo cáo.

create table if not exists public.trend_reports (
  id            uuid primary key default gen_random_uuid(),
  period        text not null check (period in ('day', 'week', 'month')),
  period_start  timestamp without time zone not null,  -- 00:00 mốc đầu (giờ local VN)
  period_end    timestamp without time zone not null,  -- mốc cuối (exclusive: 00:00 ngày kế = "24h" ngày cuối)
  source        text,                                   -- null = tất cả nguồn
  channel       text,                                   -- 'ANTT' | 'PhanDong' | null (all)
  title         text,
  content       text not null,                          -- nội dung báo cáo (markdown/text)
  stats         jsonb,                                  -- { total, positive, negative, neutral, top_keywords: [...] }
  created_at    timestamp with time zone default now()
);

-- Tránh trùng report cho cùng khung + cùng mốc + cùng nguồn/kênh
create unique index if not exists trend_reports_unique_period
  on public.trend_reports (period, period_start, coalesce(source, ''), coalesce(channel, ''));

create index if not exists trend_reports_period_start_idx
  on public.trend_reports (period, period_start desc);

-- RLS: cho phép đọc bằng anon key (frontend), ghi bằng service_role (n8n)
alter table public.trend_reports enable row level security;

drop policy if exists trend_reports_read on public.trend_reports;
create policy trend_reports_read
  on public.trend_reports for select
  using (true);

-- service_role bypass RLS mặc định nên không cần policy insert riêng.
