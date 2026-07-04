import { apiClient, pluginPath } from "../api/client";
import type { StatusResponse } from "../types";

let cached: StatusResponse | null = null;
let inflight: Promise<StatusResponse> | null = null;

/** Cached plugin /status (includes sidecar when enabled in CPA config). */
export async function getPluginStatus(): Promise<StatusResponse> {
  if (cached) return cached;
  if (!inflight) {
    inflight = apiClient()
      .get<StatusResponse>(pluginPath("/status"))
      .then((r) => {
        cached = r.data;
        return r.data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Call after reconfigure if status shape may change (optional). */
export function clearPluginStatusCache(): void {
  cached = null;
}