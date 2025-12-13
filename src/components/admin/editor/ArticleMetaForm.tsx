import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ArticleMetaFormProps {
  title: string;
  setTitle: (value: string) => void;
  subtitle: string;
  setSubtitle: (value: string) => void;
  slug: string;
  setSlug: (value: string) => void;
  contentType: 'news' | 'review' | 'other';
  setContentType: (value: 'news' | 'review' | 'other') => void;
  coverImage: string;
  onCoverImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  metaTitle: string;
  setMetaTitle: (value: string) => void;
  metaDescription: string;
  setMetaDescription: (value: string) => void;
  isPublished: boolean;
  setIsPublished: (value: boolean) => void;
}

export const ArticleMetaForm = ({
  title,
  setTitle,
  subtitle,
  setSubtitle,
  slug,
  setSlug,
  contentType,
  setContentType,
  coverImage,
  onCoverImageUpload,
  uploading,
  metaTitle,
  setMetaTitle,
  metaDescription,
  setMetaDescription,
  isPublished,
  setIsPublished,
}: ArticleMetaFormProps) => {
  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  return (
    <div className="space-y-6 bg-card border border-border rounded-xl p-6">
      <h2 className="text-lg font-semibold mb-4">Informações do Artigo</h2>
      
      {/* Title */}
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slug || slug === generateSlug(title)) {
              setSlug(generateSlug(e.target.value));
            }
          }}
          placeholder="Título do artigo"
          className="text-lg font-medium"
        />
      </div>

      {/* Subtitle */}
      <div>
        <Label htmlFor="subtitle">Subtítulo</Label>
        <Input
          id="subtitle"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Subtítulo opcional"
        />
      </div>

      {/* Slug */}
      <div>
        <Label htmlFor="slug">Slug (URL)</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="url-do-artigo"
        />
        <p className="text-xs text-muted-foreground mt-1">
          /artigo/{slug || 'url-do-artigo'}
        </p>
      </div>

      {/* Content Type */}
      <div>
        <Label>Categoria</Label>
        <Select value={contentType} onValueChange={(v) => setContentType(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="news">Notícia</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="other">Outro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cover Image */}
      <div>
        <Label>Imagem de Capa</Label>
        <div className="mt-2">
          {coverImage && (
            <img 
              src={coverImage} 
              alt="Capa" 
              className="w-full h-48 object-cover rounded-lg mb-3" 
            />
          )}
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={onCoverImageUpload}
              className="hidden"
            />
            <Button variant="outline" disabled={uploading} asChild>
              <span>
                <ImageIcon className="h-4 w-4" />
                {uploading ? 'Enviando...' : coverImage ? 'Trocar Imagem' : 'Escolher Imagem'}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* SEO Section */}
      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-semibold mb-4 text-muted-foreground">SEO</h3>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="metaTitle">Meta Título</Label>
            <Input
              id="metaTitle"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder={title || 'Título para SEO'}
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {metaTitle.length}/60 caracteres
            </p>
          </div>

          <div>
            <Label htmlFor="metaDescription">Meta Descrição</Label>
            <Textarea
              id="metaDescription"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Descrição para mecanismos de busca"
              maxLength={160}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {metaDescription.length}/160 caracteres
            </p>
          </div>
        </div>
      </div>

      {/* Publish Toggle */}
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <Switch
          id="published"
          checked={isPublished}
          onCheckedChange={setIsPublished}
        />
        <Label htmlFor="published" className="font-medium">
          {isPublished ? 'Publicado' : 'Rascunho'}
        </Label>
      </div>
    </div>
  );
};
