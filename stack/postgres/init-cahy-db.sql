-- CAHY CyberWatch - Pure PostgreSQL Database Schema & Default Seed
-- Database: cahy_cyberwatch

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. User Accounts & RBAC Tables (Pure PostgreSQL Auth without Supabase GoTrue)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('admin', 'guest')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'guest',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allowed_users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'guest',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fn_sync_app_user_to_profiles()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url, role, created_at)
  VALUES (NEW.id, LOWER(TRIM(NEW.email)), NEW.full_name, NEW.avatar_url, NEW.role, NEW.created_at)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    role = EXCLUDED.role;

  INSERT INTO allowed_users (email, role, note, created_at)
  VALUES (LOWER(TRIM(NEW.email)), NEW.role, COALESCE(NEW.full_name, ''), NEW.created_at)
  ON CONFLICT (email) DO UPDATE SET
    role = EXCLUDED.role,
    note = EXCLUDED.note;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_app_user ON app_users;
CREATE TRIGGER trg_sync_app_user
AFTER INSERT OR UPDATE ON app_users
FOR EACH ROW EXECUTE FUNCTION fn_sync_app_user_to_profiles();

-- Seed default operator accounts (Password: CAHY@2026)
INSERT INTO app_users (email, password_hash, full_name, role, is_active)
VALUES
  ('admin@cahy.gov.vn', crypt('CAHY@2026', gen_salt('bf')), 'Quản trị viên Hệ thống CAHY', 'admin', TRUE),
  ('canbo@cahy.gov.vn', crypt('CAHY@2026', gen_salt('bf')), 'Cán bộ Theo dõi Không gian mạng', 'guest', TRUE)
ON CONFLICT (email) DO NOTHING;

-- 2. Reference Tables: types, sentiments, sources, settings
CREATE TABLE IF NOT EXISTS types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE TABLE IF NOT EXISTS sentiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  link TEXT,
  metadata JSONB,
  type_id UUID REFERENCES types(id) ON DELETE SET NULL,
  parent_id UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sources_parent_id ON sources(parent_id);
CREATE INDEX IF NOT EXISTS idx_sources_type_id ON sources(type_id);

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Core Intelligence Tables: news, news_queue, rebuttals, trend_reports, reports, news_articles
CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  content TEXT,
  link TEXT,
  publish_date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sentiment_id UUID REFERENCES sentiments(id) ON DELETE SET NULL,
  summary TEXT,
  keywords TEXT,
  screenshot TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  tag TEXT,
  status TEXT,
  comment_status TEXT,
  channel TEXT DEFAULT 'ANTT'
);

CREATE INDEX IF NOT EXISTS idx_news_channel_pubdate ON news(channel, publish_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_news_channel_created ON news(channel, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_news_source_id ON news(source_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_news_sentiment_id ON news(sentiment_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION fn_news_auto_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_parent UUID;
  v_name TEXT;
BEGIN
  IF NEW.channel IS NULL OR NEW.channel = '' THEN
    IF NEW.source_id IS NOT NULL THEN
      SELECT parent_id, name INTO v_parent, v_name FROM sources WHERE id = NEW.source_id;
      IF NEW.source_id = 'e9731f2c-b7a8-4696-ab0e-f3263044aed8'::uuid
         OR v_parent = 'e9731f2c-b7a8-4696-ab0e-f3263044aed8'::uuid
         OR LOWER(COALESCE(v_name, '')) = 'facebook phản động' THEN
        NEW.channel := 'PhanDong';
      ELSE
        NEW.channel := 'ANTT';
      END IF;
    ELSE
      NEW.channel := 'ANTT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_news_auto_channel ON news;
CREATE TRIGGER trg_news_auto_channel
BEFORE INSERT OR UPDATE ON news
FOR EACH ROW EXECUTE FUNCTION fn_news_auto_channel();

CREATE TABLE IF NOT EXISTS news_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_news_queue_status ON news_queue(status, created_at DESC);

CREATE TABLE IF NOT EXISTS rebuttals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  content TEXT,
  status TEXT DEFAULT 'draft',
  post_url TEXT,
  image_base64 TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rebuttals_created ON rebuttals(created_at DESC);

CREATE TABLE IF NOT EXISTS trend_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  period_start TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  period_end TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  source TEXT,
  channel TEXT DEFAULT 'ANTT',
  title TEXT,
  content TEXT NOT NULL,
  stats JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trend_reports_lookup ON trend_reports(channel, period, period_start DESC);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  target TEXT,
  description TEXT,
  type TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  content TEXT,
  excerpt TEXT,
  image_url TEXT,
  author TEXT DEFAULT 'Admin',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE VIEW v_news_detail AS
SELECT
  n.id,
  n.content,
  n.link,
  n.publish_date,
  s.name AS source_name,
  s.link AS source_link,
  st.name AS sentiment,
  t.name AS source_type,
  ps.name AS parent_source,
  n.summary,
  n.keywords,
  n.created_at
FROM news n
LEFT JOIN sources s ON n.source_id = s.id
LEFT JOIN sentiments st ON n.sentiment_id = st.id
LEFT JOIN types t ON s.type_id = t.id
LEFT JOIN sources ps ON s.parent_id = ps.id
WHERE n.deleted_at IS NULL;

