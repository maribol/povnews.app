import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = join(ROOT, "prompts", "context");

const CONTEXT_FILES = [
  "brand-voice.md",
  "pillars.md",
  "pov-framing.md",
  "scoring-rubric.md",
  "sources.md",
] as const;

export type ContextBundle = Record<(typeof CONTEXT_FILES)[number], string>;

export async function loadContext(): Promise<ContextBundle> {
  const entries = await Promise.all(
    CONTEXT_FILES.map(async (name) => {
      const text = await readFile(join(CONTEXT_DIR, name), "utf8");
      return [name, text] as const;
    }),
  );
  return Object.fromEntries(entries) as ContextBundle;
}

export async function loadPrompt(
  filename: string,
  vars: Record<string, string>,
): Promise<string> {
  let text = await readFile(join(ROOT, "prompts", filename), "utf8");
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
}

export function inlineParentPrompt(
  parentTemplate: string,
  ctx: ContextBundle,
): string {
  return parentTemplate
    .replace("{{brand-voice}}", ctx["brand-voice.md"])
    .replace("{{pillars}}", ctx["pillars.md"])
    .replace("{{pov-framing}}", ctx["pov-framing.md"])
    .replace("{{scoring-rubric}}", ctx["scoring-rubric.md"])
    .replace("{{sources}}", ctx["sources.md"]);
}
