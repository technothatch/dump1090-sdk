/**
 * Narrowing helpers for `Aircraft` objects.
 *
 * These are deliberately tiny and pure: they encode the awkward corners of
 * the dump1090 JSON contract (notably `alt_baro` being a number *or*
 * the literal string `"ground"`).
 */

import { haversineNm } from "./geo.js";
import type { Aircraft } from "./types.js";

/**
 * Barometric altitude in feet, or `null` when the aircraft reports none.
 *
 * `"ground"` — dump1090/readsb's sentinel for a surface track — is treated
 * as `0` ft so arithmetic and thresholds work without special-casing.
 */
export function altitudeFt(aircraft: Aircraft): number | null {
  const alt = aircraft.alt_baro;
  if (alt === "ground") return 0;
  if (typeof alt === "number") return alt;
  if (typeof aircraft.alt_geom === "number") return aircraft.alt_geom;
  return null;
}

/**
 * `true` when the aircraft is known to be airborne.
 *
 * A `"ground"` altitude always wins (even alongside a stale `alt_geom`);
 * if the decoder reports no altitude at all the answer is `false` — we
 * never guess.
 */
export function isAirborne(aircraft: Aircraft): boolean {
  if (aircraft.alt_baro === "ground") return false;
  return typeof aircraft.alt_baro === "number" || typeof aircraft.alt_geom === "number";
}

/**
 * `true` when the aircraft has a decoded WGS-84 position.
 */
export function hasPosition(aircraft: Aircraft): boolean {
  return typeof aircraft.lat === "number" && typeof aircraft.lon === "number";
}

/**
 * Great-circle distance in nautical miles from the aircraft to a point,
 * or `null` when the aircraft has no position.
 */
export function distanceNm(aircraft: Aircraft, lat: number, lon: number): number | null {
  if (!hasPosition(aircraft) || typeof aircraft.lat !== "number" || typeof aircraft.lon !== "number") {
    return null;
  }
  return haversineNm(aircraft.lat, aircraft.lon, lat, lon);
}

/**
 * `true` when the aircraft reports an emergency squawk (`7500`, `7600`,
 * `7700`) or a non-`"none"` emergency state.
 */
export function isEmergency(aircraft: Aircraft): boolean {
  if (aircraft.emergency !== undefined && aircraft.emergency !== "none") return true;
  return aircraft.squawk === "7500" || aircraft.squawk === "7600" || aircraft.squawk === "7700";
}

/**
 * The aircraft's callsign if it has one, otherwise its hex address.
 * Useful as a table label that never renders empty.
 */
export function label(aircraft: Aircraft): string {
  const flight = aircraft.flight?.trim();
  return flight !== undefined && flight !== "" ? flight : aircraft.hex.toUpperCase();
}
