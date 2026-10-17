export type NewsItem = { title: string; source: string; link: string; publishedAt: string }

// Esclude cronaca nera, gossip e intrattenimento: con i nomi dei piccoli comuni
// Google News restituisce articoli di cronaca che contengono solo il nome del posto.
const EXCLUDE_TERMS = [
  "arrestato",
  "droga",
  "cocaina",
  "incidente",
  "omicidio",
  "truffa",
  "furto",
  "rapina",
  "processo",
  "indagato",
  "condannato",
  "carcere",
  "maltrattamento",
  "aggressione",
  "film",
  "trailer",
  "attore",
  "attrice",
  "fiction",
  "gossip",
  "grande fratello",
  "uomini e donne",
]
const EXCLUDE = EXCLUDE_TERMS.map((t) => `-"${t}"`).join(" ")

const BLOCKED_TITLE =
  /arrestat|droga|cocain|incident|omicidi|truffa|furt|rapin|processo|indagat|condannat|carcere|maltratt|aggress|suicidi|\bfilm\b|trailer|attore|attrice|\bfiction\b|gossip|grande fratello|uomini e donne|clip del film/i

export const isSafeFamilyTitle = (title: string) => !BLOCKED_TITLE.test(title)

export const NEWS_QUERIES = {
  events: (zone: string) => `(sagra OR festa OR fiera OR mercatino) "${zone}" (famiglia OR bambini) ${EXCLUDE} when:21d`,
  ideas: (zone: string) => `(gita OR "cosa fare" OR weekend) bambini famiglia "${zone}" ${EXCLUDE} when:60d`,
  social: (zone: string) =>
    `(virale OR virali OR instagram OR tiktok OR reel OR influencer OR creator) (luogo OR borgo OR spiaggia OR parco OR gita) (famiglia OR bambini OR "con i bambini") "${zone}" ${EXCLUDE} when:30d`,
  influencers: (zone: string) =>
    `(influencer OR creator OR "famiglia in viaggio" OR "viaggiare con i bambini" OR "family travel" OR "viaggi in famiglia") "${zone}" ${EXCLUDE} when:90d`,
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()

const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "")

export async function searchNews(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=it&gl=IT&ceid=IT:it`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 FamilyTrip/1.0" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const xml = await res.text()
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const source = tag(item, "source")
    const rawTitle = tag(item, "title")
    return {
      title: source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle,
      source,
      link: tag(item, "link"),
      publishedAt: new Date(tag(item, "pubDate")).toISOString(),
    }
  })
}

export function dedupeNews(items: NewsItem[], limit: number) {
  const seen = new Set<string>()
  return items
    .filter((i) => i.title && i.link.startsWith("https://") && isSafeFamilyTitle(i.title))
    .filter((i) => {
      const key = i.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50)
      return !seen.has(key) && seen.add(key)
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit)
}

export async function getZoneNews(zone: string) {
  const [events, ideas, social, influencers] = await Promise.all([
    searchNews(NEWS_QUERIES.events(zone)).catch(() => []),
    searchNews(NEWS_QUERIES.ideas(zone)).catch(() => []),
    searchNews(NEWS_QUERIES.social(zone)).catch(() => []),
    searchNews(NEWS_QUERIES.influencers(zone)).catch(() => []),
  ])
  return {
    events: dedupeNews(events, 8),
    ideas: dedupeNews(ideas, 6),
    social: dedupeNews(social, 12),
    influencers: dedupeNews(influencers, 6),
  }
}

export const EMPTY_ZONE_NEWS = { events: [], ideas: [], social: [], influencers: [] } as const
