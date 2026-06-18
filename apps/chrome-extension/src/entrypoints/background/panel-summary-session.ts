import type { RunStart } from "../../lib/panel-contracts";

type DaemonRecoveryLike = {
  recordFailure: (url: string) => void;
};

type DaemonStatusLike = {
  markReady: () => void;
};

export type SummaryRequestDescriptor = {
  url: string;
  inputMode: "page" | "video" | null;
  slides: boolean;
};

export type BackgroundSummarizeSession = {
  windowId: number;
  runController: AbortController | null;
  inflightUrl: string | null;
  lastSummarizedUrl: string | null;
  inflightRequest: SummaryRequestDescriptor | null;
  activeSummaryRun: {
    run: RunStart;
    startedAt: number;
    inputMode: "page" | "video" | null;
    slides: boolean;
  } | null;
  daemonRecovery: DaemonRecoveryLike;
  daemonStatus: DaemonStatusLike;
};

export function shouldSkipSummaryRequest({
  session,
  request,
  refresh,
  reason,
  standaloneExtraction,
  autoSummarize,
  manual,
  urlsMatch,
  now = Date.now(),
}: {
  session: BackgroundSummarizeSession;
  request: SummaryRequestDescriptor;
  refresh: boolean;
  reason: string;
  standaloneExtraction: boolean;
  autoSummarize: boolean;
  manual: boolean;
  urlsMatch: (left: string, right: string) => boolean;
  now?: number;
}): boolean {
  const canCoalesce =
    !refresh && reason !== "length-change" && !(standaloneExtraction && reason === "manual");
  if (!canCoalesce) return false;

  const matches = (candidate: SummaryRequestDescriptor) =>
    urlsMatch(candidate.url, request.url) &&
    candidate.inputMode === request.inputMode &&
    candidate.slides === request.slides;
  const activeRun = session.activeSummaryRun;
  if (
    activeRun &&
    now - activeRun.startedAt < 15_000 &&
    matches({
      url: activeRun.run.url,
      inputMode: activeRun.inputMode,
      slides: activeRun.slides,
    })
  ) {
    return true;
  }
  if (session.inflightRequest && matches(session.inflightRequest)) return true;
  return Boolean(
    autoSummarize &&
    !manual &&
    session.lastSummarizedUrl &&
    urlsMatch(session.lastSummarizedUrl, request.url),
  );
}

export function beginSummaryRequest(
  session: BackgroundSummarizeSession,
  request: SummaryRequestDescriptor,
) {
  session.runController?.abort();
  const controller = new AbortController();
  session.runController = controller;
  session.inflightUrl = request.url;
  session.inflightRequest = request;

  return {
    controller,
    isSuperseded: () => controller.signal.aborted || session.runController !== controller,
    clear: () => {
      if (session.runController !== controller) return;
      session.runController = null;
      session.inflightUrl = null;
      session.inflightRequest = null;
    },
  };
}

export function recordActiveSummaryRun({
  session,
  run,
  request,
}: {
  session: BackgroundSummarizeSession;
  run: RunStart;
  request: SummaryRequestDescriptor;
}) {
  session.activeSummaryRun = {
    run,
    startedAt: Date.now(),
    inputMode: request.inputMode,
    slides: request.slides,
  };
  session.inflightRequest = null;
  session.lastSummarizedUrl = run.url;
}

export function createSummaryRunId(prefix: "browser" | "direct"): string {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-summary-${unique}`;
}
