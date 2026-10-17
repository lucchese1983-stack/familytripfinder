import { getZoneNews } from "@/lib/news"

export const revalidate = 1800

const HOT_ZONES = [
  "Lago di Garda",
  "Toscana",
  "Puglia",
  "Lago di Como",
  "Sardegna",
  "Trentino",
  "Sicilia",
  "Liguria",
]

type ViralPlace = {
  id: string
  title: string
  zone: string
  description: string
  source: string
  sourceUrl: string
  publishedAt: string
}

function isFamilyViral(title: string) {
  const viral = /virale|virali|viral|instagram|tiktok|reel|influencer|creator|boom di visite|invasione|giro del web|tutti i turisti/i
  const family = /famigli|bimbi|bambin|figli|genitor|pap[àa]|mamm[àa]/i
  return viral.test(title) && family.test(title)
}

function toViralPlace(item: { title: string; source: string; link: string; publishedAt: string }, zone: string, i: number): ViralPlace {
  return {
    id: `viral_${zone.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${i}`,
    title: item.title,
    zone,
    description: `Storia virale segnalata da ${item.source}: apri l'articolo per il racconto completo e i consigli di chi ci è stato.`,
    source: item.source,
    sourceUrl: item.link,
    publishedAt: item.publishedAt,
  }
}

export async function GET() {
  const zones = await Promise.all(
    HOT_ZONES.map(async (zone) => {
      const news = await getZoneNews(zone).catch(() => ({ events: [], ideas: [], social: [] }))
      const items = [...news.social, ...news.ideas]
        .filter((n) => n.link.startsWith("https://") && isFamilyViral(n.title))
        .slice(0, 3)
        .map((n, i) => toViralPlace(n, zone, i))
      return items
    }),
  )

  const stories = zones.flat().slice(0, 12)
  return Response.json(
    { stories },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } },
  )
}
