import type { NextRequest } from "next/server"
import { getZoneNews } from "@/lib/news"

export async function GET(req: NextRequest) {
  const zone = (req.nextUrl.searchParams.get("zone") ?? "").trim().slice(0, 60)
  if (!zone || /["<>]/.test(zone)) {
    return Response.json({ events: [], ideas: [], social: [] }, { status: 400 })
  }
  return Response.json(await getZoneNews(zone), {
    headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
  })
}
