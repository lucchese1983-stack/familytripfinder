import { generateText } from "ai"
import { z } from "zod"
import { getAI, runWithGemini } from "@/lib/ai"
import { aiErrorResponse } from "@/lib/ai-error"
import { verifyLinks } from "@/lib/verify-links"
import { getZoneNews } from "@/lib/news"

export const maxDuration = 60

const CATEGORIES = [
  "Sagre & Feste",
  "Parchi & Natura",
  "Treni & Tour",
  "Family Hotel",
  "Social Trends (Reel Virali)",
] as const

const text = (fallback = "") => z.coerce.string().catch(fallback)
const bool = z.coerce.boolean().catch(false)

const placeSchema = z.object({
  title: z.coerce.string().min(2),
  category: z.enum(CATEGORIES).catch("Parchi & Natura"),
  city: text(),
  season: z.enum(["Primavera", "Estate", "Autunno", "Inverno", "Tutte"]).catch("Tutte"),
  minAge: z.enum(["0-3 Baby", "4-8 Kids", "9+ Teens", "Tutte le età"]).catch("Tutte le età"),
  stroller: bool,
  picnic: bool,
  dogs: bool,
  rating: z.coerce.number().catch(4.5),
  dateInfo: text("Sempre aperto"),
  description: text(),
  parentTip: text(),
  address: text(),
  sourceUrl: text(),
  socialInsta: text(),
  socialFb: text(),
})

const creatorSchema = z.object({
  name: z.coerce.string(),
  platform: z.enum(["Instagram", "Facebook", "TikTok"]).catch("Instagram"),
  url: z.coerce.string(),
  focus: text(),
})

const bodySchema = z.object({
  region: z.string().max(60).default("Tutte"),
  city: z.string().max(80).default("Tutte"),
})

function parseScan(raw: string) {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  let json: { places?: unknown[]; creators?: unknown[] }
  try {
    json = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  const pick = <T,>(items: unknown, schema: z.ZodType<T>) =>
    (Array.isArray(items) ? items : []).flatMap((item) => {
      const r = schema.safeParse(item)
      return r.success ? [r.data] : []
    })
  return { places: pick(json.places, placeSchema).slice(0, 8), creators: pick(json.creators, creatorSchema).slice(0, 4) }
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return Response.json({ error: "Richiesta non valida" }, { status: 400 })
  }

  const region = parsed.data.region === "Tutte" ? "Italia" : parsed.data.region
  const city = parsed.data.city === "Tutte" ? "" : parsed.data.city
  const zone = city ? `${city} (${region})` : region
  const today = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
  const grounding: { newsLinks: Set<string> | null } = { newsLinks: null }

  // Fetched up front (cached 30 min) so the no-search fallback doesn't add latency after a refused search call.
  const newsPromise = getZoneNews(city || region).catch(() => ({ events: [], ideas: [], social: [] }))

  try {
    const result = await runWithGemini(getAI(req), async (model, searchTools) => {
      const news = searchTools ? null : await newsPromise
      grounding.newsLinks = news
        ? new Set([...news.events, ...news.ideas, ...news.social].map((n) => n.link))
        : null
      const headlines = news
        ? [...news.events, ...news.ideas].map((n) => `- ${n.title} | ${n.source} | ${n.link}`).join("\n")
        : ""
      const viral = news
        ? news.social.map((n) => `- ${n.title} | ${n.source} | ${n.link}`).join("\n")
        : ""
      return generateText({
        model,
        tools: searchTools ? searchTools(5) : undefined,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(45_000),
        system: searchTools
          ? "Sei un redattore di gite ed eventi per famiglie con bambini in Italia. Usa la ricerca web, riporta solo informazioni verificate e non inventare mai link. Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo e senza blocchi di codice."
          : "Sei un redattore di gite ed eventi per famiglie con bambini in Italia. Non hai accesso al web: per eventi e sagre usa SOLO le notizie fornite, copiando il link esatto in sourceUrl. Per i luoghi virali usa SOLO i contenuti virali forniti, copiando il link esatto in sourceUrl. Per parchi e luoghi usa solo posti reali e famosi che conosci con certezza, con sourceUrl vuoto. Non inventare mai link, date o eventi. Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo e senza blocchi di codice.",
        prompt: `Oggi è il ${today}. Zona: ${zone}.
${
  searchTools
    ? `Con una sola ricerca web trova da 5 a 8 mete per famiglie: eventi e sagre dei prossimi 30 giorni, parchi e natura, trenini o tour, e almeno 2 luoghi virali sui Reel (categoria "Social Trends (Reel Virali)") — per i virali cerca anche "instagram" o "tiktok" nel nome della zona per trovare luoghi virali condivisi dai creator. Trova anche 2-4 creator o pagine social che pubblicano gite per famiglie in ${zone}.`
    : `Notizie recenti dalla zona (titolo | fonte | link):
${headlines || "(nessuna notizia trovata)"}

Contenuti virali sulla zona (titolo | fonte | link):
${viral || "(nessun contenuto virale trovato)"}

Scegli da 5 a 8 mete per famiglie: prima gli eventi e le sagre presenti nelle notizie (adatti ai bambini, con le date ricavate dal titolo), poi i luoghi virali presenti nei contenuti virali (categoria "Social Trends (Reel Virali)", con sourceUrl copiato dal link fornito), poi completa con parchi, natura e trenini reali della zona. Lascia "creators" come lista vuota.`
}

Formato JSON:
{"places":[{"title":"","category":"${CATEGORIES.join(" | ")}","city":"","season":"Primavera | Estate | Autunno | Inverno | Tutte","minAge":"0-3 Baby | 4-8 Kids | 9+ Teens | Tutte le età","stroller":true,"picnic":true,"dogs":false,"rating":4.6,"dateInfo":"date o 'Sempre aperto'","description":"","parentTip":"","address":"","sourceUrl":"URL reale della fonte","socialInsta":"URL Instagram ufficiale o vuoto","socialFb":"URL Facebook ufficiale o vuoto"}],
"creators":[{"name":"","platform":"Instagram | Facebook | TikTok","url":"","focus":""}]}`,
      })
    })

    const scan = parseScan(result.text)
    if (!scan || scan.places.length === 0) {
      return Response.json({ error: "La ricerca non ha restituito mete leggibili. Riprova più tardi." }, { status: 502 })
    }

    const [places, creators] = await Promise.all([
      Promise.all(
        scan.places.map(async (p, i) => {
          const { newsLinks } = grounding
          const candidates = newsLinks
            ? [newsLinks.has(p.sourceUrl) ? p.sourceUrl : "", "", ""]
            : [p.sourceUrl, p.socialInsta, p.socialFb]
          const [sourceUrl, socialInsta, socialFb] = await verifyLinks(candidates)
          return {
            ...p,
            id: `live_${Date.now()}_${i}`,
            region: parsed.data.region === "Tutte" ? region : parsed.data.region,
            rating: Math.min(5, Math.max(3.5, Math.round(p.rating * 10) / 10)),
            sourceUrl,
            socialInsta,
            socialFb,
            live: true,
          }
        }),
      ),
      verifyLinks(scan.creators.map((c) => c.url)).then((urls) =>
        scan.creators.map((c, i) => ({ ...c, url: urls[i] })).filter((c) => c.url),
      ),
    ])

    return Response.json({
      places,
      creators: grounding.newsLinks ? [] : creators,
      zone,
      mode: grounding.newsLinks ? "news" : "search",
      scannedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[live-scan]", error)
    return aiErrorResponse(error, "Scansione web non riuscita. Riprova tra poco.")
  }
}
