import { describe, expect, it, vi } from "vitest";
import { discoverOpenAiCompatibleModels } from "../src/daemon/model-discovery.js";

describe("daemon model discovery", () => {
  it("normalizes OpenAI model-list responses", async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          data: [{ id: " z-model " }, { id: "a-model" }, { id: "a-model" }, { id: 42 }],
        }),
      } as Response;
    }) as unknown as typeof fetch;

    await expect(
      discoverOpenAiCompatibleModels({
        baseUrl: "https://models.example/v1",
        apiKey: "secret",
        fetchImpl,
        timeoutMs: 100,
      }),
    ).resolves.toEqual({
      baseUrlHost: "models.example",
      modelIds: ["a-model", "z-model"],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://models.example/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: { authorization: "Bearer secret" },
      }),
    );
  });

  it("accepts flat model arrays and rejects invalid endpoints", async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ models: ["qwen", " llama ", "qwen"] }),
      } as Response;
    }) as unknown as typeof fetch;

    await expect(
      discoverOpenAiCompatibleModels({
        baseUrl: "http://localhost:11434/v1/",
        apiKey: null,
        fetchImpl,
        timeoutMs: 100,
      }),
    ).resolves.toEqual({
      baseUrlHost: "localhost:11434",
      modelIds: ["llama", "qwen"],
    });
    await expect(
      discoverOpenAiCompatibleModels({
        baseUrl: "not a url",
        apiKey: null,
        fetchImpl,
        timeoutMs: 100,
      }),
    ).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns an empty discovery result for failed probes", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await expect(
      discoverOpenAiCompatibleModels({
        baseUrl: "https://offline.example/v1",
        apiKey: null,
        fetchImpl,
        timeoutMs: 100,
      }),
    ).resolves.toEqual({
      baseUrlHost: "offline.example",
      modelIds: [],
    });
  });
});
