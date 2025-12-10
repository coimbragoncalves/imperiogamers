-- Fix profiles table - only authenticated users can view
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (true);

-- Fix reactions table - users can only see their own reactions, but allow count queries
DROP POLICY IF EXISTS "Reactions are viewable by everyone" ON public.reactions;
CREATE POLICY "Users can view their own reactions" 
ON public.reactions 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR guest_id IS NOT NULL 
  OR has_role(auth.uid(), 'admin')
);

-- Fix site_settings - only admins can view
DROP POLICY IF EXISTS "Settings are viewable by everyone" ON public.site_settings;
CREATE POLICY "Only admins can view settings" 
ON public.site_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));