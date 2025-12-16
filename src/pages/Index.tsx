import { Helmet } from 'react-helmet-async';
import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/home/HeroSection';
import LatestArticles from '@/components/home/LatestArticles';
import LatestDownloads from '@/components/home/LatestDownloads';

const Index = () => {
  return (
    <>
      <Helmet>
        <title>Império Gamers - Seu Portal de Games</title>
        <meta name="description" content="Notícias, reviews e trailers do mundo dos games. Fique por dentro de tudo que acontece no universo gamer!" />
      </Helmet>
      <Layout>
        <HeroSection />
        <LatestArticles />
        <LatestDownloads />
      </Layout>
    </>
  );
};

export default Index;
