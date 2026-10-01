CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at);

CREATE TABLE image_objects (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  uploaded_by TEXT NOT NULL REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Disabling an account or changing credentials invalidates every session.
CREATE TRIGGER auth_password_revoke AFTER UPDATE OF password_hash,email ON auth_users
BEGIN
  DELETE FROM auth_sessions WHERE user_id = NEW.id;
END;
CREATE TRIGGER auth_profile_revoke AFTER UPDATE OF is_active,role ON user_profiles
BEGIN
  DELETE FROM auth_sessions WHERE user_id = NEW.id;
END;
