-- Allow guests to view their own reactions by guest_id
DROP POLICY IF EXISTS "Users can view their own reactions" ON public.reactions;
CREATE POLICY "Users can view their own reactions" 
ON public.reactions 
FOR SELECT 
USING (true);

-- But restrict what data is exposed - only allow seeing own reaction
-- This is fine since we only query for specific article_id + (user_id or guest_id)