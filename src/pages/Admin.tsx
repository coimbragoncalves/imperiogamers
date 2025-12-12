import { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  LayoutDashboard, 
  FileText, 
  MessageSquare, 
  Megaphone,
  Plus,
  Video,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import AdminDashboard from '@/components/admin/AdminDashboard';
import AdminArticles from '@/components/admin/AdminArticles';
import AdminComments from '@/components/admin/AdminComments';
import AdminAds from '@/components/admin/AdminAds';
import ArticleEditor from '@/components/admin/ArticleEditor';
import TrailerEditor from '@/components/admin/TrailerEditor';

const Admin = () => {
  const { isAdmin, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      navigate('/auth');
    }
  }, [isLoading, user, isAdmin, navigate]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
    { icon: FileText, label: 'Artigos', path: '/admin/artigos' },
    { icon: MessageSquare, label: 'Comentários', path: '/admin/comentarios' },
    { icon: Megaphone, label: 'Anúncios', path: '/admin/anuncios' },
  ];

  return (
    <>
      <Helmet>
        <title>Admin - Império Gamers</title>
      </Helmet>
      <div className="min-h-screen flex flex-col md:flex-row bg-background">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <Link to="/" className="text-xl font-display font-bold text-primary">
            Império Gamers
          </Link>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </header>

        {/* Sidebar Overlay (Mobile) */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed md:static inset-y-0 left-0 z-50
          w-64 bg-card border-r border-border p-4 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}>
          <Link to="/" className="hidden md:block text-xl font-display font-bold text-primary mb-8">
            Império Gamers
          </Link>

          <nav className="flex-1 space-y-1 mt-4 md:mt-0">
            {navItems.map(({ icon: Icon, label, path }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  location.pathname === path
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="space-y-2 pt-4 border-t border-border">
            <Button variant="accent" className="w-full justify-start" asChild>
              <Link to="/admin/artigos/novo">
                <Plus className="h-4 w-4" />
                Novo Artigo
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/admin/trailers/novo">
                <Video className="h-4 w-4" />
                Novo Trailer
              </Link>
            </Button>
          </div>

          <div className="pt-4 mt-4 border-t border-border">
            <Button variant="ghost" className="w-full justify-start" asChild>
              <Link to="/">
                Voltar ao Site
              </Link>
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <Routes>
            <Route index element={<AdminDashboard />} />
            <Route path="artigos" element={<AdminArticles />} />
            <Route path="artigos/novo" element={<ArticleEditor />} />
            <Route path="artigos/:id" element={<ArticleEditor />} />
            <Route path="trailers/novo" element={<TrailerEditor />} />
            <Route path="trailers/:id" element={<TrailerEditor />} />
            <Route path="comentarios" element={<AdminComments />} />
            <Route path="anuncios" element={<AdminAds />} />
          </Routes>
        </main>
      </div>
    </>
  );
};

export default Admin;