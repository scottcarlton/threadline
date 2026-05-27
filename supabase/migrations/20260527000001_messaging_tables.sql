-- Add imessage to order_channel enum (whatsapp and sms already exist)
ALTER TYPE order_channel ADD VALUE IF NOT EXISTS 'imessage';

-- Add messaging_phone to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS messaging_phone text UNIQUE;

-- Session status enum
CREATE TYPE messaging_session_status AS ENUM ('active', 'expired', 'completed');

-- Messaging channel enum
CREATE TYPE messaging_channel AS ENUM ('whatsapp', 'sms', 'imessage');

-- Sessions table
CREATE TABLE messaging_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  channel messaging_channel NOT NULL,
  conversation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  status messaging_session_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX idx_messaging_sessions_phone ON messaging_sessions (phone_number, status);
CREATE INDEX idx_messaging_sessions_profile ON messaging_sessions (profile_id, status);

-- Messages table
CREATE TABLE messaging_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES messaging_sessions(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text,
  media_url text,
  media_type text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messaging_messages_session ON messaging_messages (session_id, created_at);

-- RLS: messaging tables are server-only (supabaseAdmin), no anon/authenticated access
ALTER TABLE messaging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_messages ENABLE ROW LEVEL SECURITY;
