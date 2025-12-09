import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/layout/Layout';
import ArticleCard from '@/components/articles/ArticleCard';
import { Skeleton } from '@/components/ui/skeleton';

interface Article {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  content_type: 'news' | 'review' | 'trailer' | 'other';
  views: number;
  likes: number;
  created_at: string;
  slug: string;
}

const News = () => {
  const { data: articles, isLoading } = useQuery({
    queryKey: ['news-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('is_published', true)
        .eq('content_type', 'news')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Article[];
    },
  });

  return (
    <>
      <Helmet>
        <title>Notícias - Império Gamers</title>
        <meta name="description" content="As últimas notícias do mundo dos games. Fique por dentro de tudo!" />
      </Helmet>
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-display font-bold">
              <span className="text-primary">Notícias</span> do Mundo Gamer
            </h1>
            <p className="text-muted-foreground mt-2">
              Acompanhe as últimas novidades dos seus jogos favoritos
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="aspect-video rounded-xl" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : articles && articles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article, index) => (
                <div
                  key={article.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <ArticleCard
                    id={article.id}
                    title={article.title}
                    description={article.description}
                    coverImage={article.cover_image}
                    contentType={article.content_type}
                    views={article.views}
                    likes={article.likes}
                    createdAt={article.created_at}
                    slug={article.slug}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-card rounded-xl border border-border">
              <p className="text-xl text-muted-foreground">Nenhuma notícia publicada ainda.</p>
              <p className="text-muted-foreground mt-2">Volte em breve para conferir as novidades!</p>
            </div>
          )}
        </div>
      </Layout>
    </>
  );
};

export default News;
