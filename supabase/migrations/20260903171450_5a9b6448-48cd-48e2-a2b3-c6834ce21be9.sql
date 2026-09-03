CREATE TABLE public.weekly_plan_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url text NOT NULL,
  storage_path text,
  caption text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_plan_images TO authenticated;
GRANT ALL ON public.weekly_plan_images TO service_role;

ALTER TABLE public.weekly_plan_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage weekly plan images"
ON public.weekly_plan_images FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));