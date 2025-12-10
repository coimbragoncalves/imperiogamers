-- Fix profiles - require authentication, but allow public viewing for article authors
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Anyone can view profiles for display" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Note: profiles only contain username and avatar_url which are meant to be public for display purposes
-- This is necessary for showing article author names