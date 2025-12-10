import { useState, useEffect } from 'react';
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
  
  // Guest reactions stored in localStorage
  const [guestReaction, setGuestReaction] = useState<'like' | 'dislike' | null>(null);
  const guestReactionsKey = `guest_reactions_${articleId}`;

  useEffect(() => {
    if (!user) {
      const stored = localStorage.getItem(guestReactionsKey);
      setGuestReaction(stored as 'like' | 'dislike' | null);
    }
  }, [user, guestReactionsKey]);

  // Query for authenticated user's reaction only
  const { data: userReaction } = useQuery({
    queryKey: ['user-reaction', articleId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data } = await supabase
        .from('reactions')
        .select('reaction_type')
        .eq('article_id', articleId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      return data?.reaction_type as 'like' | 'dislike' | null;
    },
    enabled: !!user,
  });

  const currentReaction = user ? userReaction : guestReaction;

  const reactionMutation = useMutation({
    mutationFn: async (reactionType: 'like' | 'dislike') => {
      // Handle guest reactions with localStorage only
      if (!user) {
        const wasLike = guestReaction === 'like';
        const wasDislike = guestReaction === 'dislike';
        
        if (guestReaction === reactionType) {
          // Remove reaction
          localStorage.removeItem(guestReactionsKey);
          setGuestReaction(null);
          
          // Update counts
          if (reactionType === 'like') {
            await supabase.from('articles').update({ likes: Math.max(0, likes - 1) }).eq('id', articleId);
          } else {
            await supabase.from('articles').update({ dislikes: Math.max(0, dislikes - 1) }).eq('id', articleId);
          }
          return null;
        }
        
        // Set or change reaction
        localStorage.setItem(guestReactionsKey, reactionType);
        setGuestReaction(reactionType);
        
        if (guestReaction) {
          // Changing reaction
          if (reactionType === 'like') {
            await supabase.from('articles').update({ likes: likes + 1, dislikes: Math.max(0, dislikes - 1) }).eq('id', articleId);
          } else {
            await supabase.from('articles').update({ likes: Math.max(0, likes - 1), dislikes: dislikes + 1 }).eq('id', articleId);
          }
        } else {
          // New reaction
          if (reactionType === 'like') {
            await supabase.from('articles').update({ likes: likes + 1 }).eq('id', articleId);
          } else {
            await supabase.from('articles').update({ dislikes: dislikes + 1 }).eq('id', articleId);
          }
        }
        return reactionType;
      }

      // Handle authenticated user reactions
      if (userReaction === reactionType) {
        await supabase
          .from('reactions')
          .delete()
          .eq('article_id', articleId)
          .eq('user_id', user.id);

        if (reactionType === 'like') {
          await supabase.from('articles').update({ likes: Math.max(0, likes - 1) }).eq('id', articleId);
        } else {
          await supabase.from('articles').update({ dislikes: Math.max(0, dislikes - 1) }).eq('id', articleId);
        }
        return null;
      }

      if (userReaction) {
        await supabase
          .from('reactions')
          .update({ reaction_type: reactionType })
          .eq('article_id', articleId)
          .eq('user_id', user.id);

        if (reactionType === 'like') {
          await supabase.from('articles').update({ likes: likes + 1, dislikes: Math.max(0, dislikes - 1) }).eq('id', articleId);
        } else {
          await supabase.from('articles').update({ likes: Math.max(0, likes - 1), dislikes: dislikes + 1 }).eq('id', articleId);
        }
        return reactionType;
      }

      await supabase.from('reactions').insert({
        article_id: articleId,
        reaction_type: reactionType,
        user_id: user.id,
      });

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
        variant={currentReaction === 'like' ? 'default' : 'outline'}
        size="lg"
        onClick={() => reactionMutation.mutate('like')}
        disabled={reactionMutation.isPending}
      >
        <ThumbsUp className="h-5 w-5" />
        <span>{likes}</span>
      </Button>
      <Button
        variant={currentReaction === 'dislike' ? 'destructive' : 'outline'}
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
