import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Eye, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import CommentSection from '@/components/articles/CommentSection';
import ReactionButtons from '@/components/articles/ReactionButtons';
import ShareButtons from '@/components/articles/ShareButtons';

interface TrailerData {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  youtube_url: string | null;
  video_url: string | null;
  views: number;
  likes: number;
  dislikes: number;
  created_at: string;
  slug: string;
}

const getYouTubeEmbedUrl = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 
    ? `https://www.youtube.com/embed/${match[2]}` 
    : null;
};

const Trailer = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: trailer, isLoading } = useQuery({
    queryKey: ['trailer', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('slug', slug)
        .eq('content_type', 'trailer')
        .eq('is_published', true)
        .single();

      if (error) throw error;
      return data as TrailerData;
    },
    enabled: !!slug,
  });

  // Increment views on every page load
  useEffect(() => {
    const incrementViews = async () => {
      if (trailer?.id) {
        await supabase.rpc('increment_views', { article_id: trailer.id });
      }
    };
    incrementViews();
  }, [trailer?.id]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="aspect-video rounded-xl mb-8" />
        </div>
      </Layout>
    );
  }

  if (!trailer) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold mb-4">Trailer não encontrado</h1>
          <Button asChild>
            <Link to="/trailers">Voltar aos trailers</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const embedUrl = trailer.youtube_url ? getYouTubeEmbedUrl(trailer.youtube_url) : null;

  const siteUrl = window.location.origin;
  const trailerUrl = `${siteUrl}/trailer/${trailer.slug}`;
  const ogImage = trailer.cover_image || `${siteUrl}/placeholder.svg`;

  return (
    <>
      <Helmet>
        <title>{trailer.title} - Império Gamers</title>
        <meta name="description" content={trailer.description || trailer.title} />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content={trailerUrl} />
        <meta property="og:title" content={trailer.title} />
        <meta property="og:description" content={trailer.description || trailer.title} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:site_name" content="Império Gamers" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={trailerUrl} />
        <meta name="twitter:title" content={trailer.title} />
        <meta name="twitter:description" content={trailer.description || trailer.title} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>
      <Layout>
        <article className="container mx-auto px-4 py-12 max-w-4xl">
          {/* Back button */}
          <Button variant="ghost" size="sm" asChild className="mb-6">
            <Link to="/trailers">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
            {trailer.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDistanceToNow(new Date(trailer.created_at), { addSuffix: true, locale: ptBR })}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {trailer.views} visualizações
              </span>
            </div>
            <ShareButtons 
              title={trailer.title} 
              description={trailer.description || undefined}
              slug={trailer.slug}
              contentType="trailer"
            />
          </div>

          {/* Video */}
          <div className="aspect-video rounded-xl overflow-hidden mb-8 bg-card">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title={trailer.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : trailer.video_url ? (
              <video
                src={trailer.video_url}
                controls
                className="w-full h-full object-contain"
              />
            ) : trailer.cover_image ? (
              <img
                src={trailer.cover_image}
                alt={trailer.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                Vídeo não disponível
              </div>
            )}
          </div>

          {/* Description */}
          {trailer.description && (
            <p className="text-lg text-muted-foreground mb-8">
              {trailer.description}
            </p>
          )}

          {/* Reactions */}
          <ReactionButtons articleId={trailer.id} likes={trailer.likes} dislikes={trailer.dislikes} />

          {/* Comments */}
          <CommentSection articleId={trailer.id} />
        </article>
      </Layout>
    </>
  );
};

export default Trailer;
