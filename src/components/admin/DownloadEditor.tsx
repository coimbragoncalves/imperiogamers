import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Upload, Link as LinkIcon, X, GripVertical, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface DownloadData {
  id?: string;
  title: string;
  description: string;
  category: string;
  download_url: string;
  cover_image: string;
  images: string[];
  file_size: string;
  is_published: boolean;
}

const DownloadEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  const [formData, setFormData] = useState<DownloadData>({
    title: '',
    description: '',
    category: 'game',
    download_url: '',
    cover_image: '',
    images: [],
    file_size: '',
    is_published: false,
  });
  const [uploading, setUploading] = useState(false);

  const { data: existingItem, isLoading } = useQuery({
    queryKey: ['download', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('downloads')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingItem) {
      // Parse images from cover_image field (stored as JSON array or single URL)
      let images: string[] = [];
      if (existingItem.cover_image) {
        try {
          const parsed = JSON.parse(existingItem.cover_image);
          images = Array.isArray(parsed) ? parsed : [existingItem.cover_image];
        } catch {
          images = [existingItem.cover_image];
        }
      }
      
      setFormData({
        title: existingItem.title || '',
        description: existingItem.description || '',
        category: existingItem.category || 'game',
        download_url: existingItem.download_url || '',
        cover_image: images[0] || '',
        images: images,
        file_size: existingItem.file_size || '',
        is_published: existingItem.is_published || false,
      });
    }
  }, [existingItem]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `download-images/${Date.now()}-${i}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('uploads')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
        uploadedUrls.push(data.publicUrl);
      }

      setFormData(prev => {
        const newImages = [...prev.images, ...uploadedUrls];
        return {
          ...prev,
          images: newImages,
          cover_image: newImages[0] || '',
        };
      });
      
      toast({ title: `${uploadedUrls.length} imagem(ns) carregada(s)!` });
    } catch (error: any) {
      toast({ title: 'Erro ao carregar imagem', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    setFormData(prev => {
      const newImages = prev.images.filter((_, i) => i !== index);
      return {
        ...prev,
        images: newImages,
        cover_image: newImages[0] || '',
      };
    });
  };

  const setCoverImage = (index: number) => {
    setFormData(prev => {
      const newImages = [...prev.images];
      const [selectedImage] = newImages.splice(index, 1);
      newImages.unshift(selectedImage);
      return {
        ...prev,
        images: newImages,
        cover_image: newImages[0],
      };
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.title.trim() || !formData.download_url.trim()) {
        throw new Error('Título e link de download são obrigatórios');
      }

      // Store images as JSON array in cover_image field
      const imagesToSave = formData.images.length > 0 
        ? JSON.stringify(formData.images)
        : null;

      const dataToSave = {
        title: formData.title,
        description: formData.description || null,
        category: formData.category,
        download_url: formData.download_url,
        cover_image: imagesToSave,
        file_size: formData.file_size || null,
        is_published: formData.is_published,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('downloads')
          .update(dataToSave)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('downloads')
          .insert(dataToSave);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-downloads'] });
      toast({ title: isEditing ? 'Item atualizado!' : 'Item criado!' });
      navigate('/admin/diversos');
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/diversos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-display font-bold">
          {isEditing ? 'Editar Item' : 'Novo Item'}
        </h1>
      </div>

      <div className="bg-card rounded-lg p-6 space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Nome do jogo, ferramenta ou arquivo"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Breve descrição do item"
            rows={3}
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="game">Jogo</SelectItem>
              <SelectItem value="tool">Ferramenta</SelectItem>
              <SelectItem value="other">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Download URL */}
        <div className="space-y-2">
          <Label htmlFor="download_url">Link de Download *</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="download_url"
                value={formData.download_url}
                onChange={(e) => setFormData(prev => ({ ...prev, download_url: e.target.value }))}
                placeholder="https://exemplo.com/arquivo.zip"
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {/* File Size */}
        <div className="space-y-2">
          <Label htmlFor="file_size">Tamanho do Arquivo</Label>
          <Input
            id="file_size"
            value={formData.file_size}
            onChange={(e) => setFormData(prev => ({ ...prev, file_size: e.target.value }))}
            placeholder="Ex: 1.5 GB, 350 MB"
          />
        </div>

        {/* Images Gallery */}
        <div className="space-y-2">
          <Label>Imagens (a primeira é a capa)</Label>
          <p className="text-sm text-muted-foreground mb-2">
            Adicione até 10+ imagens. A primeira imagem será usada como capa.
          </p>
          
          {/* Image Grid */}
          {formData.images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
              {formData.images.map((img, index) => (
                <div
                  key={index}
                  className={`relative group rounded-lg overflow-hidden border-2 ${
                    index === 0 ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  <img
                    src={img}
                    alt={`Imagem ${index + 1}`}
                    className="w-full aspect-square object-cover"
                  />
                  
                  {/* Cover Badge */}
                  {index === 0 && (
                    <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      Capa
                    </div>
                  )}
                  
                  {/* Actions Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {index !== 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCoverImage(index)}
                        title="Definir como capa"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeImage(index)}
                      title="Remover"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upload Button */}
          <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors">
            <Upload className="h-5 w-5" />
            <span>{uploading ? 'Carregando...' : 'Adicionar imagens'}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>

        {/* Publish Toggle */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div>
            <Label>Publicar</Label>
            <p className="text-sm text-muted-foreground">
              Tornar visível para todos os visitantes
            </p>
          </div>
          <Switch
            checked={formData.is_published}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_published: checked }))}
          />
        </div>

        {/* Save Button */}
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );
};

export default DownloadEditor;
