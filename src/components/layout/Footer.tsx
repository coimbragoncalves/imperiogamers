import { Link } from 'react-router-dom';
import { Facebook, Instagram, Youtube } from 'lucide-react';
import logo from '@/assets/logo.png';

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
  </svg>
);

const Footer = () => {
  const socialLinks = [
    { icon: TikTokIcon, href: 'https://www.tiktok.com/@imperio.gamers', label: 'TikTok' },
    { icon: Facebook, href: 'https://www.facebook.com/CoimbraGoncalves1', label: 'Facebook' },
    { icon: Instagram, href: 'https://www.instagram.com/imperio_gamer16/', label: 'Instagram' },
    { icon: Youtube, href: 'https://www.youtube.com/@ImpérioGamers-q4n', label: 'YouTube' },
  ];

  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          {/* Logo */}
          <div className="flex justify-center md:justify-start">
            <Link to="/">
              <img src={logo} alt="Império Gamers" className="h-20 w-auto" />
            </Link>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap justify-center gap-6">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Início
            </Link>
            <Link to="/noticias" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Notícias
            </Link>
            <Link to="/reviews" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Reviews
            </Link>
            <Link to="/trailers" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Trailers
            </Link>
          </nav>

          {/* Social Links */}
          <div className="flex justify-center md:justify-end gap-4">
            {socialLinks.map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                aria-label={label}
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Império Gamers. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
