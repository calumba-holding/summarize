import type { SummarizeResult } from "../application/summarize-contracts.js";
import { deriveExtractionUi } from "./flows/url/extract.js";
import type { SlidesTerminalOutput } from "./flows/url/slides-output.js";
import { outputExtractedUrl, presentExtractedUrlSummary } from "./flows/url/summary.js";
import type { UrlFlowContext } from "./flows/url/types.js";
import { estimateWhisperTranscriptionCostUsd, formatUSD } from "./format.js";

function buildTranscriptionCostLabel(ctx: UrlFlowContext, result: SummarizeResult): string | null {
  const costUsd = estimateWhisperTranscriptionCostUsd({
    transcriptionProvider: result.extracted.transcriptionProvider,
    transcriptSource: result.extracted.transcriptSource,
    mediaDurationSeconds: result.extracted.mediaDurationSeconds,
    openaiWhisperUsdPerMinute: ctx.model.openaiWhisperUsdPerMinute,
  });
  return typeof costUsd === "number" ? `txcost=${formatUSD(costUsd)}` : null;
}

export async function presentCliSummarizeResult(options: {
  ctx: UrlFlowContext;
  result: SummarizeResult;
  slidesOutput?: SlidesTerminalOutput | null;
}): Promise<void> {
  const { ctx, result, slidesOutput = null } = options;
  if (result.details.kind === "delegated-asset") return;
  if (result.input.kind !== "url") {
    throw new Error("CLI URL presentation requires a URL result");
  }

  const extractionUi = deriveExtractionUi(result.extracted);
  const transcriptionCostLabel = buildTranscriptionCostLabel(ctx, result);
  if (result.kind === "extraction") {
    await outputExtractedUrl({
      ctx,
      url: result.input.url,
      extracted: result.extracted,
      extractionUi,
      prompt: result.details.prompt,
      effectiveMarkdownMode: result.details.effectiveMarkdownMode,
      transcriptionCostLabel,
      slides: result.slides,
      slidesOutput,
    });
    return;
  }
  if (result.details.kind !== "url-summary") {
    throw new Error("CLI URL presentation requires URL summary details");
  }
  await presentExtractedUrlSummary({
    ctx,
    url: result.input.url,
    extracted: result.extracted,
    extractionUi,
    prompt: result.details.prompt,
    effectiveMarkdownMode: result.details.effectiveMarkdownMode,
    transcriptionCostLabel,
    resolution: result.details.resolution,
    slides: result.slides,
    slidesOutput,
  });
}
