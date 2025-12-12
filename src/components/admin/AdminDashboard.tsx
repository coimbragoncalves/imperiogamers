import { useQuery } from '@tanstack/react-query';
import { FileText, Eye, MessageSquare, ThumbsUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const AdminDashboard = () => {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [articles, comments] = await Promise.all([
        supabase.from('articles').select('id, views, likes'),
        supabase.from('comments').select('id'),
      ]);

      const totalViews = articles.data?.reduce((sum, a) => sum + (a.views || 0), 0) || 0;
      const totalLikes = articles.data?.reduce((sum, a) => sum + (a.likes || 0), 0) || 0;

      return {
        articles: articles.data?.length || 0,
        views: totalViews,
        comments: comments.data?.length || 0,
        likes: totalLikes,
      };
    },
  });

  const statCards = [
    { label: 'Artigos', value: stats?.articles || 0, icon: FileText, color: 'text-primary' },
    { label: 'Visualizações', value: stats?.views || 0, icon: Eye, color: 'text-gaming-cyan' },
    { label: 'Comentários', value: stats?.comments || 0, icon: MessageSquare, color: 'text-gaming-gold' },
    { label: 'Curtidas', value: stats?.likes || 0, icon: ThumbsUp, color: 'text-accent' },
  ];

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-display font-bold mb-6 md:mb-8">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-4 md:p-6">
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <span className="text-muted-foreground text-xs md:text-sm">{label}</span>
              <Icon className={`h-4 w-4 md:h-5 md:w-5 ${color}`} />
            </div>
            <p className="text-xl md:text-3xl font-display font-bold">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-display font-bold mb-3 md:mb-4">Bem-vindo ao Painel Admin</h2>
        <p className="text-sm md:text-base text-muted-foreground">
          Use o menu lateral para gerenciar artigos, trailers, comentários e anúncios do site.
        </p>
      </div>
    </div>
  );
};

export default AdminDashboard;