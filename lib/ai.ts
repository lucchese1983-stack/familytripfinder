import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { gateway, type LanguageModel, type ToolSet } from "ai"

const MODEL_ID = "gemini-3.5-flash"
const KEY_HEADER = "x-gemini-key"

export function getAI(req: Request): { model: LanguageModel; searchTools: (maxResults: number) => ToolSet } {
  const apiKey = req.headers.get(KEY_HEADER)?.trim().slice(0, 200) || process.env.GOOGLE_GENERATIVE_AI_API_KEY

  if (apiKey) {
    const google = createGoogleGenerativeAI({ apiKey })
    return {
      model: google(MODEL_ID),
      searchTools: () => ({ google_search: google.tools.googleSearch({}) }),
    }
  }

  return {
    model: `google/${MODEL_ID}`,
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
