import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CRAWLER_USER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'WhatsApp',
  'LinkedInBot',
  'Slackbot',
  'TelegramBot',
  'Discordbot',
  'Googlebot',
  'bingbot',
]

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return true
  return CRAWLER_USER_AGENTS.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()))
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const userAgent = req.headers.get('user-agent')

    // Support both path-based and query-based URLs
    // Path-based: /og-image/artigo/my-slug or /og-image/trailer/my-slug
    // Query-based (legacy): /og-image?slug=my-slug&type=article
    let slug: string | null = null
    let type = 'article'
    let siteUrl = 'https://imperiogamers.lovable.app'

    const pathParts = url.pathname.replace(/^\/og-image\/?/, '').split('/').filter(Boolean)
    
    if (pathParts.length >= 2) {
      // Path-based: /og-image/artigo/slug or /og-image/trailer/slug
      const pathType = pathParts[0]
      slug = pathParts.slice(1).join('/')
      type = pathType === 'trailer' ? 'trailer' : 'article'
    } else if (pathParts.length === 1) {
      // Path-based with just slug: /og-image/slug
      slug = pathParts[0]
    }

    // Fallback to query params
    if (!slug) {
      slug = url.searchParams.get('slug')
    }
    if (url.searchParams.get('type')) {
      type = url.searchParams.get('type')!
    }
    if (url.searchParams.get('site_url')) {
      siteUrl = url.searchParams.get('site_url')!
    }

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: article, error } = await supabase
      .from('articles')
      .select('title, description, cover_image, slug, content_type, created_at')
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (error || !article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Build the CLEAN canonical URL (the real article page)
    const basePath = type === 'trailer' || article.content_type === 'trailer' ? 'trailer' : 'artigo'
    const articleUrl = `${siteUrl}/${basePath}/${article.slug}`

    // If not a crawler, redirect to the actual page
    if (!isCrawler(userAgent)) {
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': articleUrl,
        }
      })
    }

    // For crawlers, serve full OG meta tags
    const ogImage = article.cover_image || `${siteUrl}/placeholder.svg`
    const title = escapeHtml(article.title)
    const description = escapeHtml(article.description || article.title)
    const siteName = 'Império Gamers'
    const publishedTime = article.created_at || new Date().toISOString()

    const html = `<!DOCTYPE html>
<html lang="pt-BR" prefix="og: https://ogp.me/ns# article: https://ogp.me/ns/article#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${siteName}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${articleUrl}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${articleUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:url" content="${ogImage}">
  <meta property="og:image:secure_url" content="${ogImage}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${title}">
  <meta property="og:site_name" content="${siteName}">
  <meta property="og:locale" content="pt_BR">
  <meta property="article:publisher" content="${siteUrl}">
  <meta property="article:published_time" content="${publishedTime}">
  <meta property="fb:app_id" content="">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${articleUrl}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="twitter:image:alt" content="${title}">
  <meta name="twitter:site" content="@imperiogamers">
  
  <!-- Additional SEO -->
  <meta name="robots" content="index, follow">
  <meta name="author" content="${siteName}">
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <img src="${ogImage}" alt="${title}" width="1200" height="630">
  <p><a href="${articleUrl}">Ler artigo completo em ${siteName}</a></p>
</body>
</html>`

    return new Response(html, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      }
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})