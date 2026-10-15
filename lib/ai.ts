import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { gateway, type LanguageModel, type ToolChoice, type ToolSet } from "ai"

// Flash-Lite has the most generous free-tier daily limits; Flash is the fallback if Lite is unavailable.
const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash"] as const
const GROQ_MODEL = "openai/gpt-oss-120b"

export type AIProvider = "gemini" | "groq"

export type AIConfig = {
  provider: AIProvider
  model: LanguageModel
  fallbackModel?: LanguageModel
  searchTools: (maxResults: number) => ToolSet
  searchToolChoice?: ToolChoice<ToolSet>
}

function readKey(req: Request, header: string) {
  return req.headers.get(header)?.trim().slice(0, 200) || undefined
}

export function getAI(req: Request): AIConfig {
  const requested = getProvider(req)
  const userKey = readKey(req, "x-ai-key") ?? readKey(req, "x-gemini-key")

  if (requested === "groq") {
    const apiKey = userKey || process.env.GROQ_API_KEY
    if (!apiKey) throw new Error("groq key missing")
    const groq = createGroq({ apiKey })
    return {
      provider: "groq",
      model: groq(GROQ_MODEL),
      searchTools: () => ({ browser_search: groq.tools.browserSearch({}) }),
      searchToolChoice: "required",
    }
  }

  const apiKey = userKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (apiKey) {
    const google = createGoogleGenerativeAI({ apiKey })
    return {
      provider: "gemini",
      model: google(GEMINI_MODELS[0]),
      fallbackModel: google(GEMINI_MODELS[1]),
      searchTools: () => ({ google_search: google.tools.googleSearch({}) }),
    }
  }

  return {
    provider: "gemini",
    model: `google/${GEMINI_MODELS[0]}`,
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

// Retries once on the fallback model only when the primary model doesn't exist (404), which costs no quota.
export async function withModelFallback<T>(config: AIConfig, run: (c: AIConfig) => Promise<T>): Promise<T> {
  try {
    return await run(config)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (config.fallbackModel && /not found|404|not supported/i.test(message)) {
      return run({ ...config, model: config.fallbackModel, fallbackModel: undefined })
    }
    throw error
  }
}

export function getProvider(req: Request): AIProvider {
  return req.headers.get("x-ai-provider") === "groq" ? "groq" : "gemini"
}
