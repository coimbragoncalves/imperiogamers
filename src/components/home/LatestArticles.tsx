import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ArticleCard from '@/components/articles/ArticleCard';
import { Button } from '@/components/ui/button';
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

const LatestArticles = () => {
  const { data: articles, isLoading } = useQuery({
    queryKey: ['latest-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) throw error;
      return data as Article[];
    },
  });

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-bold">
              Últimas <span className="text-primary">Publicações</span>
            </h2>
            <p className="text-muted-foreground mt-1">
              Fique por dentro das novidades do mundo gamer
            </p>
          </div>
          <Button variant="ghost" asChild className="hidden md:flex">
            <Link to="/noticias">
              Ver todas
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Articles Grid */}
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
                style={{ animationDelay: `${index * 100}ms` }}
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
          <div className="text-center py-12 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">Nenhuma publicação ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">
              As novidades aparecerão aqui em breve!
            </p>
          </div>
        )}

        {/* Mobile Link */}
        <div className="mt-8 text-center md:hidden">
          <Button variant="outline" asChild>
            <Link to="/noticias">
              Ver todas as publicações
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default LatestArticles;
