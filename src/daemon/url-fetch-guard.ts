import {
  assertNetworkTargetAllowed,
  createNetworkGuardedFetch,
  type NetworkLookup,
} from "@steipete/summarize-core/content";

const TARGET_LABEL = "URL fetch target";

export async function assertDaemonUrlFetchAllowed(
  rawUrl: string,
  options?: { lookup?: NetworkLookup },
): Promise<void> {
  await assertNetworkTargetAllowed(rawUrl, {
    targetLabel: TARGET_LABEL,
    lookup: options?.lookup,
  });
}

export function createDaemonUrlFetchGuard(
  fetchImpl: typeof fetch,
  options: { lookup?: NetworkLookup; pinnedFetchImpl?: typeof fetch } = {},
): typeof fetch {
  return createNetworkGuardedFetch(fetchImpl, {
    targetLabel: TARGET_LABEL,
    lookup: options.lookup,
    pinnedFetchImpl: options.pinnedFetchImpl,
  });
}
