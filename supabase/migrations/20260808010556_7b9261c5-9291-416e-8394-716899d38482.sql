DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_comment_authors(p_article_id uuid)
RETURNS TABLE (user_id uuid, username text, is_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id,
         p.username,
         EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin'::app_role)
  FROM public.profiles p
  WHERE p.id IN (
    SELECT c.user_id FROM public.comments c
    WHERE c.article_id = p_article_id AND c.user_id IS NOT NULL AND c.is_hidden = false
  )
$$;

REVOKE ALL ON FUNCTION public.get_comment_authors(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_comment_authors(uuid) TO anon, authenticated, service_role;