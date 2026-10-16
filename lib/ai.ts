import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { gateway, type LanguageModel, type ToolSet } from "ai"

// Tried in order. A model is skipped only when Google says it has no free quota ("limit: 0")
// or doesn't exist / can't search: those rejections cost nothing, so the next model gets a fair chance.
const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.5-flash-lite"] as const

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

function isSkippable(message: string) {
  return /limit:\s*0\b|not found|404|not supported|is not available|unsupported/i.test(message)
}

export async function runWithGemini<T>(
  config: AIConfig,
  run: (model: LanguageModel, searchTools: AIConfig["searchTools"]) => Promise<T>,
): Promise<T> {
  let lastError: unknown
  for (const model of config.models) {
    try {
      return await run(model, config.searchTools)
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      console.error("[ai] model failed:", typeof model === "string" ? model : model.modelId, message.slice(0, 300))
      if (!isSkippable(message)) throw error
    }
  }
  throw lastError
}
