import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Upload, Link as LinkIcon } from 'lucide-react';
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
      setFormData({
        title: existingItem.title || '',
        description: existingItem.description || '',
        category: existingItem.category || 'game',
        download_url: existingItem.download_url || '',
        cover_image: existingItem.cover_image || '',
        file_size: existingItem.file_size || '',
        is_published: existingItem.is_published || false,
      });
    }
  }, [existingItem]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `download-covers/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, cover_image: data.publicUrl }));
      toast({ title: 'Imagem carregada!' });
    } catch (error: any) {
      toast({ title: 'Erro ao carregar imagem', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.title.trim() || !formData.download_url.trim()) {
        throw new Error('Título e link de download são obrigatórios');
      }

      const dataToSave = {
        title: formData.title,
        description: formData.description || null,
        category: formData.category,
        download_url: formData.download_url,
        cover_image: formData.cover_image || null,
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

        {/* Cover Image */}
        <div className="space-y-2">
          <Label>Imagem de Capa</Label>
          <div className="flex flex-col sm:flex-row gap-4">
            {formData.cover_image && (
              <img
                src={formData.cover_image}
                alt="Cover"
                className="w-32 h-32 object-cover rounded-lg"
              />
            )}
            <div className="flex-1">
              <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors">
                <Upload className="h-5 w-5" />
                <span>{uploading ? 'Carregando...' : 'Selecionar imagem'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
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
