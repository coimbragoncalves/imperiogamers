import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CalendarClock, Loader2, Trash2, Upload, Send } from 'lucide-react';

interface WeeklyPlanImage {
  id: string;
  image_url: string;
  storage_path: string | null;
  caption: string | null;
  position: number;
  created_at: string;
}

const MAX_IMAGES = 30;
const SLOTS = ['09:30', '15:10', '19:20'];

const AdminWeeklyPlan = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['weekly-plan-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_plan_images')
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as WeeklyPlanImage[];
    },
  });

  const remaining = MAX_IMAGES - images.length;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).slice(0, Math.max(remaining, 0));
    if (selected.length === 0) {
      toast({ title: 'Limite atingido', description: `O plano semanal aceita até ${MAX_IMAGES} imagens.`, variant: 'destructive' });
      return;
    }

    setUploading(true);
    let basePos = images.length > 0 ? Math.max(...images.map((i) => i.position)) + 1 : 0;
    let ok = 0;

    for (const file of selected) {
      try {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `weekly-plan/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('uploads').upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('uploads').getPublicUrl(path);
        const { error: insErr } = await supabase.from('weekly_plan_images').insert({
          image_url: pub.publicUrl,
          storage_path: path,
          position: basePos++,
        });
        if (insErr) throw insErr;
        ok++;
      } catch (err) {
        toast({
          title: 'Falha no upload',
          description: err instanceof Error ? err.message : 'Erro',
          variant: 'destructive',
        });
      }
    }

    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
    queryClient.invalidateQueries({ queryKey: ['weekly-plan-images'] });
    if (ok > 0) toast({ title: `${ok} imagem(ns) adicionada(s) ao plano semanal` });
  };

  const saveCaption = useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const { error } = await supabase
        .from('weekly_plan_images')
        .update({ caption: caption || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-plan-images'] }),
  });

  const removeImage = useMutation({
    mutationFn: async (img: WeeklyPlanImage) => {
      const { error } = await supabase.from('weekly_plan_images').delete().eq('id', img.id);
      if (error) throw error;
      if (img.storage_path) await supabase.storage.from('uploads').remove([img.storage_path]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-plan-images'] });
      toast({ title: 'Imagem removida' });
    },
    onError: (e) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const publishNow = async () => {
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('weekly-plan-post', { body: { manual: true } });
      const message = (data as { message?: string; error?: string } | null)?.message
        || (data as { error?: string } | null)?.error
        || error?.message;
      if (error && !message) throw error;
      toast({
        title: (data as { ok?: boolean } | null)?.ok ? 'Publicado no Facebook' : 'Não publicado',
        description: message,
        variant: (data as { ok?: boolean } | null)?.ok ? 'default' : 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['weekly-plan-images'] });
    } catch (err) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold mb-1">Plano Semanal</h1>
        <p className="text-sm text-muted-foreground">
          Imagens publicadas <strong>apenas na Página do Facebook</strong> (não vão para o site), 3 vezes por dia às{' '}
          {SLOTS.join(', ')} (hora de Angola). Cada imagem publicada sai automaticamente do plano.
        </p>
      </div>

      <Card className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span>
              {images.length}/{MAX_IMAGES} imagens na fila
            </span>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => fileInput.current?.click()} disabled={uploading || remaining <= 0}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar imagens
            </Button>
            <Button variant="outline" onClick={publishNow} disabled={publishing || images.length === 0}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publicar agora
            </Button>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : images.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhuma imagem no plano semanal. Envie até {MAX_IMAGES} imagens para começar.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((img, index) => (
            <Card key={img.id} className="overflow-hidden">
              <div className="relative aspect-video bg-muted">
                <img
                  src={img.image_url}
                  alt={img.caption || `Plano semanal ${index + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-2 left-2 rounded bg-background/90 px-2 py-0.5 text-xs font-medium">
                  #{index + 1}
                </span>
              </div>
              <div className="p-3 space-y-2">
                <Input
                  defaultValue={img.caption || ''}
                  placeholder="Legenda (opcional)"
                  onBlur={(e) => {
                    if ((img.caption || '') !== e.target.value) {
                      saveCaption.mutate({ id: img.id, caption: e.target.value });
                    }
                  }}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => removeImage.mutate(img)}
                >
                  <Trash2 className="h-4 w-4" />
                  Remover
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminWeeklyPlan;
