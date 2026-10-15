export function aiErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error)
  if (/credit card/i.test(message)) {
    return Response.json(
      { error: "AI Gateway non attivo: aggiungi una carta nelle impostazioni AI del tuo team Vercel per sbloccare i crediti gratuiti.", code: "gateway_billing" },
      { status: 402 },
    )
  }
  return Response.json({ error: fallback }, { status: 502 })
}
