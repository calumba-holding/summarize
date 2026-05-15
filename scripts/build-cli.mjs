import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const distDir = path.join(repoRoot, "dist");
await mkdir(distDir, { recursive: true });

// ESM binary wrapper.
// Avoid bundling: CJS deps (e.g. commander) can trigger esbuild's dynamic-require shim in ESM output.
const wrapper = `#!/usr/bin/env node
await import('./esm/cli.js')
`;

await writeFile(path.join(distDir, "cli.js"), wrapper, "utf8");
await chmod(path.join(distDir, "cli.js"), 0o755);
