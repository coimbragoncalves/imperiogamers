import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/lib/auth-context";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import News from "./pages/News";
import Reviews from "./pages/Reviews";
import Trailers from "./pages/Trailers";
import Downloads from "./pages/Downloads";
import Download from "./pages/Download";
import Article from "./pages/Article";
import Trailer from "./pages/Trailer";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/noticias" element={<News />} />
              <Route path="/reviews" element={<Reviews />} />
              <Route path="/trailers" element={<Trailers />} />
              <Route path="/diversos" element={<Downloads />} />
              <Route path="/diversos/:id" element={<Download />} />
              <Route path="/artigo/:slug" element={<Article />} />
              <Route path="/noticia/:slug" element={<Article />} />
              <Route path="/trailer/:slug" element={<Trailer />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
