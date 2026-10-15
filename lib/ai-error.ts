import type { AIProvider } from "@/lib/ai"

const LABEL: Record<AIProvider, string> = { gemini: "Gemini", groq: "Groq" }

export function aiErrorResponse(error: unknown, fallback: string, provider: AIProvider = "gemini") {
  const message = error instanceof Error ? error.message : String(error)
  const name = LABEL[provider]
  if (/credit card|key missing/i.test(message)) {
    return Response.json(
      {
        error: `Serve la tua chiave ${name}: inseriscila nel pannello Live (è gratuita).`,
        code: "ai_key_missing",
      },
      { status: 402 },
    )
  }
  if (/api key not valid|invalid api key|API_KEY_INVALID|permission denied|401/i.test(message)) {
    return Response.json(
      { error: `La chiave ${name} non è valida: inseriscine una nuova nel pannello Live.`, code: "ai_key_invalid" },
      { status: 401 },
    )
  }
  if (/quota|resource has been exhausted|rate limit|429/i.test(message)) {
    const other = provider === "gemini" ? "Groq" : "Gemini"
    return Response.json(
      {
        error: `Quota gratuita ${name} esaurita per ora. Riprova tra qualche minuto o passa a ${other} nel pannello Live.`,
        code: "ai_quota",
      },
      { status: 429 },
    )
  }
  return Response.json({ error: fallback }, { status: 502 })
}
