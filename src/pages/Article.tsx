import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Eye, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import CommentSection from '@/components/articles/CommentSection';
import ReactionButtons from '@/components/articles/ReactionButtons';
import ShareButtons from '@/components/articles/ShareButtons';
import AdDisplay from '@/components/ads/AdDisplay';
interface ArticleData {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  cover_image: string | null;
  content_type: 'news' | 'review' | 'trailer' | 'other';
  views: number;
  likes: number;
  dislikes: number;
  created_at: string;
  slug: string;
  author_id: string | null;
}

const Article = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: article, isLoading } = useQuery({
    queryKey: ['article', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (error) throw error;
      return data as ArticleData;
    },
    enabled: !!slug,
  });

  // Increment views on every page load
  useEffect(() => {
    const incrementViews = async () => {
      if (article?.id) {
        await supabase.rpc('increment_views', { article_id: article.id });
      }
    };
    incrementViews();
  }, [article?.id]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="aspect-video rounded-xl mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!article) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold mb-4">Artigo não encontrado</h1>
          <Button asChild>
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const siteUrl = window.location.origin;
  const currentPath = window.location.pathname.startsWith('/noticia/') ? 'noticia' : 'artigo';
  const articleUrl = `${siteUrl}/${currentPath}/${article.slug}`;
  const ogImage = article.cover_image?.startsWith('http')
    ? article.cover_image
    : article.cover_image
      ? `${siteUrl}${article.cover_image}`
      : `${siteUrl}/placeholder.svg`;

  return (
    <>
      <Helmet>
        <title>{article.title} - Império Gamers</title>
        <meta name="description" content={article.description || article.title} />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="article" />
        <meta property="og:url" content={articleUrl} />
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={article.description || article.title} />
          <meta property="og:image" content={ogImage} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Império Gamers" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={articleUrl} />
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={article.description || article.title} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>
      <Layout>
        <article className="container mx-auto px-4 py-12 max-w-4xl">
          {/* Ad - Top */}
          <AdDisplay position="article-top" className="mb-6" />

          {/* Back button */}
          <Button variant="ghost" size="sm" asChild className="mb-6">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
            {article.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDistanceToNow(new Date(article.created_at), { addSuffix: true, locale: ptBR })}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {article.views} visualizações
              </span>
            </div>
            <ShareButtons 
              title={article.title} 
              description={article.description || undefined}
              slug={article.slug}
              contentType={article.content_type}
            />
          </div>

          {/* Cover Image */}
          {article.cover_image && (
            <div className="aspect-video rounded-xl overflow-hidden mb-8">
              <img
                src={article.cover_image}
                alt={article.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Content */}
          {article.content && (
            <div 
              className="prose prose-invert prose-lg max-w-none mb-8"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content, {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'pre', 'code', 'span', 'div', 'iframe'],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen'],
                ALLOW_DATA_ATTR: false,
                FORBID_TAGS: ['script', 'style', 'ins', 'object', 'embed', 'form', 'input', 'button'],
                FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
                ADD_URI_SAFE_ATTR: ['src', 'href']
              }) }}
              ref={(el) => {
                if (!el) return;
                // Allow only trusted iframe hosts (videos/social embeds). Drop everything else (ad networks).
                const allowedIframeHosts = [
                  'youtube.com', 'youtube-nocookie.com', 'youtu.be',
                  'vimeo.com', 'player.vimeo.com',
                  'twitch.tv', 'player.twitch.tv',
                  'twitter.com', 'x.com', 'platform.twitter.com',
                  'instagram.com', 'tiktok.com',
                  'facebook.com', 'soundcloud.com', 'spotify.com'
                ];
                el.querySelectorAll('iframe').forEach((iframe) => {
                  try {
                    const src = iframe.getAttribute('src') || '';
                    const host = new URL(src, window.location.origin).hostname.replace(/^www\./, '');
                    const ok = allowedIframeHosts.some((h) => host === h || host.endsWith('.' + h));
                    if (!ok) iframe.remove();
                  } catch {
                    iframe.remove();
                  }
                });
                // Remove obvious third-party ad containers/scripts left over from scraped content.
                const adSelectors = [
                  '[id*="google_ads"]', '[id*="ad-"]', '[id*="-ad"]', '[id^="ad_"]', '[id$="_ad"]',
                  '[class*="advert"]', '[class*="ad-slot"]', '[class*="ad-container"]',
                  '[class*="adsbygoogle"]', '[class*="adsense"]', '[class*="banner-ad"]',
                  '[class*="sponsored"]', '[class*="promoted"]', '[data-ad]', '[data-ad-slot]',
                  'ins.adsbygoogle', 'aside.ad', 'div.ad'
                ];
                el.querySelectorAll(adSelectors.join(',')).forEach((n) => n.remove());
              }}
            />
          )}

          {/* Reactions */}
          <ReactionButtons articleId={article.id} likes={article.likes} dislikes={article.dislikes} />

          {/* Ad - Bottom */}
          <AdDisplay position="article-bottom" className="my-8" />

          {/* Comments */}
          <CommentSection articleId={article.id} />
        </article>
      </Layout>
    </>
  );
};

export default Article;
