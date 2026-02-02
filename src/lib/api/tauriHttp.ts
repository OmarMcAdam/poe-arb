import { invoke } from "@tauri-apps/api/core";

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function isRetryableError(msg: string) {
  if (msg.includes("http error: 429")) return true;
  if (msg.includes("http error: 5")) return true;
  if (msg.includes("http request failed")) return true;
  if (msg.includes("invalid json")) return true;
  return false;
}

export async function httpGetJson<T>(
  url: string,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 250;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return (await invoke("http_get_json", { url })) as T;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const shouldRetry = attempt < retries && isRetryableError(msg);
      if (!shouldRetry) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}
