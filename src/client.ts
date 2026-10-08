/**
 * The dump1090 / readsb HTTP client.
 *
 * Works in Node >= 20 and browsers: the core path only uses `fetch`,
 * `URL`, `AbortController` and timers — no Node-only APIs.
 */

import type {
  AircraftResponse,
  QueryParams,
  QueryResult,
  Receiver,
  StatsResponse,
} from "./types.js";
import { ValidationError, validateAircraft, validateAircraftResponse, validateReceiver, validateStats } from "./validate.js";

/** Default poll interval for `watch()`. */
export const DEFAULT_REFRESH_MS = 2000;

/** Default per-request timeout. */
export const DEFAULT_TIMEOUT_MS = 5000;

/** Default backoff ceiling after repeated `watch()` failures. */
export const DEFAULT_MAX_BACKOFF_MS = 30_000;

/** Default interval jitter fraction (`±10 %`). */
export const DEFAULT_JITTER = 0.1;

/** readsb's default `--net-api-port`. */
export const DEFAULT_API_PORT = 8042;

/** Minimal `fetch` surface — injectable for tests and polyfills. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Options accepted by every client method. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/** Configuration for {@link createClient}. */
export interface ClientOptions {
  /** Decoder base URL, e.g. `http://localhost:8080`. */
  baseUrl: string;
  /** `watch()` poll interval in ms. Default {@link DEFAULT_REFRESH_MS}. */
  refreshMs?: number;
  /** Per-request timeout in ms. Default {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Backoff ceiling in ms. Default {@link DEFAULT_MAX_BACKOFF_MS}. */
  maxBackoffMs?: number;
  /** Interval jitter fraction 0–1. Default {@link DEFAULT_JITTER}. */
  jitter?: number;
  /**
   * Base URL of the readsb query API (`--net-api-port`). Defaults to the
   * same host as `baseUrl` on port {@link DEFAULT_API_PORT}.
   */
  apiBaseUrl?: string;
  /** Custom `fetch` implementation. */
  fetchImpl?: FetchLike;
  /** Custom RNG for jitter (deterministic tests). Default `Math.random`. */
  random?: () => number;
}

/** Options for {@link Client.watch}. */
export interface WatchOptions {
  /** Stop watching when this signal aborts. */
  signal?: AbortSignal;
  /** Called on every failed poll; `attempt` starts at 1. */
  onError?: (error: unknown, attempt: number) => void;
}

/** Handle returned by {@link Client.watch}. */
export interface WatchHandle {
  /** Stop polling and release the timer/listener. Idempotent. */
  stop: () => void;
}

/** A connected dump1090/readsb client. */
export interface Client {
  /** Base URL used for `data/*.json`. */
  readonly baseUrl: string;
  /** Base URL used for the readsb query API. */
  readonly apiBaseUrl: string;
  /** Fetch and validate `data/aircraft.json`. */
  getAircraft(options?: RequestOptions): Promise<AircraftResponse>;
  /** Fetch and validate `data/receiver.json`. */
  getReceiver(options?: RequestOptions): Promise<Receiver>;
  /** Fetch and validate `data/stats.json`. */
  getStats(options?: RequestOptions): Promise<StatsResponse>;
  /** Fetch and validate `data/history_NNN.json` (index 0–999). */
  getHistory(index: number, req?: RequestOptions): Promise<AircraftResponse>;
  /** Query the readsb HTTP API (`?box=`, `?circle=`, `?find_hex=`, ...). */
  queryApi(params: QueryParams, req?: RequestOptions): Promise<QueryResult>;
  /** Poll `aircraft.json` with jitter and backoff. Returns a stop handle. */
  watch(onData: (response: AircraftResponse) => void, options?: WatchOptions): WatchHandle;
}

/** Non-2xx HTTP response. */
export class HttpError extends Error {
  /** HTTP status code. */
  readonly status: number;
  /** Request URL. */
  readonly url: string;

  constructor(status: number, statusText: string, url: string) {
    super(`HTTP ${status} ${statusText || "error"} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

interface InternalRequest {
  signal: AbortSignal | undefined;
  timeoutMs: number;
  fetchImpl: FetchLike;
}

/** Join a base URL and a path without duplicating slashes. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/**
 * Derive the readsb query-API base URL: same host, port 8042, no path.
 * Falls back to the input string when it is not an absolute URL.
 */
export function defaultApiBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.port = String(DEFAULT_API_PORT);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return baseUrl;
  }
}

/** Build the query string for the readsb HTTP API (leading `?`, or `""`). */
export function buildApiQuery(params: QueryParams): string {
  const parts: string[] = [];
  if (params.box !== undefined) {
    const [lat1, lon1, lat2, lon2] = params.box;
    parts.push(`box=${lat1},${lon1},${lat2},${lon2}`);
  }
  if (params.circle !== undefined) {
    const { lat, lon, radiusNm } = params.circle;
    parts.push(`circle=${lat},${lon},${radiusNm}`);
  }
  if (params.findHex !== undefined) {
    const hexes = params.findHex
      .map((hex) => hex.trim().toUpperCase())
      .filter((hex) => hex !== "")
      .join(",");
    if (hexes !== "") parts.push(`find_hex=${hexes}`);
  }
  if (params.filterMil === true) parts.push("filter_mil");
  if (params.extra !== undefined) {
    for (const [key, value] of Object.entries(params.extra)) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function parseQueryResult(raw: unknown): QueryResult {
  if (Array.isArray(raw)) {
    return { aircraft: raw.map((item) => validateAircraft(item)), raw };
  }
  if (raw !== null && typeof raw === "object") {
    const inner = (raw as { aircraft?: unknown }).aircraft;
    if (Array.isArray(inner)) {
      return { aircraft: validateAircraftResponse(raw).aircraft, raw };
    }
  }
  throw new ValidationError(
    "query API returned neither an array nor an object with an aircraft array",
    "$",
  );
}

async function requestJson(url: string, request: InternalRequest): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${request.timeoutMs}ms`));
  }, request.timeoutMs);
  const onAbort = (): void => controller.abort(request.signal?.reason);
  if (request.signal !== undefined) {
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const response = await request.fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new HttpError(response.status, response.statusText, url);
    try {
      return (await response.json()) as unknown;
    } catch (cause) {
      throw new SyntaxError(`invalid JSON from ${url}`, { cause });
    }
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Create a client for a dump1090-fa / readsb HTTP server.
 *
 * ```ts
 * const client = createClient({ baseUrl: "http://localhost:8080" });
 * const { aircraft } = await client.getAircraft();
 * ```
 */
export function createClient(options: ClientOptions): Client {
  const baseUrl = options.baseUrl;
  const refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const jitter = options.jitter ?? DEFAULT_JITTER;
  const apiBaseUrl = options.apiBaseUrl ?? defaultApiBaseUrl(baseUrl);
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const random = options.random ?? Math.random;

  if (refreshMs <= 0 || !Number.isFinite(refreshMs)) {
    throw new RangeError(`refreshMs must be a positive number, got ${refreshMs}`);
  }
  if (jitter < 0 || jitter > 1) {
    throw new RangeError(`jitter must be between 0 and 1, got ${jitter}`);
  }

  async function get(path: string, signal: AbortSignal | undefined): Promise<unknown> {
    return requestJson(joinUrl(baseUrl, path), { signal, timeoutMs, fetchImpl });
  }

  const getAircraft = (req?: RequestOptions): Promise<AircraftResponse> =>
    get("data/aircraft.json", req?.signal).then(validateAircraftResponse);

  const getReceiver = (req?: RequestOptions): Promise<Receiver> =>
    get("data/receiver.json", req?.signal).then(validateReceiver);

  const getStats = (req?: RequestOptions): Promise<StatsResponse> =>
    get("data/stats.json", req?.signal).then(validateStats);

  async function getHistory(index: number, req?: RequestOptions): Promise<AircraftResponse> {
    if (!Number.isInteger(index) || index < 0 || index > 999) {
      throw new RangeError(`history index must be an integer in [0, 999], got ${index}`);
    }
    const path = `data/history_${String(index).padStart(3, "0")}.json`;
    return validateAircraftResponse(await get(path, req?.signal));
  }

  async function queryApi(params: QueryParams, req?: RequestOptions): Promise<QueryResult> {
    const query = buildApiQuery(params);
    const url = `${apiBaseUrl.replace(/\/+$/, "")}/${query}`;
    return parseQueryResult(await requestJson(url, { signal: req?.signal, timeoutMs, fetchImpl }));
  }

  function watch(onData: (response: AircraftResponse) => void, watchOpts: WatchOptions = {}): WatchHandle {
    const signal = watchOpts.signal;
    let stopped = signal?.aborted === true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const schedule = (baseMs: number): void => {
      const drift = jitter * (random() * 2 - 1);
      const delay = Math.max(1, Math.round(baseMs * (1 + drift)));
      timer = setTimeout(() => void tick(), delay);
    };

    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const response = await getAircraft(signal === undefined ? undefined : { signal });
        if (stopped) return;
        failures = 0;
        onData(response);
        schedule(refreshMs);
      } catch (error) {
        if (stopped) return;
        failures += 1;
        watchOpts.onError?.(error, failures);
        schedule(Math.min(refreshMs * 2 ** (failures - 1), maxBackoffMs));
      }
    };

    const stop = (): void => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      signal?.removeEventListener("abort", stop);
    };

    if (!stopped) {
      signal?.addEventListener("abort", stop, { once: true });
      void tick();
    }
    return { stop };
  }

  return { baseUrl, apiBaseUrl, getAircraft, getReceiver, getStats, getHistory, queryApi, watch };
}
