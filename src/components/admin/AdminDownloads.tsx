import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Eye, EyeOff, Download, Gamepad2, Wrench, Package } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DownloadItem {
  id: string;
  title: string;
  category: string;
  is_published: boolean;
  views: number;
  downloads_count: number;
  created_at: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  game: <Gamepad2 className="h-4 w-4" />,
  tool: <Wrench className="h-4 w-4" />,
  other: <Package className="h-4 w-4" />,
};

const categoryLabels: Record<string, string> = {
  game: 'Jogo',
  tool: 'Ferramenta',
  other: 'Outro',
};

const AdminDownloads = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: downloads, isLoading } = useQuery({
    queryKey: ['admin-downloads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('downloads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as DownloadItem[];
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase
        .from('downloads')
        .update({ is_published: !is_published })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-downloads'] });
      toast({ title: 'Status atualizado!' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('downloads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-downloads'] });
      toast({ title: 'Item deletado!' });
    },
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-display font-bold">Diversos (Downloads)</h1>
        <Button asChild>
          <Link to="/admin/diversos/novo">
            <Plus className="h-4 w-4" />
            Novo Item
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : downloads && downloads.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead className="hidden md:table-cell">Views</TableHead>
                <TableHead className="hidden md:table-cell">Downloads</TableHead>
                <TableHead className="hidden lg:table-cell">Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {downloads.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {item.title}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      {categoryIcons[item.category]}
                      {categoryLabels[item.category]}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{item.views}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      {item.downloads_count}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs ${
                      item.is_published 
                        ? 'bg-green-500/20 text-green-500' 
                        : 'bg-yellow-500/20 text-yellow-500'
                    }`}>
                      {item.is_published ? 'Publicado' : 'Rascunho'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePublishMutation.mutate({ 
                          id: item.id, 
                          is_published: item.is_published 
                        })}
                        title={item.is_published ? 'Despublicar' : 'Publicar'}
                      >
                        {item.is_published ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/admin/diversos/${item.id}`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Tem certeza que deseja deletar?')) {
                            deleteMutation.mutate(item.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum item cadastrado ainda.</p>
          <Button asChild className="mt-4">
            <Link to="/admin/diversos/novo">Adicionar primeiro item</Link>
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdminDownloads;
