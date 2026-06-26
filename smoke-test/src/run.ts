import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, CursorAgentError } from "@cursor/sdk";
import {
  inlineParentPrompt,
  loadContext,
  loadPrompt,
} from "./loadContext.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = join(ROOT, "output");

const SUBAGENT_CATEGORIES = [
  "reddit-pain-language",
  "regulatory-platform-changes",
  "ai-marketing",
] as const;

async function main(): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    console.error("Set CURSOR_API_KEY in smoke-test/.env");
    process.exit(1);
  }

  const ctx = await loadContext();
  const parentTemplate = await loadPrompt("parent.md", {});
  const parentPrompt = inlineParentPrompt(parentTemplate, ctx);

  const subagentBase = await loadPrompt("subagent.md", {
    category_slug: "PLACEHOLDER",
  });

  const agents: Record<
    string,
    { description: string; prompt: string; model: "inherit" }
  > = {};

  for (const slug of SUBAGENT_CATEGORIES) {
    const prompt = subagentBase.replaceAll("{{category_slug}}", slug);
    agents[slug] = {
      description: `Research source category: ${slug}. Use WebSearch and WebFetch.`,
      prompt,
      model: "inherit",
    };
  }

  console.log("Creating no-repo cloud agent (composer)…");
  const startedAt = Date.now();

  await using agent = await Agent.create({
    apiKey,
    model: { id: "composer" },
    cloud: {
      env: { type: "cloud" },
    },
    agents,
  });

  console.log(`Agent id: ${agent.agentId}`);

  try {
    const run = await agent.send(parentPrompt);
    console.log(`Run id: ${run.id}`);

    const result = await run.wait();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (result.status === "error") {
      console.error(`Run failed after ${elapsed}s (run ${result.id})`);
      process.exit(2);
    }

    console.log(`Run finished (${result.status}) in ${elapsed}s`);

    const artifacts = await agent.listArtifacts();
    console.log(
      `Artifacts (${artifacts.length}):`,
      artifacts.map((a) => `${a.path} (${a.sizeBytes}b)`).join(", ") ||
        "(none)",
    );

    const digestArtifact =
      artifacts.find((a) => a.path === "digest.json") ??
      artifacts.find((a) => a.path.endsWith("digest.json"));

    if (!digestArtifact) {
      console.error("No digest.json artifact. Check cursor.com/agents dashboard.");
      process.exit(3);
    }

    const buffer = await agent.downloadArtifact(digestArtifact.path);
    const raw = buffer.toString("utf8");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("digest.json is not valid JSON");
      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(join(OUTPUT_DIR, "digest.raw.json"), raw);
      process.exit(4);
    }

    await mkdir(OUTPUT_DIR, { recursive: true });
    const outPath = join(OUTPUT_DIR, "digest.json");
    await writeFile(outPath, JSON.stringify(parsed, null, 2));

    const items = (parsed as { items?: unknown[] }).items?.length ?? "?";
    console.log(`Wrote ${outPath} (${items} items)`);
    console.log(
      "Next: review digest quality against extension/fixtures/digest-sample.json",
    );
    console.log("Cost: cursor.com/dashboard/usage");
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(`Startup failed: ${err.message} (retryable=${err.isRetryable})`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
