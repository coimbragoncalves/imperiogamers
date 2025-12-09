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
      <h1 className="text-3xl font-display font-bold mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-muted-foreground text-sm">{label}</span>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-3xl font-display font-bold">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-xl font-display font-bold mb-4">Bem-vindo ao Painel Admin</h2>
        <p className="text-muted-foreground">
          Use o menu lateral para gerenciar artigos, trailers, comentários e anúncios do site.
        </p>
      </div>
    </div>
  );
};

export default AdminDashboard;
