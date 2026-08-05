import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Facebook, Loader2, CheckCircle2, AlertTriangle, Link2Off, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { callFacebookOAuth, type FacebookConnection } from '@/lib/facebook';

const REDIRECT_PATH = '/admin/facebook';
const STATE_KEY = 'fb_oauth_state';

interface PageOption {
  id: string;
  name: string;
}

const AdminFacebook = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<FacebookConnection | null>(null);
  const [pages, setPages] = useState<PageOption[] | null>(null);

  const redirectUri = `${window.location.origin}${REDIRECT_PATH}`;

  const loadStatus = useCallback(async () => {
    try {
      const res = await callFacebookOAuth<{ connection: FacebookConnection | null }>({ action: 'status' });
      setConnection(res.connection);
    } catch (err) {
      toast({
        title: 'Erro ao carregar conexão',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Handle OAuth return
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const fbError = searchParams.get('error_description') || searchParams.get('error');

    if (fbError) {
      toast({ title: 'Login do Facebook cancelado', description: fbError, variant: 'destructive' });
      navigate(REDIRECT_PATH, { replace: true });
      return;
    }

    if (!code) {
      loadStatus();
      return;
    }

    const expected = sessionStorage.getItem(STATE_KEY);
    if (!expected || expected !== state) {
      toast({ title: 'Estado OAuth inválido', description: 'Tente conectar novamente.', variant: 'destructive' });
      navigate(REDIRECT_PATH, { replace: true });
      return;
    }
    sessionStorage.removeItem(STATE_KEY);

    (async () => {
      setBusy(true);
      try {
        const res = await callFacebookOAuth<{ pages: PageOption[] }>({
          action: 'exchange',
          code,
          redirect_uri: redirectUri,
        });
        setPages(res.pages);
        if (res.pages.length === 1) {
          await selectPage(res.pages[0].id);
        }
      } catch (err) {
        toast({
          title: 'Falha ao conectar',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      } finally {
        setBusy(false);
        setLoading(false);
        navigate(REDIRECT_PATH, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await callFacebookOAuth<{ url: string; state: string }>({
        action: 'login-url',
        redirect_uri: redirectUri,
      });
      sessionStorage.setItem(STATE_KEY, res.state);
      window.location.href = res.url;
    } catch (err) {
      setBusy(false);
      toast({
        title: 'Não foi possível iniciar o login',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const selectPage = async (pageId: string) => {
    setBusy(true);
    try {
      await callFacebookOAuth({ action: 'select-page', page_id: pageId });
      setPages(null);
      await loadStatus();
      toast({ title: 'Página conectada!' });
    } catch (err) {
      toast({
        title: 'Erro ao selecionar Página',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await callFacebookOAuth({ action: 'disconnect' });
      setConnection(null);
      setPages(null);
      toast({ title: 'Facebook desconectado' });
    } catch (err) {
      toast({
        title: 'Erro ao desconectar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasError = connection?.status === 'error' || Boolean(connection?.last_error);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Facebook className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-display font-bold">Facebook</h1>
          <p className="text-sm text-muted-foreground">
            Conecte a Página para publicar automaticamente cada novo conteúdo
          </p>
        </div>
      </div>

      {pages && pages.length > 1 && (
        <Card className="p-5 space-y-3">
          <h2 className="text-lg font-semibold">Escolha a Página</h2>
          <div className="space-y-2">
            {pages.map((page) => (
              <div key={page.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <div>
                  <p className="font-medium">{page.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => selectPage(page.id)}>
                  Selecionar
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {connection ? (
        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-3">
              {hasError ? (
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{connection.page_name}</p>
                <p className="text-xs text-muted-foreground">ID da Página: {connection.page_id}</p>
              </div>
            </div>
            <Badge variant={hasError ? 'destructive' : 'secondary'}>
              {hasError ? 'Requer atenção' : 'Conectado'}
            </Badge>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Última publicação:{' '}
              {connection.last_published_at
                ? `${format(new Date(connection.last_published_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}${
                    connection.last_published_title ? ` — ${connection.last_published_title}` : ''
                  }`
                : 'nenhuma ainda'}
            </p>
            {connection.last_error && <p className="text-destructive">Último erro: {connection.last_error}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={connect} disabled={busy} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Reconectar Facebook
            </Button>
            <Button variant="destructive" onClick={disconnect} disabled={busy} className="gap-2">
              <Link2Off className="h-4 w-4" />
              Desconectar
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Nenhuma Página conectada. Ao conectar, serão solicitadas as permissões de gestão de publicações da Página.
          </p>
          <Button onClick={connect} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
            Conectar Facebook
          </Button>
        </Card>
      )}
    </div>
  );
};

export default AdminFacebook;