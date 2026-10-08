/**
 * Geodesy helpers — great-circle maths only, no I/O, no globals.
 *
 * Distances are returned in nautical miles because that is what the
 * ADS-B world (and dump1090's `dst`/`dir` fields) uses.
 */

/** IUGG mean Earth radius in kilometres. */
const EARTH_RADIUS_KM = 6371.0088;

/** Kilometres per nautical mile. */
const KM_PER_NM = 1.852;

/** Degrees → radians. */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two WGS-84 points, in nautical miles.
 *
 * Uses the haversine formula; accurate to ~0.1 % which is far better than
 * any ADS-B position report's own error budget.
 */
export function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (EARTH_RADIUS_KM * c) / KM_PER_NM;
}

/**
 * Initial (forward) bearing from point 1 to point 2, in degrees `[0, 360)`.
 */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Longitude delta normalised into `[-180, 180)` so that routes across the
 * antimeridian take the short way round.
 */
export function normalizeLonDelta(deltaDeg: number): number {
  const wrapped = ((deltaDeg + 180) % 360 + 360) % 360 - 180;
  return wrapped;
}
