import { Link } from 'react-router-dom';
import { Eye, ThumbsUp, Calendar, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface ArticleCardProps {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  contentType: 'news' | 'review' | 'trailer' | 'other';
  views: number;
  likes: number;
  createdAt: string;
  slug: string;
}

const typeLabels = {
  news: 'Notícia',
  review: 'Review',
  trailer: 'Trailer',
  other: 'Outro',
};

const typeColors = {
  news: 'bg-primary',
  review: 'bg-gaming-gold text-background',
  trailer: 'bg-accent',
  other: 'bg-secondary',
};

const ArticleCard = ({
  title,
  description,
  coverImage,
  contentType,
  views,
  likes,
  createdAt,
  slug,
}: ArticleCardProps) => {
  const linkPath = contentType === 'trailer' ? `/trailer/${slug}` : `/artigo/${slug}`;

  return (
    <Link to={linkPath} className="group block">
      <article className="bg-card rounded-xl overflow-hidden card-hover border border-border/50">
        {/* Image */}
        <div className="relative aspect-video overflow-hidden">
          {coverImage ? (
            <img
              src={coverImage}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-secondary flex items-center justify-center">
              <span className="text-muted-foreground">Sem imagem</span>
            </div>
          )}
          
          {/* Type Badge */}
          <Badge className={`absolute top-3 left-3 ${typeColors[contentType]}`}>
            {contentType === 'trailer' && <Play className="h-3 w-3 mr-1" />}
            {typeLabels[contentType]}
          </Badge>

          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-display font-bold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
              {description}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: ptBR })}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {views}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {likes}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
};

export default ArticleCard;
