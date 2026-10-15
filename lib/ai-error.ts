export function aiErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error)
  if (/credit card/i.test(message)) {
    return Response.json(
      {
        error:
          "Serve la tua chiave Gemini: inseriscila nel pannello Live (gratis da aistudio.google.com).",
        code: "gemini_key_missing",
      },
      { status: 402 },
    )
  }
  if (/api key not valid|API_KEY_INVALID|permission denied/i.test(message)) {
    return Response.json(
      { error: "La chiave Gemini non è valida: inseriscine una nuova nel pannello Live.", code: "gemini_key_invalid" },
      { status: 401 },
    )
  }
  if (/quota|resource has been exhausted|429/i.test(message)) {
    return Response.json(
      { error: "Quota Gemini esaurita per ora. Riprova tra qualche minuto.", code: "gemini_quota" },
      { status: 429 },
    )
  }
  return Response.json({ error: fallback }, { status: 502 })
}
