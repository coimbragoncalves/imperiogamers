import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsItem {
  title: string;
  description: string;
  content: string;
  imageUrls: string[]; // Array of all available images
  sourceUrl: string;
  sourceSite: string;
  contentType: 'news' | 'review' | 'trailer';
  youtubeUrl?: string;
}

// Patterns to identify and exclude logos from images
const LOGO_PATTERNS = [
  /logo/i,
  /brand/i,
  /icon/i,
  /favicon/i,
  /sprite/i,
  /avatar/i,
  /social/i,
  /share/i,
  /button/i,
  /badge/i,
  /widget/i,
  /ad-/i,
  /advertisement/i,
  /banner-ad/i,
  /promo-/i,
  /tracking/i,
  /pixel/i,
  /1x1/i,
  /spacer/i,
  /-small\./i,
  /-thumb\./i,
  /thumbnail-small/i,
];

// Known site logo domains/paths to exclude
const LOGO_DOMAINS = [
  'googleadservices',
  'doubleclick',
  'facebook.com/tr',
  'analytics',
  'cdn.cnn.com/cnn-brightcove',
  'assets.ign.com/logos',
  'gamespot.com/bundles',
  'kotaku.com/assets',
  'polygon.com/logos',
  'pcgamer.com/bundles',
];

function isLikelyLogo(imageUrl: string): boolean {
  if (!imageUrl) return true;
  
  // Check for logo patterns in URL
  for (const pattern of LOGO_PATTERNS) {
    if (pattern.test(imageUrl)) return true;
  }
  
  // Check for known logo domains
  for (const domain of LOGO_DOMAINS) {
    if (imageUrl.includes(domain)) return true;
  }
  
  // Filter out very small images (often used for tracking/logos)
  // Check for size indicators in URL
  if (/\/(50|40|32|24|16|20)x\d+/i.test(imageUrl)) return true;
  if (/\/\d+x(50|40|32|24|16|20)/i.test(imageUrl)) return true;
  
  // Filter out data URIs (usually small icons)
  if (imageUrl.startsWith('data:')) return true;
  
  return false;
}

function extractAllImages(html: string, markdown: string): string[] {
  const images: Set<string> = new Set();
  
  // Extract from HTML - get all img tags
  const htmlImgMatches = html?.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
  for (const match of htmlImgMatches) {
    if (match[1] && !isLikelyLogo(match[1])) {
      images.add(match[1]);
    }
  }
  
  // Extract from HTML - get srcset images (often higher quality)
  const srcsetMatches = html?.matchAll(/srcset=["']([^"']+)["']/gi) || [];
  for (const match of srcsetMatches) {
    const srcsetUrls = match[1].split(',').map(s => s.trim().split(' ')[0]);
    for (const url of srcsetUrls) {
      if (url && !isLikelyLogo(url)) {
        images.add(url);
      }
    }
  }
  
  // Extract from HTML - data-src (lazy loaded images)
  const dataSrcMatches = html?.matchAll(/data-src=["']([^"']+)["']/gi) || [];
  for (const match of dataSrcMatches) {
    if (match[1] && !isLikelyLogo(match[1])) {
      images.add(match[1]);
    }
  }
  
  // Extract from markdown
  const mdImgMatches = markdown?.matchAll(/!\[.*?\]\(([^)]+)\)/g) || [];
  for (const match of mdImgMatches) {
    if (match[1] && !isLikelyLogo(match[1])) {
      images.add(match[1]);
    }
  }
  
  // Extract from markdown - reference style images
  const mdRefMatches = markdown?.matchAll(/\[.*?\]:\s*(https?:\/\/[^\s]+)/g) || [];
  for (const match of mdRefMatches) {
    if (match[1] && !isLikelyLogo(match[1]) && /\.(jpg|jpeg|png|gif|webp)/i.test(match[1])) {
      images.add(match[1]);
    }
  }
  
  return Array.from(images);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verifica parâmetros da execução
    let forceNew = false;
    let postsPerType = 3; // Default: 3 posts per type
    let contentTypes: string[] = ['news', 'review', 'trailer']; // Default: all types
    try {
      const body = await req.json();
      forceNew = body?.forceNew === true;
      if (body?.postsPerType && typeof body.postsPerType === 'number') {
        postsPerType = Math.min(Math.max(body.postsPerType, 1), 10); // Limita entre 1 e 10
      }
      if (body?.contentTypes && Array.isArray(body.contentTypes) && body.contentTypes.length > 0) {
        contentTypes = body.contentTypes.filter((t: string) => ['news', 'review', 'trailer'].includes(t));
      }
    } catch {
      // Corpo vazio, execução automática (cron)
    }
    
    console.log('Execution mode:', forceNew ? 'MANUAL (force new)' : 'AUTOMATIC (check duplicates)');
    console.log('Posts per type:', postsPerType);
    console.log('Content types:', contentTypes);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lovable API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if AI is enabled
    const { data: settings, error: settingsError } = await supabase
      .from('ai_settings')
      .select('*')
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI settings not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings.is_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI auto-posting is disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sourceSites = settings.source_sites as string[];
    const youtubeChannels = settings.youtube_channels as string[];
    
    console.log('Starting AI auto-post for sites:', sourceSites);

    const newsItems: NewsItem[] = [];

    // Scrape each source site for latest news
    for (const site of sourceSites) {
      try {
        console.log(`Scraping ${site}...`);
        
        // Search for news
        const newsResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:${site} gaming news`,
            limit: 5,
            tbs: 'qdr:d', // Last 24 hours
            scrapeOptions: {
              formats: ['markdown', 'html']
            }
          }),
        });

        if (newsResponse.ok) {
          const newsData = await newsResponse.json();
          if (newsData.success && newsData.data) {
            for (const result of newsData.data) {
              const allImages = extractAllImages(result.html || '', result.markdown || '');
              if (result.metadata?.ogImage && !isLikelyLogo(result.metadata.ogImage)) {
                if (!allImages.includes(result.metadata.ogImage)) {
                  allImages.unshift(result.metadata.ogImage);
                }
              }
              console.log(`Found ${allImages.length} images for news: ${result.title}`);
              newsItems.push({
                title: result.title || 'Untitled',
                description: result.description || '',
                content: result.markdown || result.description || '',
                imageUrls: allImages,
                sourceUrl: result.url,
                sourceSite: site,
                contentType: 'news'
              });
            }
          }
        }

        // Search for reviews separately
        const reviewResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:${site} game review`,
            limit: 5,
            tbs: 'qdr:w', // Last week for reviews
            scrapeOptions: {
              formats: ['markdown', 'html']
            }
          }),
        });

        if (reviewResponse.ok) {
          const reviewData = await reviewResponse.json();
          if (reviewData.success && reviewData.data) {
            for (const result of reviewData.data) {
              // Only add if URL or title contains "review"
              const lowerTitle = (result.title || '').toLowerCase();
              const lowerUrl = (result.url || '').toLowerCase();
              if (!lowerTitle.includes('review') && !lowerUrl.includes('review')) continue;
              
              const allImages = extractAllImages(result.html || '', result.markdown || '');
              if (result.metadata?.ogImage && !isLikelyLogo(result.metadata.ogImage)) {
                if (!allImages.includes(result.metadata.ogImage)) {
                  allImages.unshift(result.metadata.ogImage);
                }
              }
              console.log(`Found ${allImages.length} images for review: ${result.title}`);
              newsItems.push({
                title: result.title || 'Untitled',
                description: result.description || '',
                content: result.markdown || result.description || '',
                imageUrls: allImages,
                sourceUrl: result.url,
                sourceSite: site,
                contentType: 'review'
              });
            }
          }
        }

      } catch (error) {
        console.error(`Error scraping ${site}:`, error);
      }
    }

    // Search for trailers from YouTube channels
    for (const channel of youtubeChannels) {
      try {
        console.log(`Searching trailers from ${channel}...`);
        
        const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:youtube.com ${channel} game trailer official`,
            limit: 5,
            tbs: 'qdr:w', // Last week
          }),
        });

        if (!searchResponse.ok) continue;

        const searchData = await searchResponse.json();
        
        if (searchData.success && searchData.data) {
          for (const result of searchData.data) {
            if (result.url?.includes('youtube.com/watch')) {
              // Extract video ID for thumbnail
              const videoIdMatch = result.url.match(/[?&]v=([^&]+)/);
              const thumbnails: string[] = [];
              if (videoIdMatch) {
                // Add multiple quality thumbnails
                thumbnails.push(`https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`);
                thumbnails.push(`https://img.youtube.com/vi/${videoIdMatch[1]}/hqdefault.jpg`);
              }
              
              newsItems.push({
                title: result.title || 'Game Trailer',
                description: result.description || '',
                content: result.description || '',
                imageUrls: thumbnails,
                sourceUrl: result.url,
                sourceSite: 'youtube.com',
                contentType: 'trailer',
                youtubeUrl: result.url
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error searching YouTube channel ${channel}:`, error);
      }
    }

    console.log(`Found ${newsItems.length} news items (before image filter)`);

    // Filter out items without images - news/reviews need at least one image, trailers need youtube URL
    const filteredItems = newsItems.filter(item => {
      if (item.contentType === 'trailer') {
        return item.youtubeUrl && item.youtubeUrl.length > 0;
      }
      return item.imageUrls.length > 0;
    });

    console.log(`After image filter: ${filteredItems.length} items (removed ${newsItems.length - filteredItems.length} without images)`);

    if (filteredItems.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No content with images found', postsCreated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Separate content types based on selected types
    const newsOnly = contentTypes.includes('news') 
      ? filteredItems.filter(item => item.contentType === 'news') 
      : [];
    const reviewsOnly = contentTypes.includes('review') 
      ? filteredItems.filter(item => item.contentType === 'review') 
      : [];
    const trailersOnly = contentTypes.includes('trailer') 
      ? filteredItems.filter(item => item.contentType === 'trailer') 
      : [];
    
    // Build the final list: postsPerType of each selected type
    const itemsToProcess: NewsItem[] = [];
    
    // Add up to postsPerType news items (if selected)
    if (contentTypes.includes('news')) {
      for (const item of newsOnly) {
        if (itemsToProcess.filter(i => i.contentType === 'news').length < postsPerType) {
          itemsToProcess.push(item);
        }
      }
    }
    
    // Add up to postsPerType reviews (if selected)
    if (contentTypes.includes('review')) {
      for (const item of reviewsOnly) {
        if (itemsToProcess.filter(i => i.contentType === 'review').length < postsPerType) {
          itemsToProcess.push(item);
        }
      }
    }
    
    // Add up to postsPerType trailers (if selected)
    if (contentTypes.includes('trailer')) {
      for (const item of trailersOnly) {
        if (itemsToProcess.filter(i => i.contentType === 'trailer').length < postsPerType) {
          itemsToProcess.push(item);
        }
      }
    }
    
    console.log(`Processing ${itemsToProcess.length} items (${postsPerType} per type): ${itemsToProcess.filter(i => i.contentType === 'news').length} news, ${itemsToProcess.filter(i => i.contentType === 'review').length} reviews, ${itemsToProcess.filter(i => i.contentType === 'trailer').length} trailers`);

    // Process each news item with AI
    let postsCreated = 0;
    
    for (const item of itemsToProcess) {
      try {
        // Check if we already posted this URL (skip check if forceNew is true)
        if (!forceNew) {
          const { data: existingLog } = await supabase
            .from('ai_post_logs')
            .select('id')
            .eq('source_url', item.sourceUrl)
            .single();

          if (existingLog) {
            console.log(`Already posted: ${item.sourceUrl}`);
            continue;
          }
        }

        console.log(`Processing: ${item.title}`);

        // Use AI to rewrite the content in Portuguese
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              {
                role: 'system',
                content: `Você é um jornalista de games brasileiro do portal "Império Gamers". Reescreva notícias de games em português brasileiro de forma original e engajante. 
                
REGRAS IMPORTANTES:
- Reescreva o conteúdo de forma COMPLETAMENTE ORIGINAL, não copie
- NUNCA mencione a fonte original (sites como IGN, GameSpot, Kotaku, PC Gamer, Polygon, etc.)
- NUNCA inclua logos, marcas ou referências visuais a outros sites
- Use linguagem informal mas profissional, como um gamer brasileiro falaria
- Mantenha os fatos e informações importantes do jogo/notícia
- Crie um título atraente e original em português
- A descrição deve ter 1-2 frases chamativas
- O conteúdo deve ter 3-5 parágrafos em HTML puro (use <p>, <strong>, <em>)
- Foque apenas no JOGO ou ASSUNTO da notícia, não na fonte
- Se mencionar desenvolvedores ou publishers, cite apenas os oficiais (Nintendo, Sony, Microsoft, Ubisoft, etc.)

Responda APENAS em JSON válido com a estrutura: {"title": "...", "description": "...", "content": "<p>...</p>"}`
              },
              {
                role: 'user',
                content: `Reescreva esta notícia sobre games (ignore qualquer menção ao site fonte):\n\nTítulo original: ${item.title}\n\nConteúdo:\n${item.content.substring(0, 3000)}`
              }
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('AI error:', errorText);
          
          // Log the error
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: `AI error: ${aiResponse.status}`
          });
          continue;
        }

        const aiData = await aiResponse.json();
        const aiContent = aiData.choices?.[0]?.message?.content;
        
        if (!aiContent) {
          console.error('No AI content received');
          continue;
        }

        // Parse AI response
        let parsedContent;
        try {
          // Clean the response - remove markdown code blocks if present
          let cleanContent = aiContent.trim();
          if (cleanContent.startsWith('```json')) {
            cleanContent = cleanContent.slice(7);
          }
          if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.slice(3);
          }
          if (cleanContent.endsWith('```')) {
            cleanContent = cleanContent.slice(0, -3);
          }
          parsedContent = JSON.parse(cleanContent.trim());
        } catch (parseError) {
          console.error('Failed to parse AI response:', aiContent);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: 'Failed to parse AI response'
          });
          continue;
        }

        // Generate slug
        const slug = parsedContent.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 100);

        // Use the first available image as cover, or skip this item entirely
        const coverImage = item.imageUrls.length > 0 ? item.imageUrls[0] : null;
        
        // SAFETY: Never create posts without visual content
        if (item.contentType !== 'trailer' && !coverImage) {
          console.log(`Skipping "${parsedContent.title}" - no cover image available`);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: 'No cover image available'
          });
          continue;
        }
        
        if (item.contentType === 'trailer' && !item.youtubeUrl) {
          console.log(`Skipping trailer "${parsedContent.title}" - no YouTube URL`);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: 'No YouTube URL for trailer'
          });
          continue;
        }
        
        // For trailers, use YouTube thumbnail as cover if no other image
        const finalCoverImage = coverImage || (item.youtubeUrl ? `https://img.youtube.com/vi/${item.youtubeUrl.match(/[?&]v=([^&]+)/)?.[1]}/maxresdefault.jpg` : null);
        
        // Create the article
        const { data: article, error: articleError } = await supabase
          .from('articles')
          .insert({
            title: parsedContent.title,
            slug: slug + '-' + Date.now(),
            description: parsedContent.description,
            content: parsedContent.content,
            cover_image: finalCoverImage,
            content_type: item.contentType,
            youtube_url: item.youtubeUrl || null,
            is_published: true
          })
          .select()
          .single();
        
        // If article created successfully, save all additional images
        if (!articleError && article && item.imageUrls.length > 1) {
          const additionalImages = item.imageUrls.slice(1).map((url, index) => ({
            article_id: article.id,
            image_url: url,
            position: index + 1,
            caption: null
          }));
          
          if (additionalImages.length > 0) {
            const { error: imagesError } = await supabase
              .from('article_images')
              .insert(additionalImages);
            
            if (imagesError) {
              console.error('Error saving additional images:', imagesError);
            } else {
              console.log(`Saved ${additionalImages.length} additional images for article`);
            }
          }
        }

        if (articleError) {
          console.error('Error creating article:', articleError);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: articleError.message
          });
          continue;
        }

        // Log success
        await supabase.from('ai_post_logs').insert({
          source_url: item.sourceUrl,
          source_site: item.sourceSite,
          article_id: article.id,
          content_type: item.contentType,
          status: 'success'
        });

        postsCreated++;
        console.log(`Created article: ${article.title}`);

      } catch (error) {
        console.error(`Error processing item:`, error);
        await supabase.from('ai_post_logs').insert({
          source_url: item.sourceUrl,
          source_site: item.sourceSite,
          content_type: item.contentType,
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Update last run timestamp
    await supabase
      .from('ai_settings')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', settings.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${postsCreated} posts`,
        postsCreated,
        itemsFound: filteredItems.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI auto-post error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
