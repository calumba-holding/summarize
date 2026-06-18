import { describe, expect, it, vi } from "vitest";
import {
  beginSummaryRequest,
  recordActiveSummaryRun,
  shouldSkipSummaryRequest,
  type BackgroundSummarizeSession,
} from "../apps/chrome-extension/src/entrypoints/background/panel-summary-session";

function createSession(): BackgroundSummarizeSession {
  return {
    windowId: 1,
    runController: null,
    inflightUrl: null,
    lastSummarizedUrl: null,
    inflightRequest: null,
    activeSummaryRun: null,
    daemonRecovery: { recordFailure: vi.fn() },
    daemonStatus: { markReady: vi.fn() },
  };
}

const request = { url: "https://example.com", inputMode: "page" as const, slides: false };
const urlsMatch = (left: string, right: string) => left === right;

describe("panel summary session", () => {
  it("coalesces matching active and inflight requests but preserves explicit refreshes", () => {
    const session = createSession();
    session.inflightRequest = request;
    const options = {
      session,
      request,
      refresh: false,
      reason: "auto",
      standaloneExtraction: false,
      autoSummarize: true,
      manual: false,
      urlsMatch,
    };

    expect(shouldSkipSummaryRequest(options)).toBe(true);
    expect(shouldSkipSummaryRequest({ ...options, refresh: true })).toBe(false);
  });

  it("aborts the previous request and only lets its owner clear session state", () => {
    const session = createSession();
    const first = beginSummaryRequest(session, request);
    const second = beginSummaryRequest(session, { ...request, url: "https://example.com/next" });

    expect(first.controller.signal.aborted).toBe(true);
    expect(first.isSuperseded()).toBe(true);
    first.clear();
    expect(session.runController).toBe(second.controller);
    second.clear();
    expect(session.runController).toBeNull();
    expect(session.inflightRequest).toBeNull();
  });

  it("records completed runs as the deduplication source", () => {
    const session = createSession();
    recordActiveSummaryRun({
      session,
      request,
      run: {
        id: "run-1",
        url: request.url,
        title: "Example",
        model: "Browser",
        reason: "manual",
      },
    });

    expect(session.activeSummaryRun?.run.id).toBe("run-1");
    expect(session.lastSummarizedUrl).toBe(request.url);
    expect(session.inflightRequest).toBeNull();
  });
});
