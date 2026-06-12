import { describe, expect, it } from "vitest";
import {
  createInitialSlidesSessionState,
  resolveSlidesInputMode,
} from "../apps/chrome-extension/src/entrypoints/sidepanel/slides-session-state.js";

describe("sidepanel slides session state", () => {
  it("creates state and resolves effective input mode", () => {
    const state = createInitialSlidesSessionState({
      slidesEnabled: true,
      slidesParallel: false,
      slidesOcrEnabled: true,
      slidesLayout: "gallery",
    });

    expect(resolveSlidesInputMode(state)).toBe("page");
    expect(resolveSlidesInputMode({ ...state, inputMode: "video" })).toBe("video");
    expect(resolveSlidesInputMode({ ...state, inputModeOverride: "page" })).toBe("page");
  });
});
