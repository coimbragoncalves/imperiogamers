import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Save, Image as ImageIcon, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';

const TrailerEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const isEditing = !!id;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: article, isLoading } = useQuery({
    queryKey: ['trailer-edit', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: isEditing,
  });

  useEffect(() => {
    if (article) {
      setTitle(article.title);
      setDescription(article.description || '');
      setYoutubeUrl(article.youtube_url || '');
      setCoverImage(article.cover_image || '');
      setIsPublished(article.is_published);
    }
  }, [article]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(`covers/${fileName}`, file);

    if (uploadError) {
      toast({ title: 'Erro ao fazer upload', variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(`covers/${fileName}`);
    setCoverImage(urlData.publicUrl);
    setUploading(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const slug = generateSlug(title);
      const articleData = {
        title,
        slug,
        description,
        youtube_url: youtubeUrl,
        cover_image: coverImage,
        content_type: 'trailer' as const,
        is_published: isPublished,
        author_id: user?.id,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('articles')
          .update(articleData)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('articles').insert(articleData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Trailer atualizado!' : 'Trailer criado!' });
      navigate('/admin/artigos');
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao salvar', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  if (isLoading) {
    return <div className="text-center py-12">Carregando...</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/artigos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-display font-bold">
          {isEditing ? 'Editar Trailer' : 'Novo Trailer'}
        </h1>
      </div>

      <div className="max-w-3xl space-y-6">
        <div>
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do trailer"
          />
        </div>

        <div>
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descrição do trailer"
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="youtube">URL do YouTube</Label>
          <div className="relative">
            <Video className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="youtube"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <Label>Imagem de Capa (Thumbnail)</Label>
          <div className="mt-2 flex items-center gap-4">
            {coverImage && (
              <img src={coverImage} alt="Capa" className="w-32 h-20 object-cover rounded-lg" />
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button variant="outline" disabled={uploading} asChild>
                <span>
                  <ImageIcon className="h-4 w-4" />
                  {uploading ? 'Enviando...' : 'Escolher Imagem'}
                </span>
              </Button>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="published"
            checked={isPublished}
            onCheckedChange={setIsPublished}
          />
          <Label htmlFor="published">Publicado</Label>
        </div>

        <div className="flex gap-4">
          <Button
            variant="accent"
            onClick={() => saveMutation.mutate()}
            disabled={!title || saveMutation.isPending}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/admin/artigos')}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TrailerEditor;
