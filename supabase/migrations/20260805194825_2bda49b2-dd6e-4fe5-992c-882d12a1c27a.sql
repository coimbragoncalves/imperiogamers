CREATE TABLE public.facebook_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  page_id text NOT NULL,
  page_name text NOT NULL,
  access_token text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  last_error text,
  last_published_at timestamptz,
  last_published_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_id)
);

GRANT SELECT (id, user_id, page_id, page_name, status, last_error, last_published_at, last_published_title, created_at, updated_at) ON public.facebook_connections TO authenticated;
GRANT DELETE ON public.facebook_connections TO authenticated;
GRANT ALL ON public.facebook_connections TO service_role;

ALTER TABLE public.facebook_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view facebook connections"
ON public.facebook_connections FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete facebook connections"
ON public.facebook_connections FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_facebook_connections_updated_at
BEFORE UPDATE ON public.facebook_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();