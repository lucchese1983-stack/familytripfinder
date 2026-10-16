import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { gateway, type LanguageModel, type ToolSet } from "ai"

// Tried in order. A model is skipped only when Google says it has no free quota ("limit: 0")
// or doesn't exist / can't search: those rejections cost nothing, so the next model gets a fair chance.
// "*-latest" aliases are last-resort fallbacks because Google retires pinned IDs for new keys.
const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest"] as const

export type AIConfig = {
  models: LanguageModel[]
  searchTools: (maxResults: number) => ToolSet
}

export function getAI(req: Request): AIConfig {
  const userKey = req.headers.get("x-ai-key")?.trim().slice(0, 200) || undefined
  const apiKey = userKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY

  if (apiKey) {
    const google = createGoogleGenerativeAI({ apiKey })
    return {
      models: GEMINI_MODELS.map((id) => google(id)),
      searchTools: () => ({ google_search: google.tools.googleSearch({}) }),
    }
  }

  return {
    models: [`google/${GEMINI_MODELS[0]}`],
    searchTools: (maxResults) => ({
      web_search: gateway.tools.perplexitySearch({
        maxResults,
        country: "IT",
        searchLanguageFilter: ["it"],
        searchRecencyFilter: "month",
      }),
    }),
  }
}

const errorText = (error: unknown) => {
  const e = error as { message?: string; responseBody?: string }
  return `${e?.message ?? String(error)} ${e?.responseBody ?? ""}`
}

const isModelUnavailable = (message: string) =>
  /not found|404|not supported|(?:not|no longer) available|unsupported|deprecated|retired|high demand|overloaded|503|UNAVAILABLE/i.test(message)

// Free AI Studio keys usually allow plain generation but have no quota for Google Search grounding.
const isSearchQuota = (message: string) => /quota|limit:\s*0\b|RESOURCE_EXHAUSTED|429/i.test(message)

export type SearchTools = AIConfig["searchTools"] | null

/**
 * Tries every model with web search; if Google refuses search for quota reasons,
 * retries every model without it so the caller can ground the answer on its own data.
 */
export async function runWithGemini<T>(
  config: AIConfig,
  run: (model: LanguageModel, searchTools: SearchTools) => Promise<T>,
): Promise<T> {
  let lastError: unknown
  for (const withSearch of [true, false]) {
    let searchBlocked = false
    for (const model of config.models) {
      try {
        return await run(model, withSearch ? config.searchTools : null)
      } catch (error) {
        lastError = error
        const message = errorText(error)
        console.error(
          "[ai] model failed:",
          typeof model === "string" ? model : model.modelId,
          withSearch ? "(search)" : "(no search)",
          message.slice(0, 200),
        )
        if (withSearch && isSearchQuota(message)) {
          searchBlocked = true
          break
        }
        if (!isModelUnavailable(message)) throw error
      }
    }
    if (withSearch && !searchBlocked) break
  }
  throw lastError
}
