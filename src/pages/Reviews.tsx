import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/layout/Layout';
import ArticleCard from '@/components/articles/ArticleCard';
import Pagination from '@/components/Pagination';
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

const ITEMS_PER_PAGE = 12;

const Reviews = () => {
  const [currentPage, setCurrentPage] = useState(1);

  const { data: totalCount } = useQuery({
    queryKey: ['reviews-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .eq('is_published', true)
        .eq('content_type', 'review');

      if (error) throw error;
      return count || 0;
    },
  });

  const totalPages = Math.ceil((totalCount || 0) / ITEMS_PER_PAGE);

  const { data: articles, isLoading } = useQuery({
    queryKey: ['review-articles', currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('is_published', true)
        .eq('content_type', 'review')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as Article[];
    },
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <Helmet>
        <title>Reviews {currentPage > 1 ? `- Página ${currentPage}` : ''} - Império Gamers</title>
        <meta name="description" content="Reviews completos dos melhores jogos. Análises detalhadas para você!" />
      </Helmet>
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-display font-bold">
              <span className="text-gaming-gold">Reviews</span> de Games
            </h1>
            <p className="text-muted-foreground mt-2">
              Análises completas e detalhadas dos melhores jogos
              {totalCount && totalCount > 0 && (
                <span className="ml-2">({totalCount} reviews)</span>
              )}
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
            <>
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
              
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </>
          ) : (
            <div className="text-center py-16 bg-card rounded-xl border border-border">
              <p className="text-xl text-muted-foreground">Nenhum review publicado ainda.</p>
              <p className="text-muted-foreground mt-2">Volte em breve para conferir as análises!</p>
            </div>
          )}
        </div>
      </Layout>
    </>
  );
};

export default Reviews;
