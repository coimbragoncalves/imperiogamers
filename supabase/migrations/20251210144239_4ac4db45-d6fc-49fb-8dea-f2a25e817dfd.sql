-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles;

-- Create a more secure policy - users can only see their own roles
CREATE POLICY "Users can view their own roles" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));