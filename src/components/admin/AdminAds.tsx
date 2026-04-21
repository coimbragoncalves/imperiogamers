import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Power, PowerOff, Upload, FileCode, Copy, Check, Eye, EyeOff, Code, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Ad {
  id: string;
  name: string;
  script: string | null;
  position: string;
  is_active: boolean;
}

const positions = [
  { value: 'header', label: 'Cabeçalho (topo do site)' },
  { value: 'sidebar', label: 'Barra Lateral' },
  { value: 'article-top', label: 'Topo do Artigo' },
  { value: 'article-middle', label: 'Meio do Artigo' },
  { value: 'article-bottom', label: 'Final do Artigo' },
  { value: 'between-posts', label: 'Entre Posts (listagem)' },
  { value: 'popup', label: 'Pop-up / Modal' },
  { value: 'footer', label: 'Rodapé' },
];

const adTypes = [
  {
    name: 'Google AdSense',
    description: 'Rede de anúncios do Google. Exibe banners, display e anúncios responsivos.',
    example: `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXX" crossorigin="anonymous"></script>
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-XXXXXXX"
     data-ad-slot="XXXXXXX"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`,
  },
  {
    name: 'Google Ad Manager (DFP)',
    description: 'Plataforma avançada do Google para gerenciar inventário de anúncios.',
    example: `<script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>
<div id="div-gpt-ad-XXXXXXX">
  <script>
    googletag.cmd.push(function() {
      googletag.defineSlot('/XXXXXXX/ad-slot', [300, 250], 'div-gpt-ad-XXXXXXX').addService(googletag.pubads());
      googletag.pubads().enableSingleRequest();
      googletag.enableServices();
      googletag.display('div-gpt-ad-XXXXXXX');
    });
  </script>
</div>`,
  },
  {
    name: 'Amazon Associates',
    description: 'Programa de afiliados da Amazon. Banners e links de produtos.',
    example: `<script type="text/javascript">
amzn_assoc_ad_type = "banner";
amzn_assoc_marketplace = "amazon";
amzn_assoc_region = "US";
amzn_assoc_placement = "";
amzn_assoc_campaigns = "yourtrackingid";
amzn_assoc_banner_type = "category";
amzn_assoc_is498498 = "true";
</script>
<script src="//z-na.amazon-adsystem.com/widgets/onejs?MarketPlace=US"></script>`,
  },
  {
    name: 'Banner HTML Personalizado',
    description: 'Banner com imagem e link direto. Ideal para anunciantes diretos.',
    example: `<a href="https://exemplo.com" target="_blank" rel="noopener noreferrer sponsored">
  <img src="https://exemplo.com/banner.jpg" alt="Anúncio" style="max-width:100%;height:auto;border-radius:8px;" />
</a>`,
  },
  {
    name: 'Pop-under / Pop-up Script',
    description: 'Scripts de redes como PropellerAds, Adsterra, etc.',
    example: `<script>(function(s,u,z,p){s.src=u;s.setAttribute('data-zone',z);p.appendChild(s);})(document.createElement('script'),'https://exemplo.com/sdk.js','ZONE_ID',document.body);</script>`,
  },
  {
    name: 'Push Notification (SW.js)',
    description: 'Anúncios via notificação push. Requer upload do arquivo SW.js na aba "Service Worker".',
    example: `<script src="https://exemplo.com/push-sdk.js" data-sw="/sw.js"></script>`,
  },
  {
    name: 'Monetag / HilltopAds / Adsterra',
    description: 'Redes alternativas populares. Cole o script fornecido pela rede.',
    example: `<script type="text/javascript" src="https://exemplo.com/invoke.js" data-cfasync="false" async></script>`,
  },
  {
    name: 'Iframe Embed',
    description: 'Anúncio carregado dentro de um iframe. Útil para isolar conteúdo externo.',
    example: `<iframe src="https://exemplo.com/ad" width="300" height="250" frameborder="0" scrolling="no" style="border:none;overflow:hidden;"></iframe>`,
  },
];

const AdminAds = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [script, setScript] = useState('');
  const [position, setPosition] = useState('sidebar');
  const [swFile, setSwFile] = useState<File | null>(null);
  const [swCode, setSwCode] = useState('');
  const [isUploadingSW, setIsUploadingSW] = useState(false);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [copiedExample, setCopiedExample] = useState<string | null>(null);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [editScript, setEditScript] = useState('');

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
      queryClient.invalidateQueries({ queryKey: ['ads'] });
      setName('');
      setScript('');
      toast({ title: 'Anúncio criado com sucesso!' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar anúncio', variant: 'destructive' });
    },
  });

  const updateScriptMutation = useMutation({
    mutationFn: async ({ id, newScript }: { id: string; newScript: string }) => {
      const { error } = await supabase
        .from('ads')
        .update({ script: newScript })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ads'] });
      queryClient.invalidateQueries({ queryKey: ['ads'] });
      setEditingAd(null);
      setEditScript('');
      toast({ title: 'Script atualizado!' });
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
      queryClient.invalidateQueries({ queryKey: ['ads'] });
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
      queryClient.invalidateQueries({ queryKey: ['ads'] });
      toast({ title: 'Anúncio excluído!' });
    },
  });

  const handleSWUpload = async () => {
    setIsUploadingSW(true);
    try {
      let fileToUpload: File | Blob;

      if (swCode.trim()) {
        // Create file from pasted code
        fileToUpload = new Blob([swCode], { type: 'application/javascript' });
      } else if (swFile) {
        if (!swFile.name.endsWith('.js')) {
          toast({ title: 'O arquivo deve ser .js', variant: 'destructive' });
          setIsUploadingSW(false);
          return;
        }
        fileToUpload = swFile;
      } else {
        toast({ title: 'Cole o código ou selecione um arquivo', variant: 'destructive' });
        setIsUploadingSW(false);
        return;
      }

      if (existingSW) {
        await supabase.storage.from('uploads').remove(['sw/sw.js']);
      }

      const { error } = await supabase.storage
        .from('uploads')
        .upload('sw/sw.js', fileToUpload, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'application/javascript',
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['sw-file'] });
      setSwFile(null);
      setSwCode('');
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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedExample(id);
    setTimeout(() => setCopiedExample(null), 2000);
    toast({ title: 'Copiado para a área de transferência!' });
  };

  const useExample = (example: string) => {
    setScript(example);
    toast({ title: 'Exemplo inserido no campo de script!' });
  };

  const swFileUrl = existingSW
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/sw/sw.js`
    : null;

  return (
    <div>
      <h1 className="text-3xl font-display font-bold mb-8">Gerenciador de Anúncios</h1>

      {/* Google AdSense status */}
      <div className="bg-card rounded-xl border border-border p-4 mb-6 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
          <Power className="h-5 w-5 text-green-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold">Google AdSense</h3>
            <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/20 border-0">
              Ativo em todas as páginas
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cliente: <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">ca-pub-4163072000737375</code>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            O script principal do AdSense está carregado globalmente no <code className="font-mono">&lt;head&gt;</code> do site, garantindo que os anúncios sejam exibidos em todas as páginas.
          </p>
        </div>
      </div>

      <Tabs defaultValue="ads" className="mb-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ads">Scripts de Anúncios</TabsTrigger>
          <TabsTrigger value="sw">Service Worker (SW.js)</TabsTrigger>
          <TabsTrigger value="types">Tipos de Anúncios</TabsTrigger>
        </TabsList>

        {/* ===== ADS TAB ===== */}
        <TabsContent value="ads">
          <div className="bg-card rounded-xl border border-border p-6 mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Novo Anúncio
            </h2>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="name">Nome do Anúncio</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Banner Google AdSense - Topo"
                />
              </div>
              <div>
                <Label htmlFor="position">Posição no Site</Label>
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
                <Label htmlFor="script">Script / HTML do Anúncio</Label>
                <Textarea
                  id="script"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder={`Cole aqui o script ou HTML do anúncio...\n\nExemplo:\n<script async src="https://pagead2.googlesyndication.com/..."></script>\n<ins class="adsbygoogle" ...></ins>`}
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Cole o código HTML/JavaScript completo fornecido pela rede de anúncios. Scripts serão executados automaticamente no site.
                </p>
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name || !script.trim() || createMutation.isPending}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                {createMutation.isPending ? 'Criando...' : 'Criar Anúncio'}
              </Button>
            </div>
          </div>

          {/* Ads List */}
          <h2 className="text-xl font-bold mb-4">Anúncios Cadastrados ({ads?.length || 0})</h2>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : ads && ads.length > 0 ? (
            <div className="space-y-4">
              {ads.map((ad) => (
                <div
                  key={ad.id}
                  className={`bg-card rounded-xl border border-border p-4 transition-opacity ${
                    !ad.is_active ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold">{ad.name}</h3>
                        <Badge variant={ad.is_active ? 'default' : 'secondary'}>
                          {ad.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Posição: {positions.find((p) => p.value === ad.position)?.label || ad.position}
                      </p>

                      {/* Script preview */}
                      {ad.script && (
                        <div className="mt-2">
                          {showPreview === ad.id ? (
                            <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-40 font-mono">
                              {ad.script}
                            </pre>
                          ) : (
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-lg">
                              {ad.script.substring(0, 100)}...
                            </p>
                          )}
                        </div>
                      )}

                      {/* Edit script inline */}
                      {editingAd?.id === ad.id && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            value={editScript}
                            onChange={(e) => setEditScript(e.target.value)}
                            rows={8}
                            className="font-mono text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateScriptMutation.mutate({ id: ad.id, newScript: editScript })}
                              disabled={updateScriptMutation.isPending}
                            >
                              Salvar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingAd(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Ver/ocultar script"
                        onClick={() => setShowPreview(showPreview === ad.id ? null : ad.id)}
                      >
                        {showPreview === ad.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar script"
                        onClick={() => {
                          setEditingAd(ad);
                          setEditScript(ad.script || '');
                        }}
                      >
                        <Code className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={ad.is_active ? 'Desativar' : 'Ativar'}
                        onClick={() =>
                          toggleActiveMutation.mutate({ id: ad.id, isActive: ad.is_active })
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
                        title="Excluir"
                        onClick={() => {
                          if (confirm('Tem certeza que deseja excluir este anúncio?')) {
                            deleteMutation.mutate(ad.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <Code className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum anúncio cadastrado.</p>
              <p className="text-sm text-muted-foreground mt-1">Crie seu primeiro anúncio acima.</p>
            </div>
          )}
        </TabsContent>

        {/* ===== SERVICE WORKER TAB ===== */}
        <TabsContent value="sw">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Service Worker (SW.js)
            </h2>
            <p className="text-muted-foreground mb-6">
              Configure o Service Worker para notificações push e anúncios. Você pode colar o código ou fazer upload do arquivo.
            </p>

            {/* Current SW Status */}
            {existingSW && swFileUrl && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-medium text-green-400 flex items-center gap-2">
                      <Check className="h-4 w-4" /> SW.js Ativo
                    </p>
                    <a
                      href={swFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all"
                    >
                      {swFileUrl}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(swFileUrl, 'sw-url')}
                    >
                      {copiedExample === 'sw-url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      Copiar URL
                    </Button>
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
              </div>
            )}

            <Tabs defaultValue="paste">
              <TabsList className="mb-4">
                <TabsTrigger value="paste">Colar Código</TabsTrigger>
                <TabsTrigger value="upload">Upload de Arquivo</TabsTrigger>
              </TabsList>

              <TabsContent value="paste">
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="sw-code">Código do SW.js</Label>
                    <Textarea
                      id="sw-code"
                      value={swCode}
                      onChange={(e) => setSwCode(e.target.value)}
                      placeholder={`Cole aqui o conteúdo do arquivo sw.js...\n\nExemplo:\nself.addEventListener('push', function(event) {\n  // ...\n});`}
                      rows={12}
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleSWUpload}
                    disabled={!swCode.trim() || isUploadingSW}
                  >
                    <Upload className="h-4 w-4" />
                    {isUploadingSW ? 'Enviando...' : 'Salvar SW.js'}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="upload">
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
                  </div>
                  <Button
                    onClick={handleSWUpload}
                    disabled={!swFile || isUploadingSW}
                  >
                    <Upload className="h-4 w-4" />
                    {isUploadingSW ? 'Enviando...' : 'Enviar SW.js'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-6 p-4 bg-muted/30 rounded-lg">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Como usar o Service Worker:
              </h3>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Cole o código ou faça upload do arquivo <code className="bg-muted px-1 rounded">sw.js</code> fornecido pela rede de anúncios</li>
                <li>O arquivo será disponibilizado publicamente na URL acima</li>
                <li>Use essa URL na configuração da rede de anúncios</li>
                <li>O Service Worker será registrado automaticamente no site</li>
              </ol>
            </div>
          </div>
        </TabsContent>

        {/* ===== AD TYPES TAB ===== */}
        <TabsContent value="types">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Info className="h-5 w-5" />
              Tipos de Anúncios Suportados
            </h2>
            <p className="text-muted-foreground mb-6">
              Veja os tipos de anúncios que podem ser integrados no site. Clique em "Usar Exemplo" para preencher o formulário automaticamente.
            </p>

            <Accordion type="single" collapsible className="space-y-2">
              {adTypes.map((adType, index) => (
                <AccordionItem key={index} value={`type-${index}`} className="border border-border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <Badge variant="outline" className="shrink-0">{index + 1}</Badge>
                      <div>
                        <p className="font-semibold">{adType.name}</p>
                        <p className="text-sm text-muted-foreground font-normal">{adType.description}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      <Label>Exemplo de código:</Label>
                      <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-48 font-mono whitespace-pre-wrap">
                        {adType.example}
                      </pre>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(adType.example, `type-${index}`)}
                        >
                          {copiedExample === `type-${index}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          Copiar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => useExample(adType.example)}
                        >
                          <Plus className="h-3 w-3" />
                          Usar Exemplo
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAds;
