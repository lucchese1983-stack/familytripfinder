import { google } from "@ai-sdk/google"
import { gateway, type LanguageModel, type ToolSet } from "ai"

const MODEL_ID = "gemini-3.5-flash"

export const usesDirectGemini = () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)

export function getModel(): LanguageModel {
  return usesDirectGemini() ? google(MODEL_ID) : `google/${MODEL_ID}`
}

export function getSearchTools(maxResults: number): ToolSet {
  if (usesDirectGemini()) {
    return { google_search: google.tools.googleSearch({}) }
  }
  return {
    web_search: gateway.tools.perplexitySearch({
      maxResults,
      country: "IT",
      searchLanguageFilter: ["it"],
      searchRecencyFilter: "month",
    }),
  }
}
