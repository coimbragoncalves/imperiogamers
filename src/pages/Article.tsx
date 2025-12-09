import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Eye, ThumbsUp, ThumbsDown, Calendar, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import CommentSection from '@/components/articles/CommentSection';
import ReactionButtons from '@/components/articles/ReactionButtons';

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

  // Increment views
  useEffect(() => {
    if (article?.id) {
      supabase.rpc('increment_views', { article_id: article.id });
    }
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

  return (
    <>
      <Helmet>
        <title>{article.title} - Império Gamers</title>
        <meta name="description" content={article.description || article.title} />
      </Helmet>
      <Layout>
        <article className="container mx-auto px-4 py-12 max-w-4xl">
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
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDistanceToNow(new Date(article.created_at), { addSuffix: true, locale: ptBR })}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {article.views} visualizações
            </span>
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
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
          )}

          {/* Reactions */}
          <ReactionButtons articleId={article.id} likes={article.likes} dislikes={article.dislikes} />

          {/* Comments */}
          <CommentSection articleId={article.id} />
        </article>
      </Layout>
    </>
  );
};

export default Article;
