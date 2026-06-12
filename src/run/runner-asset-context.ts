import type { AssetInputContext } from "./flows/asset/input.js";
import type { AssetSummaryContext } from "./flows/asset/types.js";

export function createRunnerAssetInputContext({
  summarizeAssetImpl,
  summarizeMediaFileImpl,
  assetSummaryContext,
  progressEnabled,
  trackedFetch,
  setClearProgressBeforeStdout,
  clearProgressIfCurrent,
}: {
  summarizeAssetImpl: AssetInputContext["summarizeAsset"];
  summarizeMediaFileImpl: NonNullable<AssetInputContext["summarizeMediaFile"]>;
  assetSummaryContext: AssetSummaryContext;
  progressEnabled: boolean;
  trackedFetch: typeof fetch;
  setClearProgressBeforeStdout: AssetInputContext["setClearProgressBeforeStdout"];
  clearProgressIfCurrent: AssetInputContext["clearProgressIfCurrent"];
}): AssetInputContext {
  return {
    env: assetSummaryContext.env,
    envForRun: assetSummaryContext.envForRun,
    stderr: assetSummaryContext.stderr,
    progressEnabled,
    timeoutMs: assetSummaryContext.timeoutMs,
    trackedFetch,
    summarizeAsset: summarizeAssetImpl,
    summarizeMediaFile: summarizeMediaFileImpl,
    setClearProgressBeforeStdout,
    clearProgressIfCurrent,
  };
}
