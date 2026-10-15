import { gateway, generateText, isStepCount, Output } from "ai"
import { z } from "zod"
import { aiErrorResponse } from "@/lib/ai-error"
import { verifyLinks } from "@/lib/verify-links"

export const maxDuration = 120

const CATEGORIES = [
  "Sagre & Feste",
  "Parchi & Natura",
  "Treni & Tour",
  "Family Hotel",
  "Social Trends (Reel Virali)",
] as const

const placeSchema = z.object({
  title: z.string(),
  category: z.enum(CATEGORIES),
  city: z.string(),
  season: z.enum(["Primavera", "Estate", "Autunno", "Inverno", "Tutte"]),
  minAge: z.enum(["0-3 Baby", "4-8 Kids", "9+ Teens", "Tutte le età"]),
  stroller: z.boolean(),
  picnic: z.boolean(),
  dogs: z.boolean(),
  rating: z.number(),
  dateInfo: z.string().describe("Date o periodo dell'evento, oppure 'Sempre aperto'"),
  description: z.string(),
  parentTip: z.string(),
  address: z.string(),
  sourceUrl: z.string().describe("URL della pagina web trovata nella ricerca che conferma l'informazione"),
  socialInsta: z.string().describe("URL del profilo Instagram ufficiale (o del creator più attivo) trovato nella ricerca, altrimenti stringa vuota"),
  socialFb: z.string().describe("URL della pagina Facebook ufficiale trovata nella ricerca, altrimenti stringa vuota"),
})

const scanSchema = z.object({
  places: z.array(placeSchema),
  creators: z
    .array(
      z.object({
        name: z.string(),
        platform: z.enum(["Instagram", "Facebook", "TikTok"]),
        url: z.string(),
        focus: z.string().describe("Di cosa parlano i suoi Reel, in breve"),
      }),
    )
    .describe("Creator e canali social attivi su gite per famiglie nella zona"),
})

const bodySchema = z.object({
  region: z.string().max(60).default("Tutte"),
  city: z.string().max(80).default("Tutte"),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return Response.json({ error: "Richiesta non valida" }, { status: 400 })
  }

  const region = parsed.data.region === "Tutte" ? "Italia" : parsed.data.region
  const city = parsed.data.city === "Tutte" ? "" : parsed.data.city
  const zone = city ? `${city} (${region})` : region
  const today = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })

  try {
    const { output } = await generateText({
      model: "google/gemini-3.5-flash",
      tools: {
        web_search: gateway.tools.perplexitySearch({
          maxResults: 8,
          country: "IT",
          searchLanguageFilter: ["it"],
          searchRecencyFilter: "month",
        }),
      },
      stopWhen: isStepCount(6),
      output: Output.object({ schema: scanSchema }),
      system:
        "Sei un redattore esperto di gite ed eventi per famiglie con bambini in Italia. Usa SEMPRE lo strumento web_search prima di rispondere. Riporta solo informazioni verificate nei risultati di ricerca, con URL reali presi dai risultati. Non inventare mai link: se non hai un URL verificato lascia la stringa vuota. Scrivi in italiano.",
      prompt: `Oggi è il ${today}. Zona: ${zone}.
Fai più ricerche web e trova:
1. Eventi, sagre e feste per famiglie dei prossimi 30 giorni nella zona (con date).
2. Parchi, attività natura, trenini o tour adatti ai bambini aperti in questo periodo.
3. Luoghi per famiglie virali sui Reel di Instagram / video Facebook / TikTok nella zona, con il profilo ufficiale o il creator più attivo che ne parla.
4. Da 3 a 5 creator o pagine social attivi che pubblicano Reel su gite per famiglie in ${zone}.
Restituisci da 6 a 10 mete in "places" (almeno 2 nella categoria "Social Trends (Reel Virali)").`,
    })

    const [places, creators] = await Promise.all([
      Promise.all(
        output.places.map(async (p, i) => {
          const [sourceUrl, socialInsta, socialFb] = await verifyLinks([p.sourceUrl, p.socialInsta, p.socialFb])
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
      verifyLinks(output.creators.map((c) => c.url)).then((urls) =>
        output.creators.map((c, i) => ({ ...c, url: urls[i] })).filter((c) => c.url),
      ),
    ])

    return Response.json({ places, creators, zone, scannedAt: new Date().toISOString() })
  } catch (error) {
    console.error("[live-scan]", error)
    return aiErrorResponse(error, "Scansione web non riuscita. Riprova tra poco.")
  }
}
