function describeBaseUrlHost(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    const host = url.host.trim();
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

function parseModelIds(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  const data = obj.data;
  const ids = Array.isArray(data)
    ? data.map((item) => (item && typeof item === "object" ? (item as { id?: unknown }).id : null))
    : Array.isArray(obj.models)
      ? obj.models
      : [];
  return Array.from(
    new Set(
      ids
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export async function discoverOpenAiCompatibleModels({
  baseUrl,
  apiKey,
  fetchImpl,
  timeoutMs,
}: {
  baseUrl: string;
  apiKey: string | null;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<{ baseUrlHost: string; modelIds: string[] } | null> {
  const baseUrlHost = describeBaseUrlHost(baseUrl);
  if (!baseUrlHost) return null;

  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const modelsUrl = new URL("models", base).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(modelsUrl, {
      method: "GET",
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
    });
    if (!res.ok) return { baseUrlHost, modelIds: [] };
    return { baseUrlHost, modelIds: parseModelIds(await res.json()) };
  } catch {
    return { baseUrlHost, modelIds: [] };
  } finally {
    clearTimeout(timeout);
  }
}
