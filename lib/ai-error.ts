function googleMessage(error: unknown): string {
  const e = error as { message?: string; responseBody?: string; lastError?: unknown }
  const body = e?.responseBody
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } }
      if (parsed.error?.message) return parsed.error.message
    } catch {}
  }
  if (e?.lastError) return googleMessage(e.lastError)
  return e?.message ?? String(error)
}

export function aiErrorResponse(error: unknown, fallback: string) {
  const message = googleMessage(error)
  const detail = message.replace(/\s+/g, " ").slice(0, 220)

  if (/credit card|key missing/i.test(message)) {
    return Response.json(
      { error: "Serve la tua chiave Google Gemini: inseriscila nel pannello Live (è gratuita).", code: "ai_key_missing" },
      { status: 402 },
    )
  }
  if (/api key not valid|invalid api key|API_KEY_INVALID|api key expired|permission denied|401|403/i.test(message)) {
    return Response.json(
      { error: "Google ha rifiutato la chiave: creane una nuova su aistudio.google.com.", code: "ai_key_invalid", detail },
      { status: 401 },
    )
  }
  if (/limit:\s*0\b/i.test(message)) {
    return Response.json(
      {
        error: "Questa chiave non ha quota gratuita per la ricerca Google: crea la chiave da aistudio.google.com (non da Google Cloud) o abilita la fatturazione.",
        code: "ai_no_free_tier",
        detail,
      },
      { status: 429 },
    )
  }
  if (/per minute|PerMinute|rate limit/i.test(message)) {
    return Response.json(
      { error: "Troppe richieste ravvicinate a Google: aspetta un minuto e riprova.", code: "ai_rate_limit", detail },
      { status: 429 },
    )
  }
  if (/quota|resource has been exhausted|429/i.test(message)) {
    return Response.json(
      { error: "Quota giornaliera Google esaurita: si azzera domani mattina.", code: "ai_quota", detail },
      { status: 429 },
    )
  }
  return Response.json({ error: fallback, detail }, { status: 502 })
}
