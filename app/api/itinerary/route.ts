import { generateText, isStepCount } from "ai"
import { z } from "zod"
import { getAI, getProvider } from "@/lib/ai"
import { aiErrorResponse } from "@/lib/ai-error"

export const maxDuration = 90

const bodySchema = z.object({
  title: z.string().max(160),
  city: z.string().max(80),
  region: z.string().max(60),
  address: z.string().max(200).optional(),
  minAge: z.string().max(30).optional(),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return Response.json({ error: "Richiesta non valida" }, { status: 400 })
  }
  const place = parsed.data

  try {
    const { model, searchTools, searchToolChoice } = getAI(req)
    const { text } = await generateText({
      model,
      tools: searchTools(5),
      toolChoice: searchToolChoice,
      stopWhen: isStepCount(4),
      system:
        "Sei un organizzatore di gite per famiglie. Cerca sul web orari, prezzi e info aggiornate prima di rispondere. Scrivi in italiano, in testo semplice: titoli di sezione su righe proprie che iniziano con '## ', elenchi con '- '. Niente emoji, niente tabelle.",
      prompt: `Crea il programma dettagliato di una giornata per una famiglia con bambini (età: ${place.minAge || "varie"}) a "${place.title}", ${place.city} (${place.region})${place.address ? `, indirizzo ${place.address}` : ""}.
Sezioni: ## Mattina, ## Pranzo, ## Pomeriggio, ## Info pratiche (orari e prezzi aggiornati se trovati, parcheggio, accesso passeggino), ## Nello zaino.`,
    })
    return Response.json({ itinerary: text })
  } catch (error) {
    console.error("[itinerary]", error)
    return aiErrorResponse(error, "Impossibile generare il programma.", getProvider(req))
  }
}
