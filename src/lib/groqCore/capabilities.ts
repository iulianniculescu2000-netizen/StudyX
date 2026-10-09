/**
 * What the app has learned (in memory, per session) about which provider/model pairs reject
 * optional request parameters — so the next request skips the doomed first try.
 */

/**
 * Provider/model pairs that rejected `response_format` (and then answered without it).
 * In memory for the app session: the next structured request skips the doomed first try.
 */
export const JSON_MODE_UNSUPPORTED = new Set<string>();

/** Provider/model pairs that rejected `stream_options` (and then streamed fine without it). */
export const STREAM_USAGE_UNSUPPORTED = new Set<string>();

/** Test hook: forget what was learned about `response_format` / stream usage support. */
export function resetProviderCapabilityMemory(): void {
  JSON_MODE_UNSUPPORTED.clear();
  STREAM_USAGE_UNSUPPORTED.clear();
}
