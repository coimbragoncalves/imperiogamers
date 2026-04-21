import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { Button } from '@/components/ui/button';
import { Play, Newspaper, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import heroBanner from '@/assets/hero-banner.jpg';

interface SlideItem {
  key: string;
  image: string;
  title: string;
  subtitle?: string;
  link?: string;
  badge?: string;
}

const HeroSection = () => {
  const { data: settings } = useQuery({
    queryKey: ['featured-settings-public'],
    queryFn: async () => {
      const { data } = await supabase.from('featured_settings').select('slider_enabled').maybeSingle();
      return data;
    },
  });

  const sliderEnabled = settings?.slider_enabled ?? false;

  const { data: articles } = useQuery({
    queryKey: ['featured-articles'],
    enabled: sliderEnabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('articles')
        .select('id, slug, title, description, cover_image, content_type')
        .eq('is_published', true)
        .not('cover_image', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const { data: customSlides } = useQuery({
    queryKey: ['featured-slides-public'],
    enabled: sliderEnabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('featured_slides')
        .select('*')
        .eq('is_active', true)
        .order('position', { ascending: true });
      return data || [];
    },
  });

  const slides: SlideItem[] = sliderEnabled
    ? [
        ...(articles || []).map((a) => ({
          key: `a-${a.id}`,
          image: a.cover_image as string,
          title: a.title,
          subtitle: a.description || undefined,
          link: a.content_type === 'trailer' ? `/trailer/${a.slug}` : `/noticia/${a.slug}`,
          badge: a.content_type === 'review' ? 'REVIEW' : a.content_type === 'trailer' ? 'TRAILER' : 'NOTÍCIA',
        })),
        ...(customSlides || []).map((s) => ({
          key: `s-${s.id}`,
          image: s.image_url,
          title: s.title || '',
          subtitle: s.subtitle || undefined,
          link: s.link_url || undefined,
          badge: 'DESTAQUE',
        })),
      ]
    : [];

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'start' },
    [Autoplay({ delay: 5000, stopOnInteraction: false })]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  // Fallback static hero
  if (!sliderEnabled || slides.length === 0) {
    return (
      <section className="relative h-[70vh] min-h-[500px] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBanner} alt="Império Gamers" className="w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-2xl animate-fade-in">
            <span className="inline-block px-4 py-1 mb-4 text-sm font-display font-bold tracking-wider bg-accent text-accent-foreground rounded-full">
              PORTAL DE GAMES
            </span>
            <h1 className="text-4xl md:text-6xl font-display font-bold mb-4 leading-tight">
              Bem-vindo ao <span className="text-gradient-gaming">Império Gamers</span>
            </h1>
            <div className="mb-8" />
            <div className="flex flex-wrap gap-4">
              <Button variant="hero" size="xl" asChild>
                <Link to="/noticias">
                  <Newspaper className="h-5 w-5" />
                  Ver Notícias
                </Link>
              </Button>
              <Button variant="outline" size="xl" asChild>
                <Link to="/trailers">
                  <Play className="h-5 w-5" />
                  Trailers
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative h-[70vh] min-h-[500px] overflow-hidden bg-background">
      <div className="embla h-full" ref={emblaRef}>
        <div className="embla__container flex h-full">
          {slides.map((slide) => {
            const Inner = (
              <div className="relative w-full h-full">
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 container mx-auto px-4 pb-12 md:pb-20">
                  <div className="max-w-3xl animate-fade-in">
                    {slide.badge && (
                      <span className="inline-block px-3 py-1 mb-3 text-xs font-display font-bold tracking-wider bg-accent text-accent-foreground rounded-full">
                        {slide.badge}
                      </span>
                    )}
                    <h2 className="text-3xl md:text-5xl font-display font-bold mb-3 leading-tight text-foreground line-clamp-2">
                      {slide.title}
                    </h2>
                    {slide.subtitle && (
                      <p className="text-base md:text-lg text-muted-foreground line-clamp-2 max-w-2xl">
                        {slide.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
            return (
              <div key={slide.key} className="embla__slide flex-[0_0_100%] min-w-0 relative">
                {slide.link ? (
                  <Link to={slide.link} className="block w-full h-full">
                    {Inner}
                  </Link>
                ) : (
                  Inner
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => emblaApi?.scrollPrev()}
            aria-label="Anterior"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-background/60 hover:bg-background/80 backdrop-blur flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => emblaApi?.scrollNext()}
            aria-label="Próximo"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-background/60 hover:bg-background/80 backdrop-blur flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => emblaApi?.scrollTo(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-2 rounded-full transition-all ${
                  i === selectedIndex ? 'w-8 bg-primary' : 'w-2 bg-foreground/40 hover:bg-foreground/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default HeroSection;
