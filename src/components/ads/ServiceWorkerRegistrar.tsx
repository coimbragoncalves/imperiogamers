import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Registers the SW.js file from storage if it exists.
 * Place this component once in the app (e.g., in Layout).
 */
const ServiceWorkerRegistrar = () => {
  const { data: existingSW } = useQuery({
    queryKey: ['sw-file-public'],
    queryFn: async () => {
      const { data } = await supabase.storage
        .from('uploads')
        .list('sw', { limit: 1, search: 'sw.js' });
      return data && data.length > 0 ? data[0] : null;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!existingSW || !('serviceWorker' in navigator)) return;

    const swUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/sw/sw.js`;

    navigator.serviceWorker
      .register(swUrl, { scope: '/' })
      .then((registration) => {
        console.log('SW registered:', registration.scope);
      })
      .catch((error) => {
        console.log('SW registration skipped:', error.message);
      });
  }, [existingSW]);

  return null;
};

export default ServiceWorkerRegistrar;
