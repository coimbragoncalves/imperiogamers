import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, User, MessageSquare, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';

interface Comment {
  id: string;
  content: string;
  guest_name: string | null;
  user_id: string | null;
  created_at: string;
  parent_id: string | null;
  profiles?: { username: string | null } | null;
  isAdmin?: boolean;
}

interface CommentSectionProps {
  articleId: string;
}

const CommentSection = ({ articleId }: CommentSectionProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [guestName, setGuestName] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const { data: comments, isLoading } = useQuery({
    queryKey: ['comments', articleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('article_id', articleId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch author names/badges via a safe server-side helper (no direct profile reads)
      const { data: authors } = await supabase.rpc('get_comment_authors', {
        p_article_id: articleId,
      });

      const authorMap = new Map(
        (authors ?? []).map((a: { user_id: string; username: string | null; is_admin: boolean }) => [
          a.user_id,
          a,
        ])
      );

      const commentsWithProfiles = data.map((comment) => {
        const author = comment.user_id ? authorMap.get(comment.user_id) : undefined;
        return {
          ...comment,
          profiles: author ? { username: author.username } : null,
          isAdmin: !!author?.is_admin,
        };
      });

      return commentsWithProfiles as Comment[];
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      const commentData: any = {
        article_id: articleId,
        content,
        parent_id: replyTo,
      };

      if (user) {
        commentData.user_id = user.id;
      } else {
        if (!guestName.trim()) {
          throw new Error('Digite seu nome');
        }
        commentData.guest_name = guestName;
      }

      const { error } = await supabase.from('comments').insert(commentData);
      if (error) throw error;
    },
    onSuccess: () => {
      setContent('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['comments', articleId] });
      toast({
        title: 'Comentário enviado!',
        description: 'Seu comentário foi publicado com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível enviar o comentário.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    addCommentMutation.mutate();
  };

  const rootComments = comments?.filter(c => !c.parent_id) || [];
  const getReplies = (parentId: string) => comments?.filter(c => c.parent_id === parentId) || [];

  const CommentItem = ({ comment, depth = 0 }: { comment: Comment; depth?: number }) => {
    const replies = getReplies(comment.id);
    // Show profile username for logged users, guest_name for guests, never show "Anônimo" for admins
    const authorName = comment.user_id 
      ? (comment.profiles?.username || 'Usuário') 
      : (comment.guest_name || 'Anônimo');

    return (
      <div className={`${depth > 0 ? 'ml-4 md:ml-8 border-l border-border pl-3 md:pl-4' : ''}`}>
        <div className="bg-card rounded-lg p-4 mb-2">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${comment.isAdmin ? 'bg-primary' : 'bg-primary/20'}`}>
              {comment.isAdmin ? (
                <Shield className="h-4 w-4 text-primary-foreground" />
              ) : (
                <User className="h-4 w-4 text-primary" />
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{authorName}</span>
              {comment.isAdmin && (
                <Badge variant="default" className="text-xs px-1.5 py-0.5">
                  Admin
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
              </span>
            </div>
          </div>
          <p className="text-sm text-foreground/90">{comment.content}</p>
          <button
            onClick={() => setReplyTo(comment.id)}
            className="text-xs text-primary hover:underline mt-2"
          >
            Responder
          </button>
        </div>
        {replies.map(reply => (
          <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
        ))}
      </div>
    );
  };

  return (
    <div className="mt-8">
      <h3 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        Comentários ({comments?.length || 0})
      </h3>

      {/* Comment Form */}
      <form onSubmit={handleSubmit} className="bg-card rounded-lg p-4 mb-6">
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
            <span>Respondendo a um comentário</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-destructive hover:underline"
            >
              Cancelar
            </button>
          </div>
        )}
        {!user && (
          <Input
            placeholder="Seu nome"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="mb-3"
            maxLength={50}
          />
        )}
        <Textarea
          placeholder="Escreva seu comentário..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="mb-3 min-h-[100px]"
          maxLength={1000}
        />
        <Button type="submit" disabled={addCommentMutation.isPending || !content.trim()}>
          <Send className="h-4 w-4" />
          {addCommentMutation.isPending ? 'Enviando...' : 'Enviar'}
        </Button>
      </form>

      {/* Comments List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando comentários...</div>
      ) : rootComments.length > 0 ? (
        <div className="space-y-4">
          {rootComments.map(comment => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          Seja o primeiro a comentar!
        </div>
      )}
    </div>
  );
};

export default CommentSection;