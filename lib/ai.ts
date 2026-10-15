import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { gateway, type LanguageModel, type ToolChoice, type ToolSet } from "ai"

const GEMINI_MODEL = "gemini-3.5-flash"
const GROQ_MODEL = "openai/gpt-oss-120b"

export type AIProvider = "gemini" | "groq"

export type AIConfig = {
  provider: AIProvider
  model: LanguageModel
  searchTools: (maxResults: number) => ToolSet
  searchToolChoice?: ToolChoice<ToolSet>
}

function readKey(req: Request, header: string) {
  return req.headers.get(header)?.trim().slice(0, 200) || undefined
}

export function getAI(req: Request): AIConfig {
  const requested = req.headers.get("x-ai-provider") === "groq" ? "groq" : "gemini"
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
      model: google(GEMINI_MODEL),
      searchTools: () => ({ google_search: google.tools.googleSearch({}) }),
    }
  }

  return {
    provider: "gemini",
    model: `google/${GEMINI_MODEL}`,
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

export function getProvider(req: Request): AIProvider {
  return req.headers.get("x-ai-provider") === "groq" ? "groq" : "gemini"
}
