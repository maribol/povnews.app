export function extractJsonFromText(text: string): string | undefined {
  if (!text.trim()) return undefined;

  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fenceMatch) {
    try {
      JSON.parse(fenceMatch[1]);
      return fenceMatch[1];
    } catch {
      /* fall through */
    }
  }

  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    const candidate = text.slice(braceStart, braceEnd + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      /* fall through */
    }
  }

  return undefined;
}
