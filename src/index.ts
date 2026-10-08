/**
 * Typed client library for the dump1090 / readsb HTTP API.
 *
 * @example
 * ```ts
 * import { createClient, isAirborne, distanceNm } from "dump1090-sdk";
 *
 * const client = createClient({ baseUrl: "http://localhost:8080" });
 * const { aircraft } = await client.getAircraft();
 * const airborne = aircraft.filter(isAirborne);
 * ```
 */

export * from "./types.js";
export * from "./geo.js";
export * from "./helpers.js";
export * from "./validate.js";
export * from "./client.js";
