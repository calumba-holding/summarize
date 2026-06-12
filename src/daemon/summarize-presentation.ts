import type { SummaryResult } from "../application/summarize-contracts.js";
import { isYouTubeUrl } from "../content/index.js";
import type { ExtractedLinkContent } from "../content/index.js";
import type { RunMetricsReport } from "../costs.js";
import { buildFinishLineVariants, buildLengthPartsForFinishLine } from "../run/finish-line.js";
import { estimateDurationSecondsFromWords, formatInputSummary } from "./meta.js";

export type VisiblePageMetrics = {
  elapsedMs: number;
  summary: string;
  details: string | null;
  summaryDetailed: string;
  detailsDetailed: string | null;
};

function guessSiteName(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    return hostname || null;
  } catch {
    return null;
  }
}

export function buildInputSummaryForExtracted(extracted: ExtractedLinkContent): string | null {
  const isYouTube = extracted.siteName === "YouTube" || isYouTubeUrl(extracted.url);
  const transcriptChars =
    typeof extracted.transcriptCharacters === "number" && extracted.transcriptCharacters > 0
      ? extracted.transcriptCharacters
      : null;
  const hasTranscript = transcriptChars != null;
  const transcriptWords =
    hasTranscript && transcriptChars != null
      ? (extracted.transcriptWordCount ?? Math.max(0, Math.round(transcriptChars / 6)))
      : null;
  const exactDurationSeconds =
    typeof extracted.mediaDurationSeconds === "number" && extracted.mediaDurationSeconds > 0
      ? extracted.mediaDurationSeconds
      : null;
  const estimatedDurationSeconds =
    transcriptWords != null && transcriptWords > 0
      ? estimateDurationSecondsFromWords(transcriptWords)
      : null;
  const durationSeconds = hasTranscript ? (exactDurationSeconds ?? estimatedDurationSeconds) : null;
  const isDurationApproximate =
    hasTranscript && durationSeconds != null && exactDurationSeconds == null;
  const kindLabel = (() => {
    if (isYouTube) return "YouTube";
    if (!hasTranscript) return null;
    if (extracted.isVideoOnly || extracted.video) return "video";
    return "podcast";
  })();

  return formatInputSummary({
    kindLabel,
    durationSeconds,
    words: hasTranscript ? transcriptWords : extracted.wordCount,
    characters: hasTranscript ? transcriptChars : extracted.totalCharacters,
    isDurationApproximate,
  });
}

export function buildDaemonSummaryMetrics(result: SummaryResult): VisiblePageMetrics {
  const label = result.extracted.siteName ?? guessSiteName(result.extracted.url);
  const includeLengthParts = result.input.kind === "url";
  const compactExtraParts = includeLengthParts
    ? buildLengthPartsForFinishLine(result.extracted, false)
    : null;
  const detailedExtraParts = includeLengthParts
    ? buildLengthPartsForFinishLine(result.extracted, true)
    : null;
  const { compact, detailed } = buildFinishLineVariants({
    elapsedMs: result.elapsedMs,
    elapsedLabel: result.summaryFromCache ? "Cached" : null,
    label,
    model: result.usedModel,
    report: result.report satisfies RunMetricsReport,
    costUsd: result.costUsd,
    compactExtraParts,
    detailedExtraParts,
  });

  return {
    elapsedMs: result.elapsedMs,
    summary: compact.line,
    details: compact.details,
    summaryDetailed: detailed.line,
    detailsDetailed: detailed.details,
  };
}
