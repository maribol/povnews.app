import type { Digest } from "../types/pov";

export function digestToMarkdown(digest: Digest): string {
  const lines: string[] = [
    `# POV News — ${new Date(digest.generatedAt).toLocaleDateString()}`,
    "",
  ];

  for (const item of digest.items) {
    lines.push(`## ${item.title}`);
    lines.push("");
    lines.push(`- **Score:** ${item.score}`);
    lines.push(`- **Pillar:** ${item.pillarName}`);
    lines.push(`- **Source:** ${item.source} (${item.published})`);
    lines.push(`- **URL:** ${item.url}`);
    lines.push("");
    lines.push(`### Why this matters`);
    lines.push(item.whyItMatters);
    lines.push("");
    if (item.quotableSnippet) {
      lines.push(`> ${item.quotableSnippet}`);
      lines.push("");
    }
    lines.push(`### Summary`);
    lines.push(item.summary);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
