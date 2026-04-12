import { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import AdDisplay from '@/components/ads/AdDisplay';
import ServiceWorkerRegistrar from '@/components/ads/ServiceWorkerRegistrar';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <ServiceWorkerRegistrar />
      <Header />
      <AdDisplay position="header" className="container mx-auto px-4 py-2" />
      <AdDisplay position="popup" className="fixed bottom-4 right-4 z-50 max-w-sm" />
      <main className="flex-1">{children}</main>
      <AdDisplay position="footer" className="container mx-auto px-4 py-4" />
      <Footer />
    </div>
  );
};

export default Layout;
