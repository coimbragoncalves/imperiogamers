import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Download, Gamepad2, Wrench, Package, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/layout/Layout';
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

const Downloads = () => {
  const { data: downloads, isLoading } = useQuery({
    queryKey: ['public-downloads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('downloads')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as DownloadItem[];
    },
  });

  const handleDownload = async (item: DownloadItem) => {
    // Increment view count
    await supabase.rpc('increment_download_views', { download_id: item.id });
    // Increment download count
    await supabase.rpc('increment_download_count', { download_id: item.id });
    // Open download link
    window.open(item.download_url, '_blank');
  };

  return (
    <>
      <Helmet>
        <title>Diversos - Downloads | Império Gamers</title>
        <meta name="description" content="Baixe jogos, ferramentas e outros arquivos do mundo gamer." />
      </Helmet>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">Diversos</h1>
            <p className="text-muted-foreground">Baixe jogos, ferramentas e outros arquivos</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {downloads.map((item) => (
                <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  {item.cover_image && (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={item.cover_image}
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
                    <Button size="sm" onClick={() => handleDownload(item)}>
                      <Download className="h-4 w-4" />
                      Baixar
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
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
