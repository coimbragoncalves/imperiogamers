-- More restrictive policy - users can only see their own reactions
DROP POLICY IF EXISTS "Users can view their own reactions" ON public.reactions;
CREATE POLICY "Users can view their own reactions" 
ON public.reactions 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));