import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Star, Trash2, Image as ImageIcon, AlertTriangle, Loader2, Plus, GripVertical } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface FeaturedSettings {
  id: string;
  slider_enabled: boolean;
  auto_cleanup_enabled: boolean;
  auto_cleanup_threshold: number;
}

interface FeaturedSlide {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  link_url: string | null;
  position: number;
  is_active: boolean;
}

const AdminFeatured = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newSlide, setNewSlide] = useState({ image_url: '', title: '', subtitle: '', link_url: '' });
  const [uploading, setUploading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [threshold, setThreshold] = useState(200);

  const { data: settings } = useQuery({
    queryKey: ['featured-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('featured_settings').select('*').single();
      if (error) throw error;
      return data as FeaturedSettings;
    },
  });

  useEffect(() => {
    if (settings?.auto_cleanup_threshold) setThreshold(settings.auto_cleanup_threshold);
  }, [settings]);

  const { data: slides } = useQuery({
    queryKey: ['featured-slides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('featured_slides')
        .select('*')
        .order('position', { ascending: true });
      if (error) throw error;
      return data as FeaturedSlide[];
    },
  });

  const { data: articleCount } = useQuery({
    queryKey: ['articles-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<FeaturedSettings>) => {
      if (!settings?.id) throw new Error('Settings not found');
      const { error } = await supabase
        .from('featured_settings')
        .update(updates)
        .eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featured-settings'] });
      toast({ title: 'Configurações atualizadas' });
    },
  });

  const addSlide = useMutation({
    mutationFn: async () => {
      if (!newSlide.image_url) throw new Error('URL da imagem obrigatória');
      const nextPos = slides && slides.length > 0 ? Math.max(...slides.map(s => s.position)) + 1 : 0;
      const { error } = await supabase.from('featured_slides').insert({
        image_url: newSlide.image_url,
        title: newSlide.title || null,
        subtitle: newSlide.subtitle || null,
        link_url: newSlide.link_url || null,
        position: nextPos,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featured-slides'] });
      setNewSlide({ image_url: '', title: '', subtitle: '', link_url: '' });
      toast({ title: 'Slide adicionado!' });
    },
    onError: (e) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const removeSlide = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('featured_slides').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['featured-slides'] });
      toast({ title: 'Slide removido' });
    },
  });

  const toggleSlide = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('featured_slides').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['featured-slides'] }),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `featured/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('uploads').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('uploads').getPublicUrl(path);
      setNewSlide(prev => ({ ...prev, image_url: data.publicUrl }));
      toast({ title: 'Imagem enviada!' });
    } catch (err) {
      toast({ title: 'Erro no upload', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const cleanupOldest = async () => {
    setCleaning(true);
    try {
      const { data, error } = await supabase.rpc('cleanup_oldest_articles', { p_count: 40 });
      if (error) throw error;
      toast({ title: `${data} artigos antigos eliminados` });
      queryClient.invalidateQueries({ queryKey: ['articles-count'] });
    } catch (err) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Star className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-display font-bold">Destaques & Limpeza</h1>
          <p className="text-sm text-muted-foreground">Slider da home e gestão de posts antigos</p>
        </div>
      </div>

      {/* Slider toggle */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Slider de Destaques</h2>
            <p className="text-sm text-muted-foreground">
              Mostra as 5 notícias mais recentes + slides personalizados no topo do site
            </p>
          </div>
          <Switch
            checked={settings?.slider_enabled || false}
            onCheckedChange={(checked) => updateSettings.mutate({ slider_enabled: checked })}
          />
        </div>
      </Card>

      {/* Add new slide */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          Adicionar Slide Personalizado
        </h2>
        <div className="space-y-3">
          <div>
            <Label>Upload de imagem</Label>
            <Input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
          </div>
          <div>
            <Label>Ou cola URL da imagem</Label>
            <Input
              placeholder="https://..."
              value={newSlide.image_url}
              onChange={(e) => setNewSlide(prev => ({ ...prev, image_url: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              placeholder="Título (opcional)"
              value={newSlide.title}
              onChange={(e) => setNewSlide(prev => ({ ...prev, title: e.target.value }))}
            />
            <Input
              placeholder="Subtítulo (opcional)"
              value={newSlide.subtitle}
              onChange={(e) => setNewSlide(prev => ({ ...prev, subtitle: e.target.value }))}
            />
          </div>
          <Input
            placeholder="Link ao clicar (opcional, ex: /noticia/slug)"
            value={newSlide.link_url}
            onChange={(e) => setNewSlide(prev => ({ ...prev, link_url: e.target.value }))}
          />
          <Button onClick={() => addSlide.mutate()} disabled={!newSlide.image_url || addSlide.isPending} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Slide
          </Button>
        </div>
      </Card>

      {/* Existing slides */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4">Slides Personalizados ({slides?.length || 0})</h2>
        {!slides || slides.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum slide personalizado. Adicione pelo menos 5 fotos.</p>
        ) : (
          <div className="space-y-3">
            {slides.map((slide) => (
              <div key={slide.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <img src={slide.image_url} alt="" className="w-20 h-12 object-cover rounded" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{slide.title || 'Sem título'}</p>
                  <p className="text-xs text-muted-foreground truncate">{slide.subtitle || slide.link_url || 'Sem link'}</p>
                </div>
                <Switch
                  checked={slide.is_active}
                  onCheckedChange={(checked) => toggleSlide.mutate({ id: slide.id, active: checked })}
                />
                <Button variant="ghost" size="icon" onClick={() => removeSlide.mutate(slide.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Cleanup */}
      <Card className="p-5 border-destructive/30">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Limpeza de Posts Antigos
        </h2>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Total de artigos atualmente: <strong>{articleCount ?? '...'}</strong>
          </p>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div>
              <Label className="font-medium">Limpeza automática</Label>
              <p className="text-xs text-muted-foreground">
                Remove os 40 mais antigos quando ultrapassar o limite (na próxima execução da IA)
              </p>
            </div>
            <Switch
              checked={settings?.auto_cleanup_enabled || false}
              onCheckedChange={(checked) => updateSettings.mutate({ auto_cleanup_enabled: checked })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap">Limite de artigos:</Label>
            <Input
              type="number"
              min={50}
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 200)}
              className="w-32"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateSettings.mutate({ auto_cleanup_threshold: threshold })}
            >
              Salvar limite
            </Button>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={cleaning} className="gap-2">
                {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar 40 posts mais antigos agora
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar os 40 artigos mais antigos?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é irreversível. Os 40 artigos mais antigos serão permanentemente removidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={cleanupOldest} className="bg-destructive hover:bg-destructive/90">
                  Sim, eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    </div>
  );
};

export default AdminFeatured;
