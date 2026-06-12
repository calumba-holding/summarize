import { execFile } from "node:child_process";
import type { SummarizeEvent } from "../../src/application/summarize-contracts.js";
import { createSummarizeUrlFlowContext } from "../../src/application/url-runtime.js";
import type { CacheState } from "../../src/cache.js";
import type { MediaCache } from "../../src/content/index.js";
import type { ExecFileFn } from "../../src/markitdown.js";
import type { UrlFlowEventHooks } from "../../src/run/flows/url/types.js";
import { createEmptyRunOverrides, type RunOverrides } from "../../src/run/run-settings.js";
import type { SlideSettings } from "../../src/slides/index.js";

export function createTestSummarizeUrlFlowContext(options: {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  urlFetchImpl?: typeof fetch | null;
  cache: CacheState;
  mediaCache?: MediaCache | null;
  modelOverride: string | null;
  promptOverride: string | null;
  lengthRaw: unknown;
  languageRaw: unknown;
  maxExtractCharacters: number | null;
  format?: "text" | "markdown";
  overrides?: RunOverrides | null;
  extractOnly?: boolean;
  slides?: SlideSettings | null;
  hooks?: Partial<UrlFlowEventHooks> | null;
  runStartedAtMs: number;
  stdoutSink: { writeChunk: (text: string) => void };
}) {
  const emit = (event: SummarizeEvent) => {
    if (event.type === "summary-delta") {
      options.stdoutSink.writeChunk(event.text);
    } else if (event.type === "model-selected") {
      options.hooks?.onModelChosen?.(event.modelId);
    } else if (event.type === "content-extracted") {
      options.hooks?.onExtracted?.(event.content);
    } else if (event.type === "slides-extracted") {
      options.hooks?.onSlidesExtracted?.(event.slides);
    } else if (event.type === "slides-progress") {
      options.hooks?.onSlidesProgress?.(event.text);
    } else if (event.type === "slides-completed") {
      options.hooks?.onSlidesDone?.({ ok: event.ok, error: event.error });
    } else if (event.type === "slide") {
      options.hooks?.onSlideChunk?.({ slide: event.slide, meta: event.meta });
    } else if (event.type === "extraction-progress") {
      options.hooks?.onLinkPreviewProgress?.(event.event);
    } else if (event.type === "summary-cache") {
      options.hooks?.onSummaryCached?.(event.cached);
    }
  };

  return createSummarizeUrlFlowContext({
    request: {
      input: {
        kind: "url",
        url: "https://example.com/",
        title: null,
        maxCharacters: options.maxExtractCharacters,
      },
      modelOverride: options.modelOverride,
      promptOverride: options.promptOverride,
      lengthRaw: options.lengthRaw,
      languageRaw: options.languageRaw,
      format: options.format ?? "text",
      overrides: options.overrides ?? createEmptyRunOverrides(),
      extractOnly: options.extractOnly ?? false,
      slides: options.slides ?? null,
    },
    runtime: {
      runId: "test-run",
      env: options.env,
      fetch: options.fetchImpl,
      urlFetch: options.urlFetchImpl,
      execFile: execFile as unknown as ExecFileFn,
      cache: options.cache,
      mediaCache: options.mediaCache ?? null,
    },
    runStartedAtMs: options.runStartedAtMs,
    emit,
  });
}
