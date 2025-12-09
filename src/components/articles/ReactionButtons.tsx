import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';

interface ReactionButtonsProps {
  articleId: string;
  likes: number;
  dislikes: number;
}

const ReactionButtons = ({ articleId, likes, dislikes }: ReactionButtonsProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [guestId] = useState(() => localStorage.getItem('guestId') || crypto.randomUUID());

  // Save guest ID
  if (!localStorage.getItem('guestId')) {
    localStorage.setItem('guestId', guestId);
  }

  const { data: userReaction } = useQuery({
    queryKey: ['user-reaction', articleId, user?.id || guestId],
    queryFn: async () => {
      const query = supabase
        .from('reactions')
        .select('reaction_type')
        .eq('article_id', articleId);

      if (user) {
        query.eq('user_id', user.id);
      } else {
        query.eq('guest_id', guestId);
      }

      const { data } = await query.single();
      return data?.reaction_type as 'like' | 'dislike' | null;
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async (reactionType: 'like' | 'dislike') => {
      // If already reacted with same type, remove reaction
      if (userReaction === reactionType) {
        const query = supabase
          .from('reactions')
          .delete()
          .eq('article_id', articleId);

        if (user) {
          query.eq('user_id', user.id);
        } else {
          query.eq('guest_id', guestId);
        }

        await query;

        // Update article counts
        if (reactionType === 'like') {
          await supabase.from('articles').update({ likes: likes - 1 }).eq('id', articleId);
        } else {
          await supabase.from('articles').update({ dislikes: dislikes - 1 }).eq('id', articleId);
        }

        return null;
      }

      // If changing reaction type
      if (userReaction) {
        const query = supabase
          .from('reactions')
          .update({ reaction_type: reactionType })
          .eq('article_id', articleId);

        if (user) {
          query.eq('user_id', user.id);
        } else {
          query.eq('guest_id', guestId);
        }

        await query;

        // Update counts
        if (reactionType === 'like') {
          await supabase.from('articles').update({ likes: likes + 1, dislikes: dislikes - 1 }).eq('id', articleId);
        } else {
          await supabase.from('articles').update({ likes: likes - 1, dislikes: dislikes + 1 }).eq('id', articleId);
        }

        return reactionType;
      }

      // New reaction
      const insertData: any = {
        article_id: articleId,
        reaction_type: reactionType,
      };

      if (user) {
        insertData.user_id = user.id;
      } else {
        insertData.guest_id = guestId;
      }

      await supabase.from('reactions').insert(insertData);

      // Update article counts
      if (reactionType === 'like') {
        await supabase.from('articles').update({ likes: likes + 1 }).eq('id', articleId);
      } else {
        await supabase.from('articles').update({ dislikes: dislikes + 1 }).eq('id', articleId);
      }

      return reactionType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-reaction', articleId] });
      queryClient.invalidateQueries({ queryKey: ['article'] });
      queryClient.invalidateQueries({ queryKey: ['trailer'] });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar sua reação.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="flex items-center gap-4 py-4 border-y border-border mb-8">
      <Button
        variant={userReaction === 'like' ? 'default' : 'outline'}
        size="lg"
        onClick={() => reactionMutation.mutate('like')}
        disabled={reactionMutation.isPending}
      >
        <ThumbsUp className="h-5 w-5" />
        <span>{likes}</span>
      </Button>
      <Button
        variant={userReaction === 'dislike' ? 'destructive' : 'outline'}
        size="lg"
        onClick={() => reactionMutation.mutate('dislike')}
        disabled={reactionMutation.isPending}
      >
        <ThumbsDown className="h-5 w-5" />
        <span>{dislikes}</span>
      </Button>
    </div>
  );
};

export default ReactionButtons;
