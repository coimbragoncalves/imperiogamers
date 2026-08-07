ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS facebook_post_mode text NOT NULL DEFAULT 'card';

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_facebook_post_mode_check;

ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_facebook_post_mode_check
  CHECK (facebook_post_mode IN ('card', 'full'));