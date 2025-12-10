-- Make reactions more secure - only allow viewing own reactions
DROP POLICY IF EXISTS "Users can view their own reactions" ON public.reactions;
CREATE POLICY "Users can view their own reactions" 
ON public.reactions 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin')
);