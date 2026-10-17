import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const ONE_YEAR = 31536000

export async function GET() {
  const html = await readFile(path.join(process.cwd(), 'public', 'familytrip.html'), 'utf8')
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // The HTML shell is small; keep it fresh. Static assets (images/JS) carry
      // their own long cache via next.config headers.
      'Cache-Control': 'no-store',
    },
  })
}
