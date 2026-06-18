import {
  deleteArtifact,
  getArtifactRecord,
  listArtifacts,
  parseArtifact,
  upsertArtifact,
} from "../artifacts-store";
import { getActiveTabId } from "./active-tab";

export type ArtifactsToolArgs = {
  action: "list" | "get" | "create" | "update" | "delete";
  fileName?: string;
  content?: unknown;
  mimeType?: string;
  contentBase64?: string;
  asBase64?: boolean;
};

type ArtifactInfo = {
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
};

function formatArtifactValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// Artifacts are stored per active tab session and can be created/updated from both REPL and tools.
export async function executeArtifactsTool(
  args: ArtifactsToolArgs,
): Promise<{ text: string; details?: unknown }> {
  const tabId = await getActiveTabId();
  const action = args.action;

  if (action === "list") {
    const records = await listArtifacts(tabId);
    const items: ArtifactInfo[] = records.map((record) => ({
      fileName: record.fileName,
      mimeType: record.mimeType,
      size: record.size,
      updatedAt: record.updatedAt,
    }));
    const text =
      items.length === 0
        ? "No artifacts found."
        : items
            .map((item) => `- ${item.fileName} (${item.mimeType}, ${item.size} bytes)`)
            .join("\n");
    return { text, details: { artifacts: items } };
  }

  if (!args.fileName) throw new Error("Missing fileName");

  if (action === "get") {
    const record = await getArtifactRecord(tabId, args.fileName);
    if (!record) throw new Error(`Artifact not found: ${args.fileName}`);
    if (args.asBase64) {
      const text = formatArtifactValue(record);
      return { text, details: { artifact: record } };
    }
    const isText =
      record.mimeType.startsWith("text/") ||
      record.mimeType === "application/json" ||
      record.fileName.endsWith(".json");
    const value = isText ? parseArtifact(record) : record;
    const text = formatArtifactValue(value);
    return { text, details: { artifact: record } };
  }

  if (action === "create") {
    const existing = await getArtifactRecord(tabId, args.fileName);
    if (existing) throw new Error(`Artifact already exists: ${args.fileName}`);
  }

  if (action === "update") {
    const existing = await getArtifactRecord(tabId, args.fileName);
    if (!existing) throw new Error(`Artifact not found: ${args.fileName}`);
  }

  if (action === "create" || action === "update") {
    const record = await upsertArtifact(tabId, {
      fileName: args.fileName,
      content: args.content,
      mimeType: args.mimeType,
      contentBase64: args.contentBase64,
    });
    return {
      text: `Saved artifact ${record.fileName} (${record.mimeType}, ${record.size} bytes)`,
      details: { artifact: record },
    };
  }

  if (action === "delete") {
    const deleted = await deleteArtifact(tabId, args.fileName);
    return {
      text: deleted ? `Deleted artifact ${args.fileName}` : `Artifact not found: ${args.fileName}`,
    };
  }

  throw new Error(`Unknown artifacts action: ${action}`);
}
