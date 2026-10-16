const DEAD_STATUSES = new Set([404, 410])

async function isAlive(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false
  } catch {
    return false
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(2500),
      headers: { "user-agent": "Mozilla/5.0 (compatible; FamilyTripFinder/1.0)" },
    })
    res.body?.cancel()
    // Social networks often answer bots with 403/429 even for live pages, so only treat explicit "not found" as dead.
    return !DEAD_STATUSES.has(res.status) && res.status < 500
  } catch {
    return false
  }
}

export async function verifyLinks(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(async (url) => (url && (await isAlive(url)) ? url : "")))
}
