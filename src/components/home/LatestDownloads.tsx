import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, Gamepad2, Wrench, Package, Eye, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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

const LatestDownloads = () => {
  const { data: downloads, isLoading } = useQuery({
    queryKey: ['latest-downloads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('downloads')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(4);

      if (error) throw error;
      return data as DownloadItem[];
    },
  });

  const handleDownload = async (item: DownloadItem) => {
    await supabase.rpc('increment_download_views', { download_id: item.id });
    await supabase.rpc('increment_download_count', { download_id: item.id });
    window.open(item.download_url, '_blank');
  };

  if (isLoading) {
    return (
      <section className="py-12 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl md:text-3xl font-display font-bold">Diversos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-muted" />
                <CardHeader>
                  <div className="h-4 bg-muted rounded w-3/4" />
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!downloads || downloads.length === 0) {
    return null;
  }

  return (
    <section className="py-12 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold">Diversos</h2>
          <Button variant="ghost" asChild>
            <Link to="/diversos" className="flex items-center gap-2">
              Ver todos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  {categoryIcons[item.category]}
                  <span>{categoryLabels[item.category]}</span>
                </div>
                <h3 className="font-semibold line-clamp-2">{item.title}</h3>
              </CardHeader>
              <CardFooter className="flex items-center justify-between pt-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    {item.downloads_count}
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleDownload(item)}>
                  <Download className="h-4 w-4" />
                  Baixar
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LatestDownloads;
