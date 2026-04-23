import { useEffect, useRef, useCallback } from 'react';
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
  const executedRef = useRef<string>('');

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

  const executeScripts = useCallback(() => {
    if (!ads || ads.length === 0 || !containerRef.current) return;

    // Build a fingerprint to avoid re-executing the same scripts
    const fingerprint = ads.map(a => a.id + (a.script || '')).join('|');
    if (executedRef.current === fingerprint) return;
    executedRef.current = fingerprint;

    // Clear previous content
    containerRef.current.innerHTML = '';

    ads.forEach((ad) => {
      if (!ad.script) return;

      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-ad-id', ad.id);
      wrapper.style.minHeight = '1px';
      wrapper.style.width = '100%';

      // Parse the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = ad.script;

      // Extract script tags and non-script content separately
      const scripts: { src?: string; text?: string; attrs: Record<string, string> }[] = [];
      const nonScriptNodes: Node[] = [];

      Array.from(tempDiv.childNodes).forEach((node) => {
        if (node instanceof HTMLScriptElement) {
          const scriptInfo: { src?: string; text?: string; attrs: Record<string, string> } = { attrs: {} };
          Array.from(node.attributes).forEach((attr) => {
            if (attr.name === 'src') {
              scriptInfo.src = attr.value;
            } else {
              scriptInfo.attrs[attr.name] = attr.value;
            }
          });
          if (node.textContent) {
            scriptInfo.text = node.textContent;
          }
          scripts.push(scriptInfo);
        } else {
          nonScriptNodes.push(node.cloneNode(true));
        }
      });

      // Also find scripts nested inside other elements
      const nestedScripts = tempDiv.querySelectorAll('script');
      nestedScripts.forEach((scriptEl) => {
        // Check if already captured at top level
        const alreadyCaptured = scripts.some(
          (s) => s.src === scriptEl.getAttribute('src') && s.text === scriptEl.textContent
        );
        if (!alreadyCaptured) {
          const scriptInfo: { src?: string; text?: string; attrs: Record<string, string> } = { attrs: {} };
          Array.from(scriptEl.attributes).forEach((attr) => {
            if (attr.name === 'src') {
              scriptInfo.src = attr.value;
            } else {
              scriptInfo.attrs[attr.name] = attr.value;
            }
          });
          if (scriptEl.textContent) {
            scriptInfo.text = scriptEl.textContent;
          }
          scripts.push(scriptInfo);
          // Remove from parent so it's not duplicated
          scriptEl.remove();
        }
      });

      // Append non-script HTML first
      nonScriptNodes.forEach((node) => wrapper.appendChild(node));

      // Re-parse remaining HTML (after removing nested scripts)
      const remainingHTML = tempDiv.innerHTML;
      if (remainingHTML.trim()) {
        const remainingDiv = document.createElement('div');
        remainingDiv.innerHTML = remainingHTML;
        while (remainingDiv.firstChild) {
          wrapper.appendChild(remainingDiv.firstChild);
        }
      }

      containerRef.current?.appendChild(wrapper);

      // Now create and append actual script elements to execute them
      scripts.forEach((scriptInfo) => {
        const newScript = document.createElement('script');
        
        // Set attributes
        Object.entries(scriptInfo.attrs).forEach(([key, value]) => {
          newScript.setAttribute(key, value);
        });

        if (scriptInfo.src) {
          newScript.src = scriptInfo.src;
          // Don't force async — many ad networks (Adsterra, PropellerAds)
          // rely on synchronous execution to inject iframes into the
          // current parent node via document.currentScript.parentNode.
          if (!scriptInfo.attrs['async'] && !scriptInfo.attrs['defer']) {
            newScript.async = false;
          }
        }

        if (scriptInfo.text && !scriptInfo.src) {
          newScript.textContent = scriptInfo.text;
        }

        // CRITICAL: Always append inside the wrapper.
        // Most ad networks (Adsterra invoke.js, PropellerAds, banner SDKs)
        // use document.currentScript.parentNode to know WHERE to render
        // the iframe/banner. If the script lives in <head>, the ad is
        // either rendered invisibly in <head> or fails silently.
        // Popunders also work fine when injected here (they open new
        // windows on user interaction, regardless of script location).
        wrapper.appendChild(newScript);
      });
    });
  }, [ads]);

  useEffect(() => {
    executeScripts();

    return () => {
      // Cleanup: reset fingerprint so scripts re-execute if component remounts
      executedRef.current = '';
    };
  }, [executeScripts]);

  if (!ads || ads.length === 0) return null;

  return <div ref={containerRef} className={className} />;
};

export default AdDisplay;
