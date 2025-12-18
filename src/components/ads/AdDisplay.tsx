import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AdDisplayProps {
  position: string;
  className?: string;
}

interface Ad {
  id: string;
  name: string;
  script: string | null;
  position: string;
  is_active: boolean;
}

const AdDisplay = ({ position, className = '' }: AdDisplayProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: ads } = useQuery({
    queryKey: ['ads', position],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads')
        .select('*')
        .eq('position', position)
        .eq('is_active', true);

      if (error) throw error;
      return data as Ad[];
    },
  });

  useEffect(() => {
    if (!ads || ads.length === 0 || !containerRef.current) return;

    // Clear previous content
    containerRef.current.innerHTML = '';

    ads.forEach((ad) => {
      if (!ad.script) return;

      // Create a temporary container to parse the HTML/script
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = ad.script;

      // Find all script tags and recreate them to ensure execution
      const scripts = tempDiv.querySelectorAll('script');
      
      scripts.forEach((oldScript) => {
        const newScript = document.createElement('script');
        
        // Copy all attributes
        Array.from(oldScript.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value);
        });
        
        // Copy inline script content
        if (oldScript.textContent) {
          newScript.textContent = oldScript.textContent;
        }
        
        // Replace old script with new one in temp container
        oldScript.parentNode?.replaceChild(newScript, oldScript);
      });

      // Append all content to the container
      while (tempDiv.firstChild) {
        containerRef.current?.appendChild(tempDiv.firstChild);
      }
    });
  }, [ads]);

  if (!ads || ads.length === 0) return null;

  return <div ref={containerRef} className={className} />;
};

export default AdDisplay;
