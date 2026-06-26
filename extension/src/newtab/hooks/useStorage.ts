import { useCallback, useEffect, useState } from "react";
import type { StoredSchema } from "../../storage/schema";

export function useStorage<K extends keyof StoredSchema>(
  key: K,
): [StoredSchema[K] | undefined, boolean] {
  const [value, setValue] = useState<StoredSchema[K]>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    chrome.storage.local.get(key, (result) => {
      setValue(result[key] as StoredSchema[K]);
      setLoading(false);
    });
  }, [key]);

  useEffect(() => {
    load();
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local" || !(key in changes)) return;
      setValue(changes[key].newValue as StoredSchema[K]);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [key, load]);

  return [value, loading];
}
