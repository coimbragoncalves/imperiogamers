import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Download, Gamepad2, Wrench, Package, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/layout/Layout';
import Pagination from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

interface DownloadItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  cover_image: string | null;
  download_url: string;
  file_size: string | null;
  views: number;
  downloads_count: number;
}

const categoryIcons: Record<string, React.ReactNode> = {
  game: <Gamepad2 className="h-4 w-4" />,
  tool: <Wrench className="h-4 w-4" />,
  other: <Package className="h-4 w-4" />,
};

const categoryLabels: Record<string, string> = {
  game: 'Jogo',
  tool: 'Ferramenta',
  other: 'Outro',
};

const ITEMS_PER_PAGE = 12;

const Downloads = () => {
  const [currentPage, setCurrentPage] = useState(1);

  const { data: totalCount } = useQuery({
    queryKey: ['downloads-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('downloads')
        .select('*', { count: 'exact', head: true })
        .eq('is_published', true);

      if (error) throw error;
      return count || 0;
    },
  });

  const totalPages = Math.ceil((totalCount || 0) / ITEMS_PER_PAGE);

  const { data: downloads, isLoading } = useQuery({
    queryKey: ['public-downloads', currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error } = await supabase
        .from('downloads')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as DownloadItem[];
    },
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <Helmet>
        <title>Diversos {currentPage > 1 ? `- Página ${currentPage}` : ''} - Downloads | Império Gamers</title>
        <meta name="description" content="Baixe jogos, ferramentas e outros arquivos do mundo gamer." />
      </Helmet>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">Diversos</h1>
            <p className="text-muted-foreground">
              Baixe jogos, ferramentas e outros arquivos
              {totalCount && totalCount > 0 && (
                <span className="ml-2">({totalCount} arquivos)</span>
              )}
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <div className="aspect-video bg-muted" />
                  <CardHeader>
                    <div className="h-4 bg-muted rounded w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-3 bg-muted rounded w-full mb-2" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : downloads && downloads.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {downloads.map((item) => {
                  // Parse cover_image which may be JSON array
                  let coverImage = '';
                  if (item.cover_image) {
                    try {
                      const parsed = JSON.parse(item.cover_image);
                      coverImage = Array.isArray(parsed) ? parsed[0] : item.cover_image;
                    } catch {
                      coverImage = item.cover_image;
                    }
                  }
                  
                  return (
                    <Link key={item.id} to={`/diversos/${item.id}`}>
                      <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
                        {coverImage && (
                          <div className="aspect-video overflow-hidden">
                            <img
                              src={coverImage}
                              alt={item.title}
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            {categoryIcons[item.category]}
                            <span>{categoryLabels[item.category]}</span>
                            {item.file_size && (
                              <>
                                <span>•</span>
                                <span>{item.file_size}</span>
                              </>
                            )}
                          </div>
                          <h3 className="font-semibold text-lg line-clamp-2">{item.title}</h3>
                        </CardHeader>
                        <CardContent className="pb-2">
                          {item.description && (
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {item.description}
                            </p>
                          )}
                        </CardContent>
                        <CardFooter className="flex items-center justify-between pt-0">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {item.views}
                            </span>
                            <span className="flex items-center gap-1">
                              <Download className="h-3 w-3" />
                              {item.downloads_count}
                            </span>
                          </div>
                          <Button size="sm">
                            Ver Detalhes
                          </Button>
                        </CardFooter>
                      </Card>
                    </Link>
                  );
                })}
              </div>
              
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Nenhum download disponível no momento.</p>
            </div>
          )}
        </div>
      </Layout>
    </>
  );
};

export default Downloads;
