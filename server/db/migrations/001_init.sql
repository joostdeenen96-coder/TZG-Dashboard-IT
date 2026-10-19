CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboards (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  theme_json jsonb NOT NULL DEFAULT '{"mode":"dark","glass":true}',
  layout_json jsonb NOT NULL DEFAULT '{"preset":"stack","stageWidth":2560,"stageHeight":1440}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id uuid PRIMARY KEY,
  dashboard_id uuid NOT NULL REFERENCES dashboards (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN (
      'waterlevels',
      'diesel',
      'weather',
      'news',
      'slideshow',
      'clock',
      'text',
      'prtg',
      'agenda'
    )
  ),
  title text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  layout_json jsonb NOT NULL DEFAULT '{"area":"main"}',
  data_source_json jsonb NOT NULL DEFAULT '{"kind":"none"}',
  settings_json jsonb NOT NULL DEFAULT '{}',
  refresh_interval_seconds integer NOT NULL DEFAULT 300,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_widgets_dashboard_id_idx ON dashboard_widgets (dashboard_id);

CREATE TABLE IF NOT EXISTS screens (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  dashboard_id uuid REFERENCES dashboards (id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  location text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS screens_dashboard_id_idx ON screens (dashboard_id);
CREATE INDEX IF NOT EXISTS screens_last_seen_at_idx ON screens (last_seen_at);

CREATE TABLE IF NOT EXISTS screen_tokens (
  id uuid PRIMARY KEY,
  screen_id uuid NOT NULL REFERENCES screens (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS screen_tokens_screen_id_idx ON screen_tokens (screen_id);
CREATE INDEX IF NOT EXISTS screen_tokens_revoked_at_idx ON screen_tokens (revoked_at);

CREATE TABLE IF NOT EXISTS screen_heartbeats (
  id uuid PRIMARY KEY,
  screen_id uuid NOT NULL REFERENCES screens (id) ON DELETE CASCADE,
  reported_at timestamptz NOT NULL DEFAULT now(),
  app_version text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ok',
  metadata_json jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS screen_heartbeats_screen_reported_idx ON screen_heartbeats (screen_id, reported_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  actor text NOT NULL,
  details_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx ON audit_logs (organization_id, created_at DESC);

INSERT INTO organizations (id, name, slug)
VALUES ('11111111-1111-4111-8111-111111111111', 'Teunesen', 'teunesen')
ON CONFLICT (slug) DO NOTHING;
