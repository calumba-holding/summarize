import { describe, expect, it } from "vitest";
import { toUrlSummaryPresentationResolution } from "../src/application/url-result.js";
import type { UrlSummaryResolution } from "../src/engine/web-summary.js";

describe("URL result normalization", () => {
  it("keeps presentation metadata without exposing model attempt credentials", () => {
    const resolution = {
      kind: "summary",
      normalizedSummary: "Summary",
      summaryEmitted: false,
      summaryFromCache: false,
      usedAttempt: {
        transport: "native",
        userModelId: "openai/gpt-5.4",
        llmModelId: "gpt-5.4",
        openrouterProviders: null,
        forceOpenRouter: false,
        requiredEnv: "OPENAI_API_KEY",
        openaiApiKeyOverride: "secret-key",
      },
      modelMeta: {
        provider: "openai",
        canonical: "openai/gpt-5.4",
      },
      maxOutputTokensForCall: 512,
    } satisfies UrlSummaryResolution;

    const normalized = toUrlSummaryPresentationResolution(resolution);

    expect(normalized).toMatchObject({
      kind: "summary",
      llm: {
        provider: "openai",
        model: "openai/gpt-5.4",
        canonical: "openai/gpt-5.4",
        maxCompletionTokens: 512,
      },
    });
    expect(JSON.stringify(normalized)).not.toContain("secret-key");
    expect(JSON.stringify(normalized)).not.toContain("openaiApiKeyOverride");
  });
});
