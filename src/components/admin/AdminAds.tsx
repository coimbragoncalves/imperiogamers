import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Power, PowerOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  return (
    <div>
      <h1 className="text-3xl font-display font-bold mb-8">Anúncios</h1>

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
            <Label htmlFor="script">Script do Anúncio</Label>
            <Textarea
              id="script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Cole aqui o script do anúncio..."
              rows={5}
            />
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
    </div>
  );
};

export default AdminAds;
