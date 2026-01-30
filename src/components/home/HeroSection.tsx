import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Newspaper } from 'lucide-react';
import heroBanner from '@/assets/hero-banner.jpg';

const HeroSection = () => {
  return (
    <section className="relative h-[70vh] min-h-[500px] flex items-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroBanner}
          alt="Império Gamers"
          className="w-full h-full object-cover"
        />
        {/* Gradient only at bottom for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-2xl animate-fade-in">
          <span className="inline-block px-4 py-1 mb-4 text-sm font-display font-bold tracking-wider bg-accent text-accent-foreground rounded-full">
            PORTAL DE GAMES
          </span>
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-4 leading-tight">
            Bem-vindo ao{' '}
            <span className="text-gradient-gaming">Império Gamers</span>
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
};

export default HeroSection;
