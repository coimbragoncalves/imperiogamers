import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <Layout>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-8xl font-display font-bold text-primary mb-4">404</h1>
          <p className="text-xl text-muted-foreground mb-8">Página não encontrada</p>
          <Button variant="accent" asChild>
            <Link to="/">
              <Home className="h-4 w-4" />
              Voltar ao Início
            </Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;
