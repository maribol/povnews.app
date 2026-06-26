/**
 * Cursor Cloud Agents REST API (v1).
 * Matches @cursor/sdk V1CreateAgentRequest shape.
 */

const API_BASE = "https://api.cursor.com/v1";

/** Cursor API rejects custom subagent prompts above ~8k chars. */
export const MAX_SUBAGENT_PROMPT_CHARS = 8_000;

export type SubagentInput = {
  name: string;
  description: string;
  prompt: string;
};

export type CreateAgentInput = {
  promptText: string;
  /** Omit to auto-resolve from GET /v1/models (prefers composer). */
  modelId?: string;
  subagents?: SubagentInput[];
};

/** IDE task model names ≠ REST API model ids. See GET /v1/models. */
export const FALLBACK_CLOUD_MODEL = "composer";

let cachedModelId: string | null | undefined;

export function clearModelCache(): void {
  cachedModelId = undefined;
}

export type CreateAgentResult = {
  agentId: string;
  runId: string;
};

export type AgentRecord = {
  id: string;
  status?: string;
  latestRunId?: string;
  [key: string]: unknown;
};

export type RunRecord = {
  id: string;
  status: string;
  [key: string]: unknown;
};

export type ArtifactRecord = {
  path: string;
  sizeBytes?: number;
};

function authHeader(apiKey: string): HeadersInit {
  return {
    Authorization: `Basic ${btoa(`${apiKey}:`)}`,
    "Content-Type": "application/json",
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cursor API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

/** Map Cursor run statuses to lowercase poll keys */
export function normalizeRunStatus(status: string): string {
  const u = status.toUpperCase();
  if (u === "RUNNING" || u === "CREATING") return "running";
  if (u === "FINISHED") return "finished";
  if (u === "ERROR" || u === "EXPIRED") return "error";
  if (u === "CANCELLED") return "cancelled";
  return status.toLowerCase();
}

export async function validateApiKey(
  apiKey: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/me`, { headers: authHeader(apiKey) });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text.slice(0, 300) };
    }
    const me = (await res.json()) as { userEmail?: string; apiKeyName?: string };
    return { ok: true, email: me.userEmail ?? me.apiKeyName };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/models`, { headers: authHeader(apiKey) });
  const data = await parseJson<unknown>(res);
  // The API may return bare strings, or objects ({ id, displayName, … }), and
  // either a top-level array or one wrapped in items/models/data. Normalize to
  // a flat list of string ids — rendering the raw objects would crash React.
  const rawList: unknown[] = Array.isArray(data)
    ? data
    : ((data as Record<string, unknown>)?.items as unknown[]) ??
      ((data as Record<string, unknown>)?.models as unknown[]) ??
      ((data as Record<string, unknown>)?.data as unknown[]) ??
      [];
  const ids = rawList
    .map((m) => {
      if (typeof m === "string") return m;
      if (m && typeof m === "object") {
        const o = m as Record<string, unknown>;
        const id = o.id ?? o.name ?? o.model ?? o.slug;
        return typeof id === "string" ? id : null;
      }
      return null;
    })
    .filter((m): m is string => !!m);
  return ids;
}

/** Pick a model id valid for this API key; omit if none (server uses account default). */
export async function resolveCloudModelId(apiKey: string): Promise<string | undefined> {
  if (cachedModelId !== undefined) {
    return cachedModelId ?? undefined;
  }
  try {
    const models = await listModels(apiKey);
    cachedModelId =
      models.find((m) => m === "composer") ??
      models.find((m) => m.includes("composer")) ??
      models[0] ??
      null;
  } catch {
    cachedModelId = FALLBACK_CLOUD_MODEL;
  }
  return cachedModelId ?? undefined;
}

export async function createCloudAgent(
  apiKey: string,
  input: CreateAgentInput,
): Promise<CreateAgentResult> {
  const modelId = input.modelId ?? (await resolveCloudModelId(apiKey));

  const body: Record<string, unknown> = {
    prompt: { text: input.promptText },
    env: { type: "cloud" },
  };

  if (modelId) {
    body.model = { id: modelId };
  }

  if (input.subagents?.length) {
    for (const s of input.subagents) {
      if (s.prompt.length > MAX_SUBAGENT_PROMPT_CHARS) {
        throw new Error(
          `Subagent "${s.name}" prompt is too long (${s.prompt.length} chars, max ${MAX_SUBAGENT_PROMPT_CHARS}).`,
        );
      }
    }
    body.customSubagents = input.subagents.map((s) => ({
      name: s.name,
      description: s.description,
      prompt: s.prompt,
    }));
  }

  const res = await fetch(`${API_BASE}/agents`, {
    method: "POST",
    headers: authHeader(apiKey),
    body: JSON.stringify(body),
  });

  const data = await parseJson<{
    agent?: { id: string; latestRunId?: string };
    run?: { id: string };
    id?: string;
    runId?: string;
    latestRunId?: string;
  }>(res);

  const agentId = data.agent?.id ?? data.id;
  const runId = data.run?.id ?? data.runId ?? data.agent?.latestRunId ?? data.latestRunId;

  if (!agentId || !runId) {
    throw new Error("Create agent response missing agent or run id");
  }

  return { agentId, runId };
}

export async function getAgent(
  apiKey: string,
  agentId: string,
): Promise<AgentRecord> {
  const res = await fetch(`${API_BASE}/agents/${agentId}`, {
    headers: authHeader(apiKey),
  });
  return parseJson(res);
}

export async function listAgentRuns(
  apiKey: string,
  agentId: string,
): Promise<RunRecord[]> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/runs`, {
    headers: authHeader(apiKey),
  });
  const data = await parseJson<{ items?: RunRecord[]; runs?: RunRecord[] } | RunRecord[]>(
    res,
  );
  if (Array.isArray(data)) return data;
  return data.items ?? data.runs ?? [];
}

export async function getRun(
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<RunRecord> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/runs/${runId}`, {
    headers: authHeader(apiKey),
  });
  const run = await parseJson<RunRecord>(res);
  return { ...run, status: normalizeRunStatus(run.status) };
}

export async function listArtifacts(
  apiKey: string,
  agentId: string,
): Promise<ArtifactRecord[]> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/artifacts`, {
    headers: authHeader(apiKey),
  });
  const data = await parseJson<{ items?: ArtifactRecord[]; artifacts?: ArtifactRecord[] } | ArtifactRecord[]>(
    res,
  );
  if (Array.isArray(data)) return data;
  return data.items ?? data.artifacts ?? [];
}

export async function downloadArtifact(
  apiKey: string,
  agentId: string,
  path: string,
): Promise<string> {
  const encoded = encodeURIComponent(path);

  const metaRes = await fetch(
    `${API_BASE}/agents/${agentId}/artifacts/${encoded}/download`,
    { headers: authHeader(apiKey) },
  );

  if (metaRes.ok) {
    const meta = await metaRes.json() as { url?: string };
    if (meta.url) {
      const contentRes = await fetch(meta.url);
      if (!contentRes.ok) {
        throw new Error(`Artifact fetch ${contentRes.status}`);
      }
      return contentRes.text();
    }
  }

  const directRes = await fetch(
    `${API_BASE}/agents/${agentId}/artifacts/${encoded}`,
    { headers: authHeader(apiKey) },
  );
  if (!directRes.ok) {
    const text = await directRes.text();
    throw new Error(`Artifact download ${directRes.status}: ${text.slice(0, 300)}`);
  }
  return directRes.text();
}

// --- SSE streaming ---

export type StreamEvent =
  | { type: "status"; runId: string; status: string }
  | { type: "assistant"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; callId: string; name: string; status: string; args?: unknown; result?: unknown }
  | { type: "interaction_update"; subtype: string; data: Record<string, unknown> }
  | { type: "heartbeat" }
  | { type: "result"; runId: string; status: string }
  | { type: "error"; code: string; message: string }
  | { type: "done" };

export function streamRun(
  apiKey: string,
  agentId: string,
  runId: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): void {
  const url = `${API_BASE}/agents/${agentId}/runs/${runId}/stream`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${apiKey}:`)}`,
    Accept: "text/event-stream",
  };

  void (async () => {
    try {
      const res = await fetch(url, { headers, signal });
      if (!res.ok || !res.body) {
        onEvent({ type: "error", code: "fetch_failed", message: `Stream HTTP ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            try {
              const data = JSON.parse(raw);
              if (currentEvent === "status") {
                onEvent({ type: "status", runId: data.runId, status: data.status });
              } else if (currentEvent === "assistant") {
                onEvent({ type: "assistant", text: data.text ?? "" });
              } else if (currentEvent === "thinking") {
                onEvent({ type: "thinking", text: data.text ?? "" });
              } else if (currentEvent === "tool_call") {
                onEvent({
                  type: "tool_call",
                  callId: data.callId,
                  name: data.name,
                  status: data.status,
                  args: data.args,
                  result: data.result,
                });
              } else if (currentEvent === "interaction_update") {
                onEvent({ type: "interaction_update", subtype: data.type ?? "", data });
              } else if (currentEvent === "result") {
                onEvent({ type: "result", runId: data.runId, status: data.status });
              } else if (currentEvent === "error") {
                onEvent({ type: "error", code: data.code ?? "unknown", message: data.message ?? "" });
              } else if (currentEvent === "done") {
                onEvent({ type: "done" });
              } else if (currentEvent === "heartbeat") {
                onEvent({ type: "heartbeat" });
              }
            } catch {
              // skip malformed JSON
            }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      onEvent({
        type: "error",
        code: "stream_error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

export async function cancelRun(
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/runs/${runId}/cancel`, {
    method: "POST",
    headers: authHeader(apiKey),
  });
  if (!res.ok && res.status !== 404 && res.status !== 409) {
    const text = await res.text();
    throw new Error(`Cancel run ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function deleteAgent(
  apiKey: string,
  agentId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/agents/${agentId}`, {
    method: "DELETE",
    headers: authHeader(apiKey),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Delete agent ${res.status}: ${text.slice(0, 300)}`);
  }
}
