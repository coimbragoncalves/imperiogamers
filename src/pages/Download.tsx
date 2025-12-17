import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Download, Gamepad2, Wrench, Package, Eye, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

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
  created_at: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  game: <Gamepad2 className="h-5 w-5" />,
  tool: <Wrench className="h-5 w-5" />,
  other: <Package className="h-5 w-5" />,
};

const categoryLabels: Record<string, string> = {
  game: 'Jogo',
  tool: 'Ferramenta',
  other: 'Outro',
};

const DownloadPage = () => {
  const { id } = useParams<{ id: string }>();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { data: item, isLoading } = useQuery({
    queryKey: ['download', id],
    queryFn: async () => {
      // Increment view count
      if (id) {
        await supabase.rpc('increment_download_views', { download_id: id });
      }

      const { data, error } = await supabase
        .from('downloads')
        .select('*')
        .eq('id', id)
        .eq('is_published', true)
        .maybeSingle();

      if (error) throw error;
      return data as DownloadItem | null;
    },
    enabled: !!id,
  });

  const handleDownload = async () => {
    if (!item) return;
    await supabase.rpc('increment_download_count', { download_id: item.id });
    window.open(item.download_url, '_blank');
  };

  // Parse images from cover_image field
  const images: string[] = [];
  if (item?.cover_image) {
    try {
      const parsed = JSON.parse(item.cover_image);
      if (Array.isArray(parsed)) {
        images.push(...parsed);
      } else {
        images.push(item.cover_image);
      }
    } catch {
      images.push(item.cover_image);
    }
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="aspect-video w-full max-w-3xl mb-6" />
          <Skeleton className="h-10 w-full max-w-2xl mb-4" />
          <Skeleton className="h-24 w-full max-w-2xl" />
        </div>
      </Layout>
    );
  }

  if (!item) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h1 className="text-2xl font-bold mb-2">Item não encontrado</h1>
          <p className="text-muted-foreground mb-6">O item que você procura não existe ou foi removido.</p>
          <Button asChild>
            <Link to="/diversos">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Diversos
            </Link>
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <>
      <Helmet>
        <title>{item.title} - Diversos | Império Gamers</title>
        <meta name="description" content={item.description || `Baixe ${item.title} no Império Gamers`} />
        <meta property="og:title" content={item.title} />
        <meta property="og:description" content={item.description || `Baixe ${item.title} no Império Gamers`} />
        {images[0] && <meta property="og:image" content={images[0]} />}
      </Helmet>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          {/* Back button */}
          <Link 
            to="/diversos" 
            className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Diversos
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Image Gallery */}
            {images.length > 0 && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                  <img
                    src={images[currentImageIndex]}
                    alt={`${item.title} - Imagem ${currentImageIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background p-2 rounded-full transition-colors"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background p-2 rounded-full transition-colors"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 px-3 py-1 rounded-full text-sm">
                        {currentImageIndex + 1} / {images.length}
                      </div>
                    </>
                  )}
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {images.map((img, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`flex-shrink-0 w-20 h-14 rounded overflow-hidden border-2 transition-colors ${
                          index === currentImageIndex ? 'border-primary' : 'border-transparent'
                        }`}
                      >
                        <img src={img} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Details */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {categoryIcons[item.category]}
                    {categoryLabels[item.category]}
                  </Badge>
                  {item.file_size && (
                    <Badge variant="outline">{item.file_size}</Badge>
                  )}
                </div>
                <h1 className="text-3xl md:text-4xl font-display font-bold">{item.title}</h1>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {item.views} visualizações
                </span>
                <span className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  {item.downloads_count} downloads
                </span>
              </div>

              {item.description && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-muted-foreground whitespace-pre-wrap">{item.description}</p>
                </div>
              )}

              <Button size="lg" onClick={handleDownload} className="w-full sm:w-auto">
                <Download className="h-5 w-5 mr-2" />
                Baixar Agora
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
};

export default DownloadPage;
