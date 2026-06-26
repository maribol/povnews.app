/** Send a message to the MV3 service worker with clear errors when it is asleep. */
export async function sendToWorker<T extends { ok?: boolean }>(
  message: Record<string, unknown>,
): Promise<T> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as T | undefined;
    if (res === undefined) {
      throw new Error(
        "Extension background did not respond. Reload the extension at chrome://extensions and try again.",
      );
    }
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("Receiving end does not exist") ||
      msg.includes("Could not establish connection")
    ) {
      throw new Error(
        "Background service worker is inactive. Reload the extension, then retry.",
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}
