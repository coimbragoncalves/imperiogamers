-- Create table for AI auto-posting settings
CREATE TABLE public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT false,
  source_sites jsonb NOT NULL DEFAULT '["pcgamer.com", "kotaku.com", "polygon.com", "gamespot.com", "ign.com"]'::jsonb,
  youtube_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule_times jsonb NOT NULL DEFAULT '["08:00", "15:00", "20:00"]'::jsonb,
  last_run_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage AI settings
CREATE POLICY "Admins can manage AI settings" ON public.ai_settings
FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_ai_settings_updated_at
BEFORE UPDATE ON public.ai_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings row
INSERT INTO public.ai_settings (id) VALUES (gen_random_uuid());

-- Create table to log AI-generated posts
CREATE TABLE public.ai_post_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  source_site text NOT NULL,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  content_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_post_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view AI post logs
CREATE POLICY "Admins can manage AI post logs" ON public.ai_post_logs
FOR ALL USING (has_role(auth.uid(), 'admin'));