CREATE TABLE public.weekly_plan_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url text NOT NULL,
  storage_path text,
  caption text,
  duration_seconds integer,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_plan_reels TO authenticated;
GRANT ALL ON public.weekly_plan_reels TO service_role;

ALTER TABLE public.weekly_plan_reels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage weekly plan reels"
ON public.weekly_plan_reels FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));