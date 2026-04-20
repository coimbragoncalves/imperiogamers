import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// The published Vercel domain
const SITE_URL = 'https://imperiogamer1.vercel.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)

    // Parse path: /og-image/artigo/slug or /og-image/trailer/slug
    let slug: string | null = null
    let type = 'article'

    // Strip both possible prefixes: /functions/v1/og-image and /og-image
    const cleanedPath = url.pathname
      .replace(/^\/functions\/v1\/og-image\/?/, '')
      .replace(/^\/og-image\/?/, '')
    const pathParts = cleanedPath.split('/').filter(Boolean)

    if (pathParts.length >= 2) {
      const pathType = pathParts[0]
      slug = decodeURIComponent(pathParts.slice(1).join('/'))
      type = pathType === 'trailer' ? 'trailer' : 'article'
    } else if (pathParts.length === 1) {
      slug = decodeURIComponent(pathParts[0])
    }

    if (!slug) {
      slug = url.searchParams.get('slug')
    }
    if (url.searchParams.get('type')) {
      type = url.searchParams.get('type')!
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

    const basePath = type === 'trailer' || article.content_type === 'trailer' ? 'trailer' : 'artigo'
    const articleUrl = `${SITE_URL}/${basePath}/${article.slug}`
    const FALLBACK_IMAGE = 'https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4297619e-5b82-49a8-a747-da8d168cc538/id-preview-1560b5fe--cb48d054-d4b5-4b7e-bbb1-833cbc111988.lovable.app-1770567716452.png'
    const ogImage = article.cover_image && article.cover_image.startsWith('http') ? article.cover_image : FALLBACK_IMAGE
    const title = escapeHtml(article.title)
    const rawDescription = (article.description && article.description.trim()) || article.title
    const trimmedDesc = rawDescription.length > 200 ? rawDescription.slice(0, 197) + '...' : rawDescription
    const description = escapeHtml(trimmedDesc)
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
  <meta property="article:publisher" content="${SITE_URL}">
  <meta property="article:published_time" content="${publishedTime}">
  
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${articleUrl}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="twitter:image:alt" content="${title}">
  <meta name="twitter:site" content="@imperiogamers">
  
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
      status: 200,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
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