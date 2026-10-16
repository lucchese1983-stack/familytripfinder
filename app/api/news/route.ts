import type { NextRequest } from 'next/server'

type NewsItem = { title: string; source: string; link: string; publishedAt: string }

const QUERIES = {
  events: (zone: string) => `(sagra OR festa OR fiera OR mercatino) "${zone}" when:21d`,
  ideas: (zone: string) => `(gita OR "cosa fare" OR weekend) bambini famiglia "${zone}" when:60d`,
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()

const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '')

async function searchNews(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=it&gl=IT&ceid=IT:it`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 FamilyTrip/1.0' },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const xml = await res.text()
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const source = tag(item, 'source')
    const rawTitle = tag(item, 'title')
    return {
      title: source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle,
      source,
      link: tag(item, 'link'),
      publishedAt: new Date(tag(item, 'pubDate')).toISOString(),
    }
  })
}

const dedupe = (items: NewsItem[], limit: number) => {
  const seen = new Set<string>()
  return items
    .filter((i) => i.title && i.link.startsWith('https://'))
    .filter((i) => {
      const key = i.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)
      return !seen.has(key) && seen.add(key)
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit)
}

export async function GET(req: NextRequest) {
  const zone = (req.nextUrl.searchParams.get('zone') ?? '').trim().slice(0, 60)
  if (!zone || /["<>]/.test(zone)) {
    return Response.json({ events: [], ideas: [] }, { status: 400 })
  }
  const [events, ideas] = await Promise.all([
    searchNews(QUERIES.events(zone)).catch(() => []),
    searchNews(QUERIES.ideas(zone)).catch(() => []),
  ])
  return Response.json(
    { events: dedupe(events, 8), ideas: dedupe(ideas, 6) },
    { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } },
  )
}
