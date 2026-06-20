-- Tighten storage listing on uploads bucket (public file URLs still work)
DROP POLICY IF EXISTS "Anyone can view uploads" ON storage.objects;

CREATE POLICY "Admins can list uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'uploads' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Lock down trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
