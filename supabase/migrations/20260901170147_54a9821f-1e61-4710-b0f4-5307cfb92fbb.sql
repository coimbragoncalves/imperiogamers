ALTER TABLE public.ai_settings
ADD COLUMN IF NOT EXISTS posts_per_type_map jsonb NOT NULL DEFAULT '{"news": 3, "review": 3, "trailer": 3, "curiogame": 2}'::jsonb;