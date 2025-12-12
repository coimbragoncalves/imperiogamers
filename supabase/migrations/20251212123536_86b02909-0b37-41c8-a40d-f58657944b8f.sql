-- Criar função SECURITY DEFINER para incrementar views com segurança
CREATE OR REPLACE FUNCTION public.increment_views(article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.articles SET views = views + 1 WHERE id = article_id;
END;
$$;

-- Criar função para atualizar reações (likes/dislikes)
CREATE OR REPLACE FUNCTION public.update_reaction_counts(
  p_article_id uuid,
  p_like_delta int,
  p_dislike_delta int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.articles 
  SET likes = GREATEST(0, likes + p_like_delta),
      dislikes = GREATEST(0, dislikes + p_dislike_delta)
  WHERE id = p_article_id;
END;
$$;