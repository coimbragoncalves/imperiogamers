import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://imperiogamer1.vercel.app'
const SITE_NAME = 'Império Gamers'
const FALLBACK_IMAGE =
  'https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4297619e-5b82-49a8-a747-da8d168cc538/id-preview-1560b5fe--cb48d054-d4b5-4b7e-bbb1-833cbc111988.lovable.app-1770567716452.png'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function resolveAbsoluteImage(imageUrl?: string | null): string {
  if (!imageUrl || !imageUrl.trim()) return FALLBACK_IMAGE
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl
  if (imageUrl.startsWith('/')) return `${SITE_URL}${imageUrl}`
  return FALLBACK_IMAGE
}

function truncateDescription(text?: string | null): string {
  const safe = (text || '').trim()
  if (!safe) return 'Leia a notícia completa no Império Gamers.'
  return safe.length > 200 ? `${safe.slice(0, 197)}...` : safe
}

function getPaths(pathType: string | null, articleType?: string | null) {
  if (pathType === 'noticia') return { publicPath: 'noticia', debugType: 'noticia' }
  if (pathType === 'trailer' || articleType === 'trailer') return { publicPath: 'trailer', debugType: 'trailer' }
  return { publicPath: 'artigo', debugType: 'artigo' }
}

function noCacheHeaders(contentType: string) {
  return {
    ...corsHeaders,
    'Content-Type': contentType,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  }
}

function renderHtml({
  title,
  description,
  articleUrl,
  ogImage,
  ogType,
  publishedTime,
}: {
  title: string
  description: string
  articleUrl: string
  ogImage: string
  ogType: string
  publishedTime: string
}) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)

  return `<!DOCTYPE html>
<html lang="pt-BR" prefix="og: https://ogp.me/ns# article: https://ogp.me/ns/article#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - ${SITE_NAME}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${articleUrl}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:url" content="${articleUrl}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:url" content="${ogImage}">
  <meta property="og:image:secure_url" content="${ogImage}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${safeTitle}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="pt_BR">
  <meta property="article:published_time" content="${publishedTime}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${articleUrl}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="twitter:image:alt" content="${safeTitle}">
  <meta name="twitter:site" content="@imperiogamers">
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <img src="${ogImage}" alt="${safeTitle}" width="1200" height="630">
    <p><a href="${articleUrl}">Abrir notícia no ${SITE_NAME}</a></p>
  </main>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: noCacheHeaders('text/plain; charset=utf-8') })
  }

  const url = new URL(req.url)
  const debugMode = url.searchParams.get('debug') === '1'

  try {
    const cleanedPath = url.pathname
      .replace(/^\/functions\/v1\/og-image\/?/, '')
      .replace(/^\/og-image\/?/, '')
    const pathParts = cleanedPath.split('/').filter(Boolean)

    const requestedType = pathParts[0] || url.searchParams.get('type') || 'artigo'
    const slug = decodeURIComponent(pathParts.slice(1).join('/')) || url.searchParams.get('slug') || ''
    const requestedPathType = url.searchParams.get('pathType') || requestedType
    const originalUrl = url.searchParams.get('originalUrl')?.trim()

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: noCacheHeaders('application/json; charset=utf-8'),
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: article } = await supabase
      .from('articles')
      .select('title, description, cover_image, slug, content_type, created_at')
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    const paths = getPaths(requestedPathType, article?.content_type)
    const fallbackUrl = originalUrl || `${SITE_URL}/${paths.publicPath}/${slug}`
    const title = article?.title?.trim() || 'Império Gamers'
    const description = truncateDescription(article?.description || article?.title)
    const ogImage = resolveAbsoluteImage(article?.cover_image)
    const articleUrl = article?.slug ? `${SITE_URL}/${paths.publicPath}/${article.slug}` : fallbackUrl
    const ogType = paths.publicPath === 'trailer' ? 'video.other' : 'article'
    const publishedTime = article?.created_at || new Date().toISOString()

    if (debugMode) {
      return new Response(
        JSON.stringify({
          found: Boolean(article),
          slug,
          requestedType,
          publicPath: paths.publicPath,
          og: {
            title,
            description,
            image: ogImage,
            url: articleUrl,
            type: ogType,
          },
        }),
        {
          status: 200,
          headers: noCacheHeaders('application/json; charset=utf-8'),
        }
      )
    }

    const html = renderHtml({
      title,
      description,
      articleUrl,
      ogImage,
      ogType,
      publishedTime,
    })

    return new Response(html, {
      status: article ? 200 : 200,
      headers: noCacheHeaders('text/html; charset=utf-8'),
    })
  } catch (error) {
    console.error('og-image error', error)

    const fallbackHtml = renderHtml({
      title: 'Império Gamers',
      description: 'Leia a notícia completa no Império Gamers.',
      articleUrl: SITE_URL,
      ogImage: FALLBACK_IMAGE,
      ogType: 'article',
      publishedTime: new Date().toISOString(),
    })

    return new Response(fallbackHtml, {
      status: 200,
      headers: noCacheHeaders('text/html; charset=utf-8'),
    })
  }
})