import { isYouTubeUrl } from "../content/index.js";
import type { ExtractedLinkContent } from "../content/index.js";
import { buildUrlPrompt } from "../engine/web-prompt.js";
import { resolveUrlSummaryExecution } from "../engine/web-summary.js";
import { runUrlFlow } from "../run/flows/url/flow.js";
import type { UrlFlowContext } from "../run/flows/url/types.js";
import {
  readLastSuccessfulCliProvider,
  writeLastSuccessfulCliProvider,
} from "./cli-fallback-state.js";
import type {
  ExtractionResult,
  SummarizeEvent,
  SummarizeEventSink,
  SummarizeRequest,
  SummarizeResult,
  SummarizeRuntime,
  SummaryResult,
} from "./summarize-contracts.js";
import { createSummarizeUrlFlowContext } from "./url-runtime.js";

const ignoreEvent: SummarizeEventSink = () => {};

function createVisiblePageContent(
  input: Extract<SummarizeRequest["input"], { kind: "visible-page" }>,
  cacheMode: SummarizeRuntime["cache"]["mode"],
): ExtractedLinkContent {
  let siteName: string | null = null;
  try {
    siteName = new URL(input.url).hostname || null;
  } catch {
    siteName = null;
  }

  return {
    url: input.url,
    title: input.title,
    description: null,
    siteName,
    content: input.text,
    truncated: input.truncated,
    totalCharacters: input.text.length,
    wordCount: input.text.trim() ? input.text.trim().split(/\s+/).length : 0,
    transcriptCharacters: null,
    transcriptLines: null,
    transcriptWordCount: null,
    transcriptSource: null,
    transcriptionProvider: null,
    transcriptMetadata: null,
    transcriptSegments: null,
    transcriptTimedText: null,
    mediaDurationSeconds: null,
    video: null,
    isVideoOnly: false,
    diagnostics: {
      strategy: "html",
      firecrawl: {
        attempted: false,
        used: false,
        cacheMode,
        cacheStatus: "unknown",
      },
      markdown: {
        requested: false,
        used: false,
        provider: null,
      },
      transcript: {
        cacheMode,
        cacheStatus: "unknown",
        textProvided: false,
        provider: null,
        attemptedProviders: [],
      },
    },
  };
}

async function executeVisiblePageSummary({
  ctx,
  input,
  cacheMode,
}: {
  ctx: UrlFlowContext;
  input: Extract<SummarizeRequest["input"], { kind: "visible-page" }>;
  cacheMode: SummarizeRuntime["cache"]["mode"];
}): Promise<ExtractedLinkContent> {
  const extracted = createVisiblePageContent(input, cacheMode);
  ctx.hooks.onExtracted?.(extracted);

  const prompt = buildUrlPrompt({
    extracted,
    outputLanguage: ctx.flags.outputLanguage,
    lengthArg: ctx.flags.lengthArg,
    promptOverride: ctx.flags.promptOverride ?? null,
    lengthInstruction: ctx.flags.lengthInstruction ?? null,
    languageInstruction: ctx.flags.languageInstruction ?? null,
  });

  const resolution = await resolveUrlSummaryExecution({
    ctx,
    url: input.url,
    extracted,
    prompt,
    onModelChosen: ctx.hooks.onModelChosen ?? null,
    runtime: {
      trace: (name, detail) => ctx.perfTrace?.mark(name, detail),
      onSummaryCached: ctx.hooks.onSummaryCached ?? null,
      readLastSuccessfulCliProvider: () => readLastSuccessfulCliProvider(ctx.io.envForRun),
      rememberCliProvider: (provider) =>
        writeLastSuccessfulCliProvider({ env: ctx.io.envForRun, provider }),
    },
  });
  if (resolution.kind === "use-extracted") {
    ctx.io.stdout.write(`${extracted.content}\n`);
  } else if (!resolution.summaryEmitted) {
    ctx.io.stdout.write(`${resolution.normalizedSummary}\n`);
  }
  return extracted;
}

export async function executeSummarize(
  request: SummarizeRequest,
  runtime: SummarizeRuntime,
  events: SummarizeEventSink = ignoreEvent,
): Promise<SummarizeResult> {
  const now = runtime.now ?? Date.now;
  const startedAt = now();
  let usedModel: string | null = null;
  let summaryFromCache = false;
  let extracted: ExtractedLinkContent | null = null;
  let slides: ExtractionResult["slides"] = null;

  const emit = (event: SummarizeEvent) => {
    if (event.type === "model-selected") {
      usedModel = event.modelId;
    } else if (event.type === "summary-cache") {
      summaryFromCache = event.cached;
    } else if (event.type === "content-extracted") {
      extracted = event.content;
    } else if (event.type === "slides-extracted") {
      slides = event.slides;
    }
    events(event);
    if (event.type === "content-extracted" && !request.extractOnly) {
      events({ type: "summary-started" });
    }
  };

  emit({ type: "run-started", runId: runtime.runId, input: request.input });

  try {
    if (request.extractOnly && request.input.kind !== "url") {
      throw new Error("Extract-only execution requires a URL input");
    }

    const ctx = createSummarizeUrlFlowContext({
      request,
      runtime,
      runStartedAtMs: startedAt,
      emit,
    });

    if (request.input.kind === "visible-page") {
      extracted = await executeVisiblePageSummary({
        ctx,
        input: request.input,
        cacheMode: runtime.cache.mode,
      });
    } else {
      emit({ type: "extraction-started", url: request.input.url });
      await runUrlFlow({
        ctx,
        url: request.input.url,
        isYoutubeUrl: isYouTubeUrl(request.input.url),
      });
    }

    if (!extracted) {
      throw new Error("Internal error: missing extracted content");
    }

    if (request.extractOnly) {
      const result: ExtractionResult = {
        kind: "extraction",
        input: request.input as Extract<SummarizeRequest["input"], { kind: "url" }>,
        extracted,
        slides,
      };
      emit({ type: "run-completed", result });
      return result;
    }

    const result: SummaryResult = {
      kind: "summary",
      input: request.input,
      usedModel: usedModel ?? ctx.model.requestedModelLabel,
      extracted,
      summaryFromCache,
      elapsedMs: now() - startedAt,
      report: await ctx.hooks.buildReport(),
      costUsd: await ctx.hooks.estimateCostUsd(),
    };
    emit({ type: "run-completed", result });
    return result;
  } catch (error) {
    emit({ type: "run-failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
