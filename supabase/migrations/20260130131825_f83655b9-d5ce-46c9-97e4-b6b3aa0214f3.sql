-- 1. Fix overly permissive INSERT policy on comments (allows spam)
DROP POLICY IF EXISTS "Anyone can create comments" ON public.comments;
CREATE POLICY "Rate limited comment creation" 
ON public.comments 
FOR INSERT 
WITH CHECK (
  -- Authenticated users can comment
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Guest users must provide a name and content length is limited
  (auth.uid() IS NULL AND guest_name IS NOT NULL AND length(guest_name) >= 2 AND length(guest_name) <= 50 AND length(content) <= 2000)
);

-- 2. Fix overly permissive INSERT policy on reactions (allows spam)
DROP POLICY IF EXISTS "Anyone can create reactions" ON public.reactions;
CREATE POLICY "Controlled reaction creation" 
ON public.reactions 
FOR INSERT 
WITH CHECK (
  -- Authenticated users must set their user_id
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
  OR
  -- Guest users must have a guest_id
  (auth.uid() IS NULL AND guest_id IS NOT NULL AND length(guest_id) >= 10)
);

-- 3. Restrict profiles table - only authenticated users can view
DROP POLICY IF EXISTS "Anyone can view profiles for display" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 4. Hide user_id from comments for anonymous users - create a more restrictive policy
-- Comments content is public but we keep current policy as guest commenting is by design

-- 5. Add rate limiting function for comments (prevent spam)
CREATE OR REPLACE FUNCTION public.check_comment_rate_limit(p_user_id uuid, p_guest_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  -- Check comments in last 5 minutes
  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_count
    FROM public.comments
    WHERE user_id = p_user_id
    AND created_at > now() - interval '5 minutes';
  ELSE
    SELECT COUNT(*) INTO recent_count
    FROM public.comments
    WHERE guest_name = p_guest_name
    AND created_at > now() - interval '5 minutes';
  END IF;
  
  -- Allow max 5 comments per 5 minutes
  RETURN recent_count < 5;
END;
$$;

-- 6. Add input sanitization check function
CREATE OR REPLACE FUNCTION public.is_safe_content(content text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Block potential XSS/injection patterns
  IF content ~* '<script|javascript:|data:|onerror|onclick|onload' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- 7. Update comments INSERT policy with rate limiting and content check
DROP POLICY IF EXISTS "Rate limited comment creation" ON public.comments;
CREATE POLICY "Secure comment creation" 
ON public.comments 
FOR INSERT 
WITH CHECK (
  -- Must pass content safety check
  is_safe_content(content) AND
  -- Must pass rate limit
  check_comment_rate_limit(
    CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE NULL END,
    guest_name
  ) AND
  (
    -- Authenticated users
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    -- Guest users with valid name
    (auth.uid() IS NULL AND guest_name IS NOT NULL AND length(guest_name) BETWEEN 2 AND 50 AND length(content) <= 2000)
  )
);

-- 8. Add index for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_comments_user_created ON public.comments(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_guest_created ON public.comments(guest_name, created_at);

-- 9. Secure reactions with rate limiting
CREATE OR REPLACE FUNCTION public.check_reaction_rate_limit(p_user_id uuid, p_guest_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_count
    FROM public.reactions
    WHERE user_id = p_user_id
    AND created_at > now() - interval '1 minute';
  ELSE
    SELECT COUNT(*) INTO recent_count
    FROM public.reactions
    WHERE guest_id = p_guest_id
    AND created_at > now() - interval '1 minute';
  END IF;
  
  RETURN recent_count < 10;
END;
$$;

DROP POLICY IF EXISTS "Controlled reaction creation" ON public.reactions;
CREATE POLICY "Secure reaction creation" 
ON public.reactions 
FOR INSERT 
WITH CHECK (
  check_reaction_rate_limit(
    CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE NULL END,
    guest_id
  ) AND
  (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND guest_id IS NOT NULL AND length(guest_id) >= 10)
  )
);

-- 10. Add index for reaction rate limiting
CREATE INDEX IF NOT EXISTS idx_reactions_user_created ON public.reactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reactions_guest_created ON public.reactions(guest_id, created_at);