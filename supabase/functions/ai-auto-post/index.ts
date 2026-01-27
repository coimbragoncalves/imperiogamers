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
  imageUrl: string | null;
  sourceUrl: string;
  sourceSite: string;
  contentType: 'news' | 'review' | 'trailer';
  youtubeUrl?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
        
        const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:${site} gaming news OR review`,
            limit: 3,
            tbs: 'qdr:d', // Last 24 hours
            scrapeOptions: {
              formats: ['markdown', 'html']
            }
          }),
        });

        if (!searchResponse.ok) {
          console.error(`Failed to search ${site}: ${searchResponse.status}`);
          continue;
        }

        const searchData = await searchResponse.json();
        
        if (searchData.success && searchData.data) {
          for (const result of searchData.data.slice(0, 2)) {
            // Determine content type based on URL/title
            let contentType: 'news' | 'review' | 'trailer' = 'news';
            const lowerTitle = (result.title || '').toLowerCase();
            const lowerUrl = (result.url || '').toLowerCase();
            
            if (lowerTitle.includes('review') || lowerUrl.includes('review')) {
              contentType = 'review';
            } else if (lowerTitle.includes('trailer') || lowerUrl.includes('trailer')) {
              contentType = 'trailer';
            }

            // Extract image from markdown or metadata
            let imageUrl = null;
            if (result.metadata?.ogImage) {
              imageUrl = result.metadata.ogImage;
            } else if (result.html) {
              const imgMatch = result.html.match(/<img[^>]+src="([^"]+)"/);
              if (imgMatch) imageUrl = imgMatch[1];
            }

            newsItems.push({
              title: result.title || 'Untitled',
              description: result.description || '',
              content: result.markdown || result.description || '',
              imageUrl,
              sourceUrl: result.url,
              sourceSite: site,
              contentType
            });
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
            query: `site:youtube.com ${channel} game trailer`,
            limit: 2,
            tbs: 'qdr:w', // Last week
          }),
        });

        if (!searchResponse.ok) continue;

        const searchData = await searchResponse.json();
        
        if (searchData.success && searchData.data) {
          for (const result of searchData.data) {
            if (result.url?.includes('youtube.com/watch')) {
              newsItems.push({
                title: result.title || 'Game Trailer',
                description: result.description || '',
                content: result.description || '',
                imageUrl: null,
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

    console.log(`Found ${newsItems.length} news items`);

    if (newsItems.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No new content found', postsCreated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each news item with AI
    let postsCreated = 0;
    
    for (const item of newsItems.slice(0, 5)) { // Limit to 5 posts per run
      try {
        // Check if we already posted this URL
        const { data: existingLog } = await supabase
          .from('ai_post_logs')
          .select('id')
          .eq('source_url', item.sourceUrl)
          .single();

        if (existingLog) {
          console.log(`Already posted: ${item.sourceUrl}`);
          continue;
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
                content: `Você é um jornalista de games brasileiro. Reescreva notícias de games em português brasileiro de forma original e engajante. 
                
Regras:
- Reescreva o conteúdo de forma ORIGINAL, não copie
- Use linguagem informal mas profissional
- Mantenha os fatos importantes
- Crie um título atraente em português
- A descrição deve ter 1-2 frases
- O conteúdo deve ter 3-5 parágrafos em HTML
- Responda APENAS em JSON válido com a estrutura: {"title": "...", "description": "...", "content": "<p>...</p>"}`
              },
              {
                role: 'user',
                content: `Reescreva esta notícia:\n\nTítulo original: ${item.title}\n\nConteúdo:\n${item.content.substring(0, 3000)}`
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

        // Create the article
        const { data: article, error: articleError } = await supabase
          .from('articles')
          .insert({
            title: parsedContent.title,
            slug: slug + '-' + Date.now(),
            description: parsedContent.description,
            content: parsedContent.content,
            cover_image: item.imageUrl,
            content_type: item.contentType,
            youtube_url: item.youtubeUrl || null,
            is_published: true
          })
          .select()
          .single();

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
        itemsFound: newsItems.length
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
