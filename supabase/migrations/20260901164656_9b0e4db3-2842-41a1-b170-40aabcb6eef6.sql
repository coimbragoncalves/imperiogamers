-- Restore Data API privileges lost on public tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles, public.article_images, public.ads, public.comments, public.downloads, public.featured_settings, public.featured_slides, public.reactions, public.site_settings, public.profiles, public.user_roles, public.ai_settings, public.ai_post_logs, public.facebook_connections TO authenticated;

GRANT ALL ON public.articles, public.article_images, public.ads, public.comments, public.downloads, public.featured_settings, public.featured_slides, public.reactions, public.site_settings, public.profiles, public.user_roles, public.ai_settings, public.ai_post_logs, public.facebook_connections TO service_role;

-- Public (anonymous) read access for the public-facing site
GRANT SELECT ON public.articles, public.article_images, public.ads, public.comments, public.downloads, public.featured_settings, public.featured_slides, public.reactions, public.site_settings TO anon;

-- Anonymous visitors may leave comments and reactions (RLS still applies)
GRANT INSERT ON public.comments, public.reactions TO anon;