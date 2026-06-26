import { useEffect, useState } from "react";
import type { ActivityEntry } from "../../storage/schema";

function coalesceEntries(entries: ActivityEntry[]): ActivityEntry[] {
  const result: ActivityEntry[] = [];
  for (const entry of entries) {
    const last = result[result.length - 1];
    if (
      last &&
      last.kind === entry.kind &&
      (entry.kind === "thinking" || entry.kind === "assistant")
    ) {
      result[result.length - 1] = { ...last, text: last.text + entry.text, ts: entry.ts };
    } else {
      result.push(entry);
    }
  }
  return result;
}

export function useAgentActivity(active: boolean, seed: ActivityEntry[] = []) {
  const [log, setLog] = useState<ActivityEntry[]>(seed);

  // The persisted `seed` is only the source of truth when no live port is
  // connected (historical/finished run, or before storage has loaded). While
  // active, the port streams the full log — adopting `seed` there would wipe
  // the rich live feed with the worker's condensed snapshot on every storage
  // write, clearing messages and causing scroll flicker.
  useEffect(() => {
    if (active) return;
    setLog((prev) => (prev.length === 0 ? seed : prev));
  }, [active, seed]);

  useEffect(() => {
    if (!active) return;

    const port = chrome.runtime.connect({ name: "agent-activity" });
    port.onMessage.addListener((msg: { type: string; log?: ActivityEntry[]; entry?: ActivityEntry }) => {
      if (msg.type === "AGENT_ACTIVITY_SNAPSHOT" && msg.log) {
        setLog(coalesceEntries(msg.log));
      } else if (msg.type === "AGENT_ACTIVITY" && msg.entry) {
        setLog((prev) => {
          const entry = msg.entry!;
          if (
            (entry.kind === "thinking" || entry.kind === "assistant") &&
            prev.length > 0 &&
            prev[prev.length - 1].kind === entry.kind
          ) {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              text: next[next.length - 1].text + entry.text,
              ts: entry.ts,
            };
            return next;
          }
          const next = [...prev, entry];
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
    });

    return () => port.disconnect();
  }, [active]);

  return log;
}
