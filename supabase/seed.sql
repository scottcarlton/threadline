-- Seed a test user for local development
-- Email: admin@threadline.dev
-- Password: password123

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  is_sso_user,
  is_anonymous
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@threadline.dev',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"display_name": "Admin User"}'::jsonb,
  NOW(),
  NOW(),
  '',
  '',
  '',
  '',
  '',
  NULL,
  '',
  '',
  '',
  FALSE,
  FALSE
) ON CONFLICT (id) DO NOTHING;

-- The profile trigger will auto-create the profile.
-- Now create an org and admin membership.

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'ThreadLine Demo', 'threadline-demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_members (organization_id, profile_id, role, accepted_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'admin', NOW())
ON CONFLICT (organization_id, profile_id) DO NOTHING;
