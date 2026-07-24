CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- Unique account identifier: "username#discriminator" (Discord-style), e.g. Bob#0001.
-- Two users CAN share a username as long as the (username, discriminator) pair is unique.
ALTER TABLE users ADD COLUMN IF NOT EXISTS discriminator TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_discriminator_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_username_discriminator_key UNIQUE (username, discriminator);
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#e6392f';
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_show_activity BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_allow_friend_requests BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'online'; -- online|idle|dnd|invisible|offline
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'; -- user|admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_avatar_url TEXT;

-- Internal-only unique account identifier, format "############.#######" (12
-- digits, a literal dot, then a 6-digit sequence). Never surfaced in any
-- normal-facing API response (no route currently selects it into a user
-- object sent to a non-admin) - it exists purely for account security /
-- unambiguous identification, e.g. matching support requests or audit trails
-- to one exact account regardless of email/username changes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS internal_account_id TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  tvg_id TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  logo TEXT,
  group_name TEXT NOT NULL DEFAULT 'Uncategorized',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS watch_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Social: friend requests + accepted friendships
CREATE TABLE IF NOT EXISTS friend_requests (
  id SERIAL PRIMARY KEY,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id)
);

-- Social: rooms (watch parties / group chats), membership, and chat messages
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  active_channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  discord_voice_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Direct (1:1) messages, independent of rooms
CREATE TABLE IF NOT EXISTS direct_messages (
  id SERIAL PRIMARY KEY,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read receipts: last message id a user has read, per room and per DM thread
CREATE TABLE IF NOT EXISTS room_reads (
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, other_user_id)
);

-- Invite a friend to a room/channel ("Invite <friend> to watch ___")
CREATE TABLE IF NOT EXISTS room_invites (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uploaded media assets (admin/permitted-user uploads), independently of whether
-- they've been published into the channel catalog.
CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL, -- video|audio|image
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Uncategorized', -- e.g. Movies, TV Shows, Live TV
  published_channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants non-admin users permission to upload media assets
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_upload_assets BOOLEAN NOT NULL DEFAULT false;

-- Profile badges: a fixed catalog (code defines the visuals/meaning) plus a
-- join table of who has what. Kept data-only here - icon/gradient/glow are
-- rendered client-side from BADGE_DEFINITIONS keyed by `slug`, so adding a
-- new badge design never requires a migration, only a new catalog entry.
CREATE TABLE IF NOT EXISTS user_badges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_slug TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, badge_slug)
);

-- Advanced Artwork Pipeline Persistent Cache
CREATE TABLE IF NOT EXISTS artwork_cache (
  query_key TEXT PRIMARY KEY,       -- e.g., "tv:breaking bad"
  title TEXT NOT NULL,
  resolved_name TEXT,
  tmdb_id INTEGER,
  overview TEXT,
  poster_url TEXT,
  background_url TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
