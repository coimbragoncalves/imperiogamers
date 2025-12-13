-- Create downloads table for "Diversos" section
CREATE TABLE public.downloads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'game', -- 'game', 'tool', 'other'
  download_url TEXT NOT NULL,
  cover_image TEXT,
  file_size TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  views INTEGER NOT NULL DEFAULT 0,
  downloads_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Published downloads are viewable by everyone"
ON public.downloads
FOR SELECT
USING ((is_published = true) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage downloads"
ON public.downloads
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Increment downloads function
CREATE OR REPLACE FUNCTION public.increment_download_count(download_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.downloads SET downloads_count = downloads_count + 1 WHERE id = download_id;
END;
$$;

-- Increment download views function
CREATE OR REPLACE FUNCTION public.increment_download_views(download_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.downloads SET views = views + 1 WHERE id = download_id;
END;
$$;