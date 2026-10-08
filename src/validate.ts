/**
 * Runtime validation for dump1090 / readsb JSON payloads.
 *
 * The validators are deliberately tolerant: unknown fields are preserved
 * (decoders add fields regularly), but *known* fields must have the right
 * type — a `lat` that is a string is a bug worth surfacing, an extra
 * `foo` key is not.
 */

import type {
  Aircraft,
  AircraftResponse,
  Receiver,
  StatsResponse,
  StatsWindow,
} from "./types.js";

/** Thrown when a payload does not match the dump1090 JSON contract. */
export class ValidationError extends Error {
  /** JSON-ish path of the offending value, e.g. `$.aircraft[3].lat`. */
  readonly path: string;

  constructor(message: string, path = "$") {
    super(`${path}: ${message}`);
    this.name = "ValidationError";
    this.path = path;
  }
}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string, path: string): never {
  throw new ValidationError(message, path);
}

function expectDict(value: unknown, path: string): Dict {
  if (!isDict(value)) fail("expected an object", path);
  return value;
}

function checkString(obj: Dict, key: string, path: string): void {
  const value = obj[key];
  if (value !== undefined && typeof value !== "string") {
    fail("expected a string", `${path}.${key}`);
  }
}

function checkNumber(obj: Dict, key: string, path: string): void {
  const value = obj[key];
  if (value !== undefined && typeof value !== "number") {
    fail("expected a number", `${path}.${key}`);
  }
}

function checkNumberOrGround(obj: Dict, key: string, path: string): void {
  const value = obj[key];
  if (value !== undefined && value !== "ground" && typeof value !== "number") {
    fail('expected a number or "ground"', `${path}.${key}`);
  }
}

function checkNumberArray(obj: Dict, key: string, path: string): void {
  const value = obj[key];
  if (value === undefined) return;
  if (!Array.isArray(value)) fail("expected an array", `${path}.${key}`);
  value.forEach((item, index) => {
    if (typeof item !== "number") fail("expected numbers", `${path}.${key}[${index}]`);
  });
}

function checkStringArray(obj: Dict, key: string, path: string): void {
  const value = obj[key];
  if (value === undefined) return;
  if (!Array.isArray(value)) fail("expected an array", `${path}.${key}`);
  value.forEach((item, index) => {
    if (typeof item !== "string") fail("expected strings", `${path}.${key}[${index}]`);
  });
}

const AIRCRAFT_NUMBER_FIELDS = [
  "alt_geom",
  "gs",
  "ias",
  "tas",
  "mach",
  "track",
  "track_rate",
  "roll",
  "mag_heading",
  "true_heading",
  "baro_rate",
  "geom_rate",
  "nav_qnh",
  "nav_altitude_mcp",
  "nav_altitude_fms",
  "nav_heading",
  "lat",
  "lon",
  "nic",
  "rc",
  "seen_pos",
  "version",
  "nic_baro",
  "nac_p",
  "nac_v",
  "sil",
  "gva",
  "sda",
  "messages",
  "seen",
  "rssi",
  "alert",
  "spi",
  "wd",
  "ws",
  "oat",
  "tat",
  "dst",
  "dir",
  "dbFlags",
  "rr_lat",
  "rr_lon",
] as const;

const AIRCRAFT_STRING_FIELDS = [
  "type",
  "flight",
  "squawk",
  "emergency",
  "category",
  "sil_type",
  "r",
  "t",
] as const;

const AIRCRAFT_STRING_ARRAY_FIELDS = ["nav_modes", "mlat", "tisb"] as const;

/**
 * Validate a single aircraft object.
 *
 * @throws {ValidationError} when `input` is not an object, has no string
 *   `hex`, or carries a known field of the wrong type.
 */
export function validateAircraft(input: unknown): Aircraft {
  const obj = expectDict(input, "$");
  if (typeof obj["hex"] !== "string") {
    fail('"hex" is required and must be a string', "$.hex");
  }
  for (const key of AIRCRAFT_STRING_FIELDS) checkString(obj, key, "$");
  checkNumberOrGround(obj, "alt_baro", "$");
  for (const key of AIRCRAFT_NUMBER_FIELDS) checkNumber(obj, key, "$");
  for (const key of AIRCRAFT_STRING_ARRAY_FIELDS) checkStringArray(obj, key, "$");
  if (obj["lastPosition"] !== undefined) {
    const last = expectDict(obj["lastPosition"], "$.lastPosition");
    if (typeof last["lat"] !== "number" || typeof last["lon"] !== "number") {
      fail('"lat" and "lon" must be numbers', "$.lastPosition");
    }
  }
  return obj as unknown as Aircraft;
}

/**
 * Validate an `aircraft.json` / `history_NNN.json` document.
 *
 * @throws {ValidationError} when the envelope is wrong or any aircraft is invalid.
 */
export function validateAircraftResponse(input: unknown): AircraftResponse {
  const obj = expectDict(input, "$");
  if (typeof obj["now"] !== "number") fail('"now" is required and must be a number', "$.now");
  if (typeof obj["messages"] !== "number") {
    fail('"messages" is required and must be a number', "$.messages");
  }
  const list = obj["aircraft"];
  if (!Array.isArray(list)) fail('"aircraft" is required and must be an array', "$.aircraft");
  list.forEach((item, index) => {
    try {
      validateAircraft(item);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(error.message.replace("$.", `$.aircraft[${index}].`), error.path);
      }
      throw error;
    }
  });
  return obj as unknown as AircraftResponse;
}

/**
 * Validate a `receiver.json` document.
 *
 * @throws {ValidationError} when `version`/`refresh` are missing or a
 *   known field has the wrong type.
 */
export function validateReceiver(input: unknown): Receiver {
  const obj = expectDict(input, "$");
  if (typeof obj["version"] !== "string") {
    fail('"version" is required and must be a string', "$.version");
  }
  if (typeof obj["refresh"] !== "number") {
    fail('"refresh" is required and must be a number', "$.refresh");
  }
  checkNumber(obj, "lat", "$");
  checkNumber(obj, "lon", "$");
  return obj as unknown as Receiver;
}

const STATS_WINDOWS = ["latest", "last1min", "last5min", "last15min", "total"] as const;
const STATS_NESTED_DICTS = ["remote", "cpu", "cpr", "tracks", "messages"] as const;
const STATS_LOCAL_NUMBERS = [
  "blocks_processed",
  "blocks_dropped",
  "modeac",
  "modes",
  "bad",
  "unknown_icao",
  "signal",
  "peak_signal",
  "strong_signals",
] as const;

function validateStatsDict(obj: Dict, path: string): void {
  for (const value of Object.values(obj)) {
    if (value !== undefined && typeof value !== "number") {
      fail("expected numbers", path);
    }
  }
}

function validateStatsWindow(input: unknown, path: string): StatsWindow {
  const obj = expectDict(input, path);
  if (obj["local"] !== undefined) {
    const local = expectDict(obj["local"], `${path}.local`);
    for (const key of STATS_LOCAL_NUMBERS) checkNumber(local, key, `${path}.local`);
    checkNumberArray(local, "accepted", `${path}.local`);
  }
  for (const key of STATS_NESTED_DICTS) {
    if (obj[key] === undefined) continue;
    const nested = expectDict(obj[key], `${path}.${key}`);
    validateStatsDict(nested, `${path}.${key}`);
  }
  return obj as unknown as StatsWindow;
}

/**
 * Validate a `stats.json` document.
 *
 * @throws {ValidationError} when no known window key is present or a
 *   known field has the wrong type.
 */
export function validateStats(input: unknown): StatsResponse {
  const obj = expectDict(input, "$");
  const present = STATS_WINDOWS.filter((key) => obj[key] !== undefined);
  if (present.length === 0) {
    fail(`expected at least one of ${STATS_WINDOWS.join(", ")}`, "$");
  }
  for (const key of present) validateStatsWindow(obj[key], `$.${key}`);
  for (const key of STATS_NESTED_DICTS) {
    if (obj[key] === undefined) continue;
    const nested = expectDict(obj[key], `$.${key}`);
    validateStatsDict(nested, `$.${key}`);
  }
  return obj as unknown as StatsResponse;
}
