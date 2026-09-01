import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  Bot, 
  Plus, 
  X, 
  Play, 
  Clock, 
  Globe, 
  Youtube,
  CheckCircle,
  XCircle,
  Loader2,
  Zap,
  Hash,
  Newspaper,
  Star,
  Film,
  Facebook
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AISettings {
  id: string;
  is_enabled: boolean;
  source_sites: string[];
  youtube_channels: string[];
  schedule_times: string[];
  last_run_at: string | null;
  content_types: string[];
  facebook_crosspost_enabled: boolean;
  facebook_post_mode: 'card' | 'full';
  updated_at: string;
}

interface AIPostLog {
  id: string;
  source_url: string;
  source_site: string;
  article_id: string | null;
  content_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface ContentTypes {
  news: boolean;
  review: boolean;
  trailer: boolean;
  curiogame: boolean;
}

const AdminAI = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newSite, setNewSite] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [postsPerType, setPostsPerType] = useState(3);
  const [contentTypes, setContentTypes] = useState<ContentTypes>({
    news: true,
    review: true,
    trailer: true,
    curiogame: false,
  });

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return data as unknown as AISettings;
    },
  });

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ['ai-post-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_post_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as unknown as AIPostLog[];
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<AISettings>) => {
      if (!settings?.id) throw new Error('Settings not found');
      
      const { error } = await supabase
        .from('ai_settings')
        .update(updates as Record<string, unknown>)
        .eq('id', settings.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      toast({ title: 'Configurações atualizadas!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });

  // Hydrate the content-type selection from saved settings (used by the scheduler too)
  useEffect(() => {
    const saved = settings?.content_types;
    if (Array.isArray(saved)) {
      setContentTypes({
        news: saved.includes('news'),
        review: saved.includes('review'),
        trailer: saved.includes('trailer'),
        curiogame: saved.includes('curiogame'),
      });
    }
  }, [settings?.content_types]);

  const toggleAI = () => {
    updateSettings.mutate({ is_enabled: !settings?.is_enabled });
  };

  const addSite = () => {
    if (!newSite.trim() || !settings) return;
    const sites = [...(settings.source_sites || []), newSite.trim()];
    updateSettings.mutate({ source_sites: sites });
    setNewSite('');
  };

  const removeSite = (site: string) => {
    if (!settings) return;
    const sites = settings.source_sites.filter(s => s !== site);
    updateSettings.mutate({ source_sites: sites });
  };

  const addChannel = () => {
    if (!newChannel.trim() || !settings) return;
    const channels = [...(settings.youtube_channels || []), newChannel.trim()];
    updateSettings.mutate({ youtube_channels: channels });
    setNewChannel('');
  };

  const removeChannel = (channel: string) => {
    if (!settings) return;
    const channels = settings.youtube_channels.filter(c => c !== channel);
    updateSettings.mutate({ youtube_channels: channels });
  };

  const addTime = () => {
    if (!settings) return;
    const value = newTime.trim();
    if (!/^\d{2}:\d{2}$/.test(value)) {
      toast({ title: 'Horário inválido', description: 'Use o formato HH:MM', variant: 'destructive' });
      return;
    }
    const times = Array.from(new Set([...(settings.schedule_times || []), value])).sort();
    updateSettings.mutate({ schedule_times: times });
    setNewTime('');
  };

  const removeTime = (time: string) => {
    if (!settings) return;
    updateSettings.mutate({ schedule_times: (settings.schedule_times || []).filter(t => t !== time) });
  };

  const toggleType = (type: keyof ContentTypes, checked: boolean) => {
    const next = { ...contentTypes, [type]: checked };
    setContentTypes(next);
    const list = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
    if (settings?.id) updateSettings.mutate({ content_types: list });
  };

  const runNow = async () => {
    const selectedTypes = Object.entries(contentTypes)
      .filter(([, enabled]) => enabled)
      .map(([type]) => type);
    
    if (selectedTypes.length === 0) {
      toast({ 
        title: 'Selecione pelo menos um tipo de conteúdo', 
        variant: 'destructive' 
      });
      return;
    }

    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-auto-post', {
        body: { postsPerType, contentTypes: selectedTypes, manual: true, forceNew: true }
      });
      
      if (error) throw error;
      
      toast({ 
        title: 'IA executada!', 
        description: data.message || `${data.postsCreated} posts criados` 
      });
      
      queryClient.invalidateQueries({ queryKey: ['ai-post-logs'] });
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
    } catch (error) {
      toast({ 
        title: 'Erro ao executar IA', 
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive' 
      });
    } finally {
      setIsRunning(false);
    }
  };

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-display font-bold">IA Auto-Post</h1>
            <p className="text-sm text-muted-foreground">
              Geração automática de notícias, reviews e trailers
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {settings?.is_enabled ? 'Ativada' : 'Desativada'}
            </span>
            <Switch
              checked={settings?.is_enabled || false}
              onCheckedChange={toggleAI}
            />
          </div>
          
          <Button 
            onClick={runNow} 
            disabled={isRunning || !settings?.is_enabled}
            className="gap-2"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Executar Agora
          </Button>
        </div>
      </div>

      {/* Configurações de Execução */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tipos de Conteúdo */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Film className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Tipos de Conteúdo</h2>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Selecione quais tipos de conteúdo a IA deve gerar
          </p>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="news" 
                checked={contentTypes.news}
                onCheckedChange={(checked) => toggleType('news', checked === true)}
              />
              <Label htmlFor="news" className="flex items-center gap-2 cursor-pointer">
                <Newspaper className="h-4 w-4 text-primary" />
                Notícias
              </Label>
            </div>
            
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="review" 
                checked={contentTypes.review}
                onCheckedChange={(checked) => toggleType('review', checked === true)}
              />
              <Label htmlFor="review" className="flex items-center gap-2 cursor-pointer">
                <Star className="h-4 w-4 text-gaming-gold" />
                Reviews
              </Label>
            </div>
            
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="trailer" 
                checked={contentTypes.trailer}
                onCheckedChange={(checked) => toggleType('trailer', checked === true)}
              />
              <Label htmlFor="trailer" className="flex items-center gap-2 cursor-pointer">
                <Film className="h-4 w-4 text-accent" />
                Trailers
              </Label>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="curiogame"
                checked={contentTypes.curiogame}
                onCheckedChange={(checked) => toggleType('curiogame', checked === true)}
              />
              <Label htmlFor="curiogame" className="flex items-center gap-2 cursor-pointer">
                <span className="text-base">🎮</span>
                CurioGame (fofocas e curiosidades)
              </Label>
            </div>
          </div>
        </Card>

        {/* Quantidade de Posts por Tipo */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Quantidade por Tipo</h2>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Defina quantos posts a IA deve gerar de cada tipo por execução
          </p>

          <div className="space-y-5">
            {TYPE_META.map(({ key, label, icon }) => (
              <div key={key} className={`space-y-2 ${contentTypes[key] ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm">
                    <span>{icon}</span>
                    {label}
                  </Label>
                  <Badge variant="secondary" className="font-bold px-3">
                    {perTypeCounts[key]}
                  </Badge>
                </div>
                <Slider
                  value={[perTypeCounts[key]]}
                  onValueChange={(value) => setTypeCount(key, value[0])}
                  min={1}
                  max={10}
                  step={1}
                  disabled={!contentTypes[key]}
                  className="w-full"
                />
              </div>
            ))}

            <p className="text-sm text-muted-foreground pt-1 border-t">
              Total por execução: até <strong>{totalPerRun} posts</strong>
            </p>
          </div>
        </Card>

      </div>

      {/* Status Card */}
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Facebook className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Cross-post no Facebook</h2>
              <p className="text-sm text-muted-foreground">
                Publica automaticamente cada novo artigo na página do Império Gamers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {settings?.facebook_crosspost_enabled ? 'Ativado' : 'Desativado'}
            </span>
            <Switch
              checked={settings?.facebook_crosspost_enabled || false}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ facebook_crosspost_enabled: checked })
              }
            />
          </div>
        </div>

        {settings?.facebook_crosspost_enabled && (
          <div className="mt-5 pt-5 border-t space-y-3">
            <p className="text-sm font-medium">Formato da publicação no Facebook</p>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>• <strong>Notícias, Reviews e CurioGame</strong>: texto completo + todas as fotos do post (até 10).</li>
              <li>• <strong>Trailers</strong>: apenas o card com a imagem de capa — sem link na legenda (o card já leva ao site).</li>
            </ul>
          </div>
        )}
      </Card>

      {/* Horários das publicações */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Horários das publicações</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Horários (fuso de Angola) em que a IA gera e publica automaticamente.
        </p>
        <div className="flex gap-2 mb-4">
          <Input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTime()}
            className="max-w-[160px]"
          />
          <Button onClick={addTime} size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(settings?.schedule_times || []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum horário definido — a IA não publica automaticamente.</p>
          )}
          {(settings?.schedule_times || []).map((time) => (
            <Badge key={time} variant="secondary" className="gap-1 pl-3 pr-1 py-1.5">
              {time}
              <button
                type="button"
                onClick={() => removeTime(time)}
                className="ml-1 rounded p-0.5 hover:bg-destructive/20"
                aria-label={`Remover ${time}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </Card>

      <Card className={`p-4 ${settings?.is_enabled ? 'border-primary/50 bg-primary/5' : 'border-muted'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Zap className={`h-5 w-5 ${settings?.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
            <div>
              <p className="font-medium">
                {settings?.is_enabled ? 'IA está ativa' : 'IA está desativada'}
              </p>
              <p className="text-sm text-muted-foreground">
                {settings?.last_run_at 
                  ? `Última execução: ${format(new Date(settings.last_run_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
                  : 'Nunca executada'
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Horários: {settings?.schedule_times?.join(', ') || '08:00, 15:00, 20:00'}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Sites */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Sites de Notícias</h2>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="exemplo.com"
                value={newSite}
                onChange={(e) => setNewSite(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSite()}
              />
              <Button onClick={addSite} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {settings?.source_sites?.map((site) => (
                <Badge key={site} variant="secondary" className="gap-1 py-1.5">
                  {site}
                  <button onClick={() => removeSite(site)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        {/* YouTube Channels */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Youtube className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold">Canais do YouTube</h2>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nome do canal"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addChannel()}
              />
              <Button onClick={addChannel} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {settings?.youtube_channels?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Adicione canais de YouTube para indexar trailers
                </p>
              )}
              {settings?.youtube_channels?.map((channel) => (
                <Badge key={channel} variant="secondary" className="gap-1 py-1.5">
                  {channel}
                  <button onClick={() => removeChannel(channel)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Logs */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4">Histórico de Posts</h2>
        
        {loadingLogs ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : logs?.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            Nenhum post gerado ainda
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs?.map((log) => (
              <div 
                key={log.id} 
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  {log.status === 'success' ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium truncate max-w-md">
                      {log.source_url}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{log.source_site}</span>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">
                        {log.content_type}
                      </Badge>
                      <span>•</span>
                      <span>
                        {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {log.error_message && (
                      <p className="text-xs text-red-500 mt-1">{log.error_message}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminAI;
