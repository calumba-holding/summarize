import type { BgToPanel } from "../../lib/panel-contracts";
import {
  defaultSettings,
  loadSettings,
  patchSettings,
  type SlidesLayout,
} from "../../lib/settings";
import { generateToken } from "../../lib/token";
import { syncNavigationWithActiveTab } from "./active-tab-sync";
import { createAppearanceControls } from "./appearance-controls";
import { createAutoSummarizeRuntime } from "./auto-summarize-runtime";
import { createSidepanelBgMessageRuntime } from "./bg-message-runtime";
import { bindSidepanelUiEvents } from "./bindings";
import { bootstrapSidepanel } from "./bootstrap-runtime";
import { createSidepanelChatRuntime } from "./chat-runtime";
import { createSidepanelDom } from "./dom";
import { createSidepanelInteractionRuntime } from "./interaction-runtime";
import { createMetricsController } from "./metrics-controller";
import { createNavigationRuntime } from "./navigation-runtime";
import type { PanelCachePayload } from "./panel-cache";
import { createPanelMessagingRuntime } from "./panel-messaging";
import { createPanelStateStore } from "./panel-state-store";
import { createPanelViewRuntime } from "./panel-view-runtime";
import { createPlannedSlidesRuntime } from "./planned-slides-runtime";
import { createSidepanelPresentationRuntime } from "./presentation-runtime";
import { selectRetainedSlideSummaryMarkdown } from "./retained-slide-summary";
import { createSetupControlsRuntime } from "./setup-controls-runtime";
import { friendlyFetchError } from "./setup-runtime";
import { resolveSlidesInputMode } from "./slides-session-state";
import { createSummaryRunRuntime } from "./summary-run-runtime";
import { createSummaryStreamRuntime } from "./summary-stream-runtime";
import { registerSidepanelTestHooks } from "./test-hooks";
import type { UiState } from "./types";
import { createTypographyController } from "./typography-controller";
import { createUiStateRuntime } from "./ui-state-runtime";

const dom = createSidepanelDom();
const {
  advancedBtn,
  advancedSettingsBodyEl,
  advancedSettingsEl,
  advancedSettingsSummaryEl,
  autoToggleRoot,
  automationNoticeActionBtn,
  automationNoticeEl,
  automationNoticeMessageEl,
  automationNoticeTitleEl,
  chatContainerEl,
  chatContextStatusEl,
  chatDockEl,
  chatInputEl,
  chatJumpBtn,
  chatMessagesEl,
  chatMetricsSlotEl,
  chatQueueEl,
  chatSendBtn,
  clearBtn,
  drawerEl,
  drawerToggleBtn,
  inlineErrorEl,
  inlineErrorMessageEl,
  lengthRoot,
  lineLooseBtn,
  lineTightBtn,
  mainEl,
  metricsEl,
  metricsHomeEl,
  modelCustomEl,
  modelPresetEl,
  modelRefreshBtn,
  modelRowEl,
  modelStatusEl,
  pickersRoot,
  refreshBtn,
  renderEl,
  renderMarkdownHostEl,
  setupEl,
  sizeLgBtn,
  sizeSmBtn,
  slidesLayoutEl,
} = dom;

const metricsController = createMetricsController({
  metricsEl,
  metricsHomeEl,
  chatMetricsSlotEl,
});

const typographyController = createTypographyController({
  sizeSmBtn,
  sizeLgBtn,
  lineTightBtn,
  lineLooseBtn,
  defaultFontSize: defaultSettings.fontSize,
  defaultLineHeight: defaultSettings.lineHeight,
});

const panelStateStore = createPanelStateStore();
const panelState = panelStateStore.state;
const getActiveTabId = () => panelState.navigation.activeTabId;
const getActiveTabUrl = () => panelState.navigation.activeTabUrl;
const getSlidesState = () => panelState.slidesSession;
const updateSlidesState = (value: Partial<typeof panelState.slidesSession>) => {
  panelStateStore.dispatch({ type: "slides-session-update", value });
};
const getPanelSession = () => panelState.panelSession;
const updatePanelSession = (value: Partial<typeof panelState.panelSession>) => {
  panelStateStore.dispatch({ type: "panel-session-update", value });
};

const panelMessagingRuntime = createPanelMessagingRuntime({
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  onMessage: (msg) => {
    handleBgMessage(msg);
  },
});
const { handleLocalSlidesResponse, resolveLocalSlides, send } = panelMessagingRuntime;

const LINE_HEIGHT_STEP = 0.1;

const appearanceControls = createAppearanceControls({
  autoToggleRoot,
  pickersRoot,
  lengthRoot,
  patchSettings,
  sendSetAuto: (checked) => {
    updatePanelSession({ autoSummarize: checked });
    void send({ type: "panel:setAuto", value: checked });
  },
  sendSetLength: (value) => {
    void send({ type: "panel:setLength", value });
  },
  applyTypography: (fontFamily, fontSize, lineHeight) => {
    typographyController.apply(fontFamily, fontSize, lineHeight);
    typographyController.setCurrentFontSize(fontSize);
    typographyController.setCurrentLineHeight(lineHeight);
  },
});

const presentationRuntime = createSidepanelPresentationRuntime({
  dom,
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  appearanceControls,
  metricsController,
  resolveLocalSlides,
  send,
});
const {
  markdown: md,
  isStreaming,
  panelCacheController,
  feedback: {
    bindActions: bindFeedbackActions,
    errorController,
    headerController,
    hideSlideNotice,
    showSlideNotice,
  },
  phase: { setPhase },
  summary: { renderMarkdown, sendSummarize, viewRuntime: summaryViewRuntime },
  slides: {
    applySlidesPayload,
    controlRuntime: summarizeControlRuntime,
    refreshSummarizeControl,
    renderInlineSlides,
    runtime: slidesRuntime,
    setSlidesTranscriptTimedText,
    textController: slidesTextController,
    updateSlideSummaryFromMarkdown,
    viewRuntime: slidesViewRuntime,
  },
} = presentationRuntime;
const {
  maybeApplyPendingSlidesSummary,
  maybeStartPendingSlidesForUrl,
  rememberPendingSlidesRun,
  resolveActiveSlidesRunId,
  slidesHydrator: activeSlidesHydrator,
  startSlidesStream,
  startSlidesStreamForRunId,
  startSlidesSummaryStreamForRunId,
  stopSlidesStream,
} = slidesRuntime;
const {
  queueSlidesRender,
  rebuildSlideDescriptions,
  renderMarkdownDisplay,
  setSlidesBusy,
  updateSlidesTextState,
} = slidesViewRuntime;
const { applySlidesLayout, setSlidesLayout } = summarizeControlRuntime;
const { resetSummaryView } = summaryViewRuntime;

const navigationRuntime = createNavigationRuntime();

const chatRuntime = createSidepanelChatRuntime({
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  markdown: md,
  mainEl,
  renderEl,
  chatContainerEl,
  chatContextStatusEl,
  chatDockEl,
  chatInputEl,
  chatJumpBtn,
  chatMessagesEl,
  chatQueueEl,
  chatSendBtn,
  automationNoticeActionBtn,
  automationNoticeEl,
  automationNoticeMessageEl,
  automationNoticeTitleEl,
  getActiveTabId,
  getActiveTabUrl,
  navigationRuntime,
  send,
  setStatus: (value) => {
    headerController.setStatus(value);
  },
  clearErrors: () => {
    errorController.clearAll();
  },
  showInlineError: (message) => {
    errorController.showInlineError(message);
  },
  clearChatMetrics: () => {
    metricsController.clearForMode("chat");
  },
  setChatMetricsMode: () => {
    metricsController.setActiveMode("chat");
  },
  setLastActionChat: () => {
    updatePanelSession({ lastAction: "chat" });
  },
  renderInlineSlides: () => {
    renderInlineSlides(chatMessagesEl);
  },
  seekToTimestamp: (seconds) => {
    void send({ type: "panel:seek", seconds });
  },
});

const panelViewRuntime = createPanelViewRuntime({
  summaryView: summaryViewRuntime,
  resetChatState: chatRuntime.reset,
});
const { applyPanelCache, resetPanelView } = panelViewRuntime;

const syncWithActiveTab = () =>
  syncNavigationWithActiveTab({
    navigationRuntime,
    getCurrentSource: () => panelState.currentSource,
    setCurrentSource: (source) => {
      panelStateStore.dispatch({ type: "source", source });
    },
    resetForNavigation: (preserveChat) => {
      setPhase("idle");
      resetPanelView({ preserveChat });
      headerController.setBaseSubtitle("");
    },
    setBaseTitle: (title) => {
      headerController.setBaseTitle(title);
    },
  });

async function clearCurrentView() {
  panelStateStore.dispatch({ type: "retained-slide-summary", value: null });
  if (panelState.chat.streaming) {
    chatRuntime.requestAbort("Cleared");
  }
  streamController.abort();
  stopSlidesStream();
  resetPanelView();
  await chatRuntime.clearHistoryForActiveTab();
  panelCacheController.scheduleSync();
  headerController.setStatus("");
  setPhase("idle");
}

registerSidepanelTestHooks({
  applySlidesPayload,
  getRunId: () => panelState.runId,
  getSummaryMarkdown: () => panelState.summaryMarkdown ?? "",
  getRetainedSlideSummaryMarkdown: () => selectRetainedSlideSummaryMarkdown(panelState) ?? "",
  getSlideDescriptions: () => slidesTextController.getDescriptionEntries(),
  getSlideSummaryEntries: () => slidesTextController.getSummaryEntries(),
  getSlideTitleEntries: () => Array.from(slidesTextController.getTitles().entries()),
  getPhase: () => panelState.phase,
  getModel: () => panelState.lastMeta.model ?? null,
  getSlidesTimeline: () =>
    panelState.slides?.slides.map((slide) => ({
      index: slide.index,
      timestamp: Number.isFinite(slide.timestamp) ? slide.timestamp : null,
    })) ?? [],
  getTranscriptTimedText: () => slidesTextController.getTranscriptTimedText(),
  getSlidesSummaryMarkdown: () => panelState.slidesSummary.markdown,
  getSlidesSummaryComplete: () => panelState.slidesSummary.complete,
  getSlidesSummaryModel: () => panelState.slidesSummary.model,
  getChatEnabled: () => getPanelSession().chatEnabled,
  getSettingsHydrated: () => getPanelSession().settingsHydrated,
  setTranscriptTimedText: (value) => {
    setSlidesTranscriptTimedText(value);
    updateSlidesTextState();
  },
  setSummarizeMode: async (payload) => {
    await summarizeControlRuntime.handleSummarizeControlChange(payload);
    refreshSummarizeControl();
  },
  getSummarizeMode: () => ({
    mode: resolveSlidesInputMode(getSlidesState()),
    slides: getSlidesState().slidesEnabled,
    mediaAvailable: getSlidesState().mediaAvailable,
  }),
  getSlidesState: () => ({
    slidesCount: panelState.slides?.slides.length ?? 0,
    layout: getSlidesState().slidesLayout,
    hasSlides: Boolean(panelState.slides),
  }),
  renderSlidesNow: () => {
    queueSlidesRender();
  },
  applyUiState: (state) => {
    panelStateStore.dispatch({ type: "ui", ui: state });
    updateControls(state);
  },
  applyBgMessage: (message) => {
    handleBgMessage(message);
  },
  applySummarySnapshot: (payload) => {
    summaryRunRuntime.applySnapshot(payload);
  },
  applySummaryMarkdown: (markdown) => {
    renderMarkdown(markdown);
    setPhase("idle");
  },
  applySlidesSummaryMarkdown: (markdown) => {
    updateSlideSummaryFromMarkdown(markdown, {
      preserveIfEmpty: true,
      source: "slides-partial",
    });
    setPhase("idle");
  },
  forceRenderSlides: () => {
    updateSlidesState({
      slidesEnabled: true,
      inputMode: "video",
      inputModeOverride: "video",
    });
    return slidesViewRuntime.slidesRenderer.forceRender();
  },
  showInlineError: (message) => {
    errorController.showInlineError(message);
  },
  isInlineErrorVisible: () => !inlineErrorEl.classList.contains("hidden"),
  getInlineErrorMessage: () => inlineErrorMessageEl.textContent ?? "",
});

const plannedSlidesRuntime = createPlannedSlidesRuntime({
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  getActiveTabUrl,
  getLengthValue: () => appearanceControls.getLengthValue(),
  updateSlidesTextState,
  queueSlidesRender,
  schedulePanelCacheSync: (delayMs) => panelCacheController.scheduleSync(delayMs),
});

const setupControlsRuntime = createSetupControlsRuntime({
  advancedSettingsBodyEl,
  advancedSettingsEl,
  defaultModel: defaultSettings.model,
  drawerEl,
  drawerToggleBtn,
  friendlyFetchError,
  generateToken,
  getStatusResetText: () => panelState.ui?.status ?? "",
  headerSetStatus: (text) => {
    headerController.setStatus(text);
  },
  loadSettings,
  modelCustomEl,
  modelPresetEl,
  modelRefreshBtn,
  modelRowEl,
  modelStatusEl,
  patchSettings,
  setupEl,
});
const {
  drawerControls,
  isRefreshFreeRunning,
  maybeShowSetup,
  readCurrentModelValue,
  refreshModelsIfStale,
  runRefreshFree,
  setDefaultModelPresets,
  setModelPlaceholderFromDiscovery,
  setModelValue,
  updateModelRowUI,
} = setupControlsRuntime;

const summaryStreamRuntime = createSummaryStreamRuntime({
  friendlyFetchError,
  getFallbackModel: () => panelState.ui?.settings.model ?? null,
  getToken: async () => (await loadSettings()).token,
  handleSlides: activeSlidesHydrator.handlePayload,
  handleSummaryFromCache: activeSlidesHydrator.handleSummaryFromCache,
  headerArmProgress: () => {
    headerController.armProgress();
  },
  headerSetBaseSubtitle: (text) => {
    headerController.setBaseSubtitle(text);
  },
  headerSetBaseTitle: (text) => {
    headerController.setBaseTitle(text);
  },
  headerSetStatus: (text) => {
    headerController.setStatus(text);
  },
  headerStopProgress: () => {
    headerController.stopProgress();
  },
  isStreaming,
  maybeApplyPendingSlidesSummary,
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  queueSlidesRender,
  rebuildSlideDescriptions,
  refreshSummaryMetrics: (summary) => {
    metricsController.setForMode(
      "summary",
      summary,
      panelState.lastMeta.inputSummary,
      panelState.currentSource?.url ?? null,
    );
    metricsController.setActiveMode("summary");
  },
  rememberUrl: (url) => {
    void send({ type: "panel:rememberUrl", url });
  },
  renderMarkdown,
  resetSummaryView,
  schedulePanelCacheSync: () => {
    panelCacheController.scheduleSync();
  },
  seedPlannedSlidesForPendingRun: () => {
    plannedSlidesRuntime.seedPendingRunAndConsumeWhenReady();
  },
  setSlidesBusy,
  setPhase,
  shouldRebuildSlideDescriptions: () => !slidesTextController.hasSummaryTitles(),
  syncWithActiveTab,
});
const { streamController } = summaryStreamRuntime;

const autoSummarizeRuntime = createAutoSummarizeRuntime({
  getEnabled: () => getPanelSession().autoSummarize,
  getPhase: () => panelState.phase,
  hasSummary: () => Boolean(panelState.summaryMarkdown),
  summarize: () => {
    sendSummarize();
  },
});

const summaryRunRuntime = createSummaryRunRuntime({
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  getActiveTabId,
  cancelAutoSummarize: autoSummarizeRuntime.cancel,
  summaryStream: {
    isStreaming: streamController.isStreaming,
    start: streamController.start,
  },
  slides: {
    getHydratedRunId: activeSlidesHydrator.getActiveRunId,
    queueRender: queueSlidesRender,
    seedPlannedRun: plannedSlidesRuntime.seedForRun,
    setTranscriptTimedText: setSlidesTranscriptTimedText,
    start: startSlidesStream,
    stop: stopSlidesStream,
    updateTextState: updateSlidesTextState,
  },
  chat: {
    clearHistory: chatRuntime.clearHistoryForActiveTab,
    finishStreamingMessage: chatRuntime.finishStreamingMessage,
    reset: chatRuntime.reset,
    shouldPreserveForRun: navigationRuntime.shouldPreserveChatForRun,
  },
  view: {
    queueEmptyRender: renderMarkdownDisplay,
    renderMarkdown,
    reset: resetSummaryView,
    setHeaderSubtitle: (value) => headerController.setBaseSubtitle(value),
    setHeaderTitle: (value) => headerController.setBaseTitle(value),
    setMetricsMode: (mode) => metricsController.setActiveMode(mode),
    setPhase,
  },
});

const uiStateRuntime = createUiStateRuntime({
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  appearanceControls,
  typographyController,
  navigationRuntime,
  panelCacheController,
  headerController,
  clearInlineError: () => {
    errorController.clearInlineError();
  },
  requestAgentAbort: chatRuntime.requestAbort,
  clearChatHistoryForActiveTab: chatRuntime.clearHistoryForActiveTab,
  migrateChatHistory: chatRuntime.migrateHistory,
  maybeStartPendingSummaryRunForUrl: summaryRunRuntime.maybeStartPendingForUrl,
  maybeStartPendingSlidesForUrl,
  requestSlidesCapture: () => {
    void send({ type: "panel:slides-capture" });
  },
  resolveActiveSlidesRunId,
  applyPanelCache,
  resetSummaryView: resetPanelView,
  abortSummaryStream: () => {
    streamController.abort();
  },
  hideAutomationNotice: chatRuntime.hideAutomationNotice,
  hideSlideNotice,
  maybeApplyPendingSlidesSummary,
  applyChatEnabled: chatRuntime.applyEnabled,
  restoreChatHistory: chatRuntime.restoreHistory,
  rebuildSlideDescriptions,
  renderInlineSlides,
  setSlidesLayout: (value) => {
    setSlidesLayout(value as SlidesLayout);
  },
  maybeSeedPlannedSlidesForPendingRun: plannedSlidesRuntime.maybeSeedPendingRun,
  refreshSummarizeControl,
  maybeShowSetup,
  setPhase,
  renderMarkdownDisplay,
  readCurrentModelValue,
  setModelValue,
  updateModelRowUI,
  isRefreshFreeRunning,
  setModelRefreshDisabled: (value) => {
    modelRefreshBtn.disabled = value;
  },
  renderMarkdownHostEl,
  isStreaming,
  onSlidesOcrChanged: updateSlidesTextState,
});

function updateControls(state: UiState) {
  uiStateRuntime.apply(state);
}

const bgMessageRuntime = createSidepanelBgMessageRuntime({
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  applyUiState: updateControls,
  setStatus: (text) => {
    headerController.setStatus(text);
  },
  isStreaming,
  setPhase,
  finishStreamingMessage: chatRuntime.finishStreamingMessage,
  setSlidesBusy,
  showSlideNotice,
  getActiveTabUrl,
  rememberPendingSlidesRun: (value) => {
    rememberPendingSlidesRun(value);
  },
  startSlidesStreamForRunId,
  startSlidesSummaryStreamForRunId: (runId, url) => {
    startSlidesSummaryStreamForRunId(runId, url ?? null);
  },
  handleSlidesLocal: handleLocalSlidesResponse,
  getSlidesContextRequestId: () => getSlidesState().slidesContextRequestId,
  setSlidesContextPending: (value) => {
    updateSlidesState({ slidesContextPending: value });
  },
  setSlidesTranscriptTimedText,
  updateSlidesTextState,
  updateSlideSummaryFromMarkdown,
  renderInlineSlidesFallback: () => {
    renderInlineSlides(renderMarkdownHostEl, { fallback: true });
  },
  schedulePanelCacheSync: () => {
    panelCacheController.scheduleSync();
  },
  consumeUiCache: (cacheMessage) => panelCacheController.consumeResponse(cacheMessage),
  clearPanelCache: () => {
    panelCacheController.clear();
  },
  getActiveTabId,
  applyPanelCache: (cache, opts) => {
    applyPanelCache(cache as PanelCachePayload, opts);
  },
  rememberPendingSummaryRun: (run) => {
    summaryRunRuntime.rememberPendingRun(run);
  },
  rememberPendingSummarySnapshot: (payload) => {
    summaryRunRuntime.rememberPendingSnapshot(payload);
  },
  attachSummaryRun: summaryRunRuntime.attachRun,
  applySummarySnapshot: (payload) => {
    summaryRunRuntime.applySnapshot(payload);
  },
  handleChatHistory: chatRuntime.handleHistory,
  handleAgentChunk: chatRuntime.handleAgentChunk,
  handleAgentResponse: chatRuntime.handleAgentResponse,
});

function handleBgMessage(msg: BgToPanel) {
  bgMessageRuntime.handle(msg);
}

const interactionRuntime = createSidepanelInteractionRuntime({
  chatEnabled: () => getPanelSession().chatEnabled,
  getRawChatInput: () => chatInputEl.value,
  clearChatInput: () => {
    chatInputEl.value = "";
    chatInputEl.style.height = "auto";
  },
  restoreChatInput: (value) => {
    chatInputEl.value = value;
  },
  getChatInputScrollHeight: () => chatInputEl.scrollHeight,
  setChatInputHeight: (value) => {
    chatInputEl.style.height = value;
  },
  isChatStreaming: () => panelState.chat.streaming,
  getQueuedChatCount: chatRuntime.getQueueLength,
  enqueueChatMessage: chatRuntime.enqueueMessage,
  maybeSendQueuedChat: chatRuntime.maybeSendQueuedMessage,
  startChatMessage: chatRuntime.startMessage,
  typographyController,
  patchSettings,
  updateModelRowUI,
  isCustomModelHidden: () => modelCustomEl.hidden,
  focusCustomModel: () => {
    modelCustomEl.focus();
  },
  blurCustomModel: () => {
    modelCustomEl.blur();
  },
  readCurrentModelValue,
});
const { sendChatMessage, bumpFontSize, bumpLineHeight, persistCurrentModel } = interactionRuntime;

function retryLastAction() {
  if (getPanelSession().lastAction === "chat") {
    chatRuntime.retry();
    return;
  }
  sendSummarize({ refresh: true });
}

bindFeedbackActions(retryLastAction);

bindSidepanelUiEvents({
  refreshBtn,
  clearBtn,
  drawerToggleBtn,
  advancedBtn,
  advancedSettingsSummaryEl,
  chatSendBtn,
  chatInputEl,
  sizeSmBtn,
  sizeLgBtn,
  lineTightBtn,
  lineLooseBtn,
  modelPresetEl,
  modelCustomEl,
  slidesLayoutEl,
  modelRefreshBtn,
  advancedSettingsEl,
  lineHeightStep: LINE_HEIGHT_STEP,
  sendSummarize,
  clearCurrentView,
  toggleDrawer: () => drawerControls.toggleDrawer(),
  openOptions: () => send({ type: "panel:openOptions" }),
  toggleAdvancedSettings: drawerControls.toggleAdvancedSettings,
  sendChatMessage,
  bumpFontSize,
  bumpLineHeight,
  persistCurrentModel,
  setSlidesLayout: (next) => {
    setSlidesLayout(next);
    void (async () => {
      await patchSettings({ slidesLayout: next });
    })();
  },
  refreshModelsIfStale: () => {
    if (drawerControls.hasAdvancedSettingsAnimation() && advancedSettingsEl.open) return;
    refreshModelsIfStale();
  },
  runRefreshFree,
});

bootstrapSidepanel({
  ensurePanelPort: () => panelMessagingRuntime.ensure(),
  loadSettings,
  panelState,
  dispatchPanelState: panelStateStore.dispatch,
  typographyController,
  setSlidesLayoutInputValue: (value) => {
    slidesLayoutEl.value = value;
  },
  hideAutomationNotice: chatRuntime.hideAutomationNotice,
  appearanceControls,
  applyChatEnabled: chatRuntime.applyEnabled,
  applySlidesLayout,
  setDefaultModelPresets,
  setModelValue,
  setModelPlaceholderFromDiscovery,
  updateModelRowUI,
  setModelRefreshDisabled: (value) => {
    modelRefreshBtn.disabled = value;
  },
  toggleDrawerClosed: () => {
    drawerControls.toggleDrawer(false, { animate: false });
  },
  renderMarkdownDisplay,
  sendReady: () => {
    void send({ type: "panel:ready" });
  },
  scheduleAutoSummarize: autoSummarizeRuntime.schedule,
  sendPing: () => {
    void send({ type: "panel:ping" });
  },
  bindSidepanelLifecycle: {
    sendReady: () => {
      void send({ type: "panel:ready" });
    },
    sendClosed: () => {
      autoSummarizeRuntime.cancel();
      void send({ type: "panel:closed" });
    },
    scheduleAutoSummarize: autoSummarizeRuntime.schedule,
    syncWithActiveTab,
    clearInlineError: () => {
      errorController.clearInlineError();
    },
    sendSummarize,
  },
});
