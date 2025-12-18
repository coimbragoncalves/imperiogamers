import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Power, PowerOff, Upload, FileCode } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface Ad {
  id: string;
  name: string;
  script: string | null;
  position: string;
  is_active: boolean;
}

const positions = [
  { value: 'header', label: 'Cabeçalho' },
  { value: 'sidebar', label: 'Barra Lateral' },
  { value: 'article-top', label: 'Topo do Artigo' },
  { value: 'article-bottom', label: 'Final do Artigo' },
  { value: 'footer', label: 'Rodapé' },
];

const AdminAds = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [script, setScript] = useState('');
  const [position, setPosition] = useState('sidebar');
  const [swFile, setSwFile] = useState<File | null>(null);
  const [isUploadingSW, setIsUploadingSW] = useState(false);

  const { data: ads, isLoading } = useQuery({
    queryKey: ['admin-ads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Ad[];
    },
  });

  // Check if sw.js already exists
  const { data: existingSW } = useQuery({
    queryKey: ['sw-file'],
    queryFn: async () => {
      const { data } = await supabase.storage
        .from('uploads')
        .list('sw', { limit: 1, search: 'sw.js' });
      return data && data.length > 0 ? data[0] : null;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('ads').insert({
        name,
        script,
        position,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ads'] });
      setName('');
      setScript('');
      toast({ title: 'Anúncio criado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar anúncio', variant: 'destructive' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('ads')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ads'] });
      toast({ title: 'Status atualizado!' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ads'] });
      toast({ title: 'Anúncio excluído!' });
    },
  });

  const handleSWUpload = async () => {
    if (!swFile) {
      toast({ title: 'Selecione um arquivo', variant: 'destructive' });
      return;
    }

    if (!swFile.name.endsWith('.js')) {
      toast({ title: 'O arquivo deve ser um arquivo JavaScript (.js)', variant: 'destructive' });
      return;
    }

    setIsUploadingSW(true);

    try {
      // Delete existing sw.js if it exists
      if (existingSW) {
        await supabase.storage.from('uploads').remove(['sw/sw.js']);
      }

      // Upload new sw.js
      const { error } = await supabase.storage
        .from('uploads')
        .upload('sw/sw.js', swFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'application/javascript',
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['sw-file'] });
      setSwFile(null);
      toast({ title: 'Arquivo SW.js enviado com sucesso!' });
    } catch (error) {
      console.error('Error uploading SW:', error);
      toast({ title: 'Erro ao enviar arquivo', variant: 'destructive' });
    } finally {
      setIsUploadingSW(false);
    }
  };

  const handleDeleteSW = async () => {
    if (!confirm('Tem certeza que deseja excluir o arquivo SW.js?')) return;

    try {
      const { error } = await supabase.storage.from('uploads').remove(['sw/sw.js']);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['sw-file'] });
      toast({ title: 'Arquivo SW.js excluído!' });
    } catch (error) {
      toast({ title: 'Erro ao excluir arquivo', variant: 'destructive' });
    }
  };

  const swFileUrl = existingSW
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/sw/sw.js`
    : null;

  return (
    <div>
      <h1 className="text-3xl font-display font-bold mb-8">Anúncios</h1>

      <Tabs defaultValue="ads" className="mb-8">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ads">Scripts de Anúncios</TabsTrigger>
          <TabsTrigger value="sw">Service Worker (SW.js)</TabsTrigger>
        </TabsList>

        {/* Ads Tab */}
        <TabsContent value="ads">
          {/* Create Form */}
          <div className="bg-card rounded-xl border border-border p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Novo Anúncio</h2>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="name">Nome do Anúncio</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Banner Principal"
                />
              </div>
              <div>
                <Label htmlFor="position">Posição</Label>
                <Select value={position} onValueChange={setPosition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((pos) => (
                      <SelectItem key={pos.value} value={pos.value}>
                        {pos.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="script">Script/HTML do Anúncio</Label>
                <Textarea
                  id="script"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Cole aqui o script ou HTML do anúncio..."
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Cole o código HTML/JavaScript fornecido pela rede de anúncios.
                </p>
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name || createMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                Criar Anúncio
              </Button>
            </div>
          </div>

          {/* Ads List */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : ads && ads.length > 0 ? (
            <div className="space-y-4">
              {ads.map((ad) => (
                <div
                  key={ad.id}
                  className={`bg-card rounded-xl border border-border p-4 flex items-center justify-between ${
                    !ad.is_active ? 'opacity-50' : ''
                  }`}
                >
                  <div>
                    <h3 className="font-bold">{ad.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Posição: {positions.find((p) => p.value === ad.position)?.label}
                    </p>
                    {ad.script && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-md">
                        {ad.script.substring(0, 80)}...
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        toggleActiveMutation.mutate({
                          id: ad.id,
                          isActive: ad.is_active,
                        })
                      }
                    >
                      {ad.is_active ? (
                        <Power className="h-4 w-4 text-green-500" />
                      ) : (
                        <PowerOff className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('Tem certeza?')) {
                          deleteMutation.mutate(ad.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <p className="text-muted-foreground">Nenhum anúncio cadastrado.</p>
            </div>
          )}
        </TabsContent>

        {/* Service Worker Tab */}
        <TabsContent value="sw">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Service Worker (SW.js)
            </h2>
            <p className="text-muted-foreground mb-6">
              Faça upload do arquivo Service Worker (sw.js) para gerenciar notificações push e cache de anúncios.
            </p>

            {/* Current SW Status */}
            {existingSW && swFileUrl && (
              <div className="bg-muted/50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Arquivo SW.js atual</p>
                    <a
                      href={swFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {swFileUrl}
                    </a>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSW}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            )}

            {/* Upload Form */}
            <div className="grid gap-4">
              <div>
                <Label htmlFor="sw-file">Arquivo SW.js</Label>
                <Input
                  id="sw-file"
                  type="file"
                  accept=".js"
                  onChange={(e) => setSwFile(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Selecione um arquivo JavaScript (.js)
                </p>
              </div>
              <Button
                onClick={handleSWUpload}
                disabled={!swFile || isUploadingSW}
              >
                <Upload className="h-4 w-4" />
                {isUploadingSW ? 'Enviando...' : 'Enviar SW.js'}
              </Button>
            </div>

            {/* Instructions */}
            <div className="mt-6 p-4 bg-muted/30 rounded-lg">
              <h3 className="font-medium mb-2">Como usar:</h3>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Faça upload do arquivo sw.js fornecido pela rede de anúncios</li>
                <li>O arquivo será disponibilizado publicamente</li>
                <li>Configure a URL do Service Worker na sua rede de anúncios</li>
              </ol>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAds;
