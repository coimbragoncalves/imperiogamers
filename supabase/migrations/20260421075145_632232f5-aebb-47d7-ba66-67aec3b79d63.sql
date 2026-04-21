-- Featured fields on articles
ALTER TABLE public.articles 
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_order integer;

CREATE INDEX IF NOT EXISTS idx_articles_featured ON public.articles(is_featured, featured_order) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles(created_at);

-- Featured slides (admin-uploaded extra images for the home carousel)
CREATE TABLE IF NOT EXISTS public.featured_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  title text,
  subtitle text,
  link_url text,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.featured_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Featured slides are viewable by everyone"
  ON public.featured_slides FOR SELECT
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage featured slides"
  ON public.featured_slides FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_featured_slides_updated_at
  BEFORE UPDATE ON public.featured_slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Featured settings (singleton row controlling the slider and cleanup)
CREATE TABLE IF NOT EXISTS public.featured_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slider_enabled boolean NOT NULL DEFAULT true,
  auto_cleanup_enabled boolean NOT NULL DEFAULT false,
  auto_cleanup_threshold integer NOT NULL DEFAULT 200,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.featured_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Featured settings viewable by everyone"
  ON public.featured_settings FOR SELECT USING (true);

CREATE POLICY "Admins can manage featured settings"
  ON public.featured_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_featured_settings_updated_at
  BEFORE UPDATE ON public.featured_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed singleton row
INSERT INTO public.featured_settings (slider_enabled, auto_cleanup_enabled, auto_cleanup_threshold)
SELECT true, false, 200
WHERE NOT EXISTS (SELECT 1 FROM public.featured_settings);

-- Function to delete the 40 oldest articles (admin only)
CREATE OR REPLACE FUNCTION public.cleanup_oldest_articles(p_count integer DEFAULT 40)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can perform cleanup';
  END IF;

  WITH oldest AS (
    SELECT id FROM public.articles
    ORDER BY created_at ASC
    LIMIT p_count
  )
  DELETE FROM public.articles WHERE id IN (SELECT id FROM oldest);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;