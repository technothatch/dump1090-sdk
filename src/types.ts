/**
 * Types for the dump1090 / readsb HTTP API.
 *
 * Field semantics follow the JSON documents produced by dump1090-fa and
 * readsb with `--write-json` (and the servers behind tar1090):
 *
 * - `http://HOST/data/aircraft.json`
 * - `http://HOST/data/receiver.json`
 * - `http://HOST/data/stats.json`
 * - `http://HOST/data/history_NNN.json`
 *
 * Every field except `hex` is optional: the payload varies between builds,
 * receiver configurations and message types.
 */

/** Position snapshot stored alongside an aircraft (older dumps: `lastPosition`). */
export interface LastPosition {
  lat: number;
  lon: number;
  seen_pos?: number;
  nic?: number;
  rc?: number;
}

/** An aircraft object from `aircraft.json`. Only `hex` is guaranteed. */
export interface Aircraft {
  /** ICAO 24-bit address, lowercase hex. Non-ICAO addresses start with `~`. */
  hex: string;
  /** Aircraft type designator (`A320`, `B738`, ...) when decoded from the DB. */
  type?: string;
  /** Callsign / flight identity, trimmed. */
  flight?: string;
  /** Barometric altitude in feet, or `"ground"` for surface positions. */
  alt_baro?: number | "ground";
  /** Geometric altitude in feet. */
  alt_geom?: number;
  /** Ground speed in knots. */
  gs?: number;
  /** Indicated airspeed in knots. */
  ias?: number;
  /** True airspeed in knots. */
  tas?: number;
  /** Mach number. */
  mach?: number;
  /** True track in degrees. */
  track?: number;
  /** Track rate in degrees per second. */
  track_rate?: number;
  /** Bank angle in degrees. */
  roll?: number;
  /** Magnetic heading in degrees. */
  mag_heading?: number;
  /** True heading in degrees. */
  true_heading?: number;
  /** Barometric vertical rate in feet per minute (negative = descent). */
  baro_rate?: number;
  /** Geometric vertical rate in feet per minute. */
  geom_rate?: number;
  /** Mode A squawk — four octal digits as a string (`"7700"`). */
  squawk?: string;
  /** Emergency state: `"none"`, `"general"`, `"lifeguard"`, `"minimumfuel"`, ... */
  emergency?: string;
  /** ADS-B emitter category (`A0`–`A7`, `B0`–`B7`, `C0`–`C7`, `D0`–`D7`). */
  category?: string;
  /** Altimeter setting in hPa. */
  nav_qnh?: number;
  /** MCP selected altitude in feet. */
  nav_altitude_mcp?: number;
  /** FMS selected altitude in feet. */
  nav_altitude_fms?: number;
  /** Selected heading in degrees. */
  nav_heading?: number;
  /** Active navigation modes (`latlon`, `gps`, `vnav`, `hdg`, ...). */
  nav_modes?: string[];
  /** Latitude (WGS-84 degrees). */
  lat?: number;
  /** Longitude (WGS-84 degrees). */
  lon?: number;
  /** Navigation integrity category. */
  nic?: number;
  /** Radius of containment in metres. */
  rc?: number;
  /** Seconds since the last position was received. */
  seen_pos?: number;
  /** ADS-B version (0/1/2). */
  version?: number;
  /** NIC for the barometric altitude. */
  nic_baro?: number;
  /** Navigation accuracy for position (nac_p). */
  nac_p?: number;
  /** Navigation accuracy for velocity (nac_v). */
  nac_v?: number;
  /** Surveillance integrity level. */
  sil?: number;
  /** SIL type (`abs` or `rel`). */
  sil_type?: string;
  /** Geometric vertical accuracy. */
  gva?: number;
  /** Source destination alert. */
  sda?: number;
  /** Data source flags when the position came from MLAT. */
  mlat?: string[];
  /** Data source flags when the position came from TIS-B. */
  tisb?: string[];
  /** Messages received from this aircraft. */
  messages?: number;
  /** Seconds since the last message from this aircraft. */
  seen?: number;
  /** Signal strength in dBFS (negative; closer to 0 is stronger). */
  rssi?: number;
  /** Alert condition active. */
  alert?: number;
  /** Special position indicator. */
  spi?: number;
  /** Wind direction in degrees. */
  wd?: number;
  /** Wind speed in knots. */
  ws?: number;
  /** Outside air temperature in degrees Celsius. */
  oat?: number;
  /** Total air temperature in degrees Celsius. */
  tat?: number;
  /** Distance from the receiver in nautical miles (when calculated). */
  dst?: number;
  /** Bearing from the receiver in degrees. */
  dir?: number;
  /** Registration (`G-EUPB`), if the receiver's aircraft database knows it. */
  r?: string;
  /** ICAO type short code reported by the receiver's database. */
  t?: string;
  /** Receiver-side database flags. */
  dbFlags?: number;
  /** Last known position, for aircraft currently without one. */
  lastPosition?: LastPosition;
  /** Recovered latitude (receiver range rings). */
  rr_lat?: number;
  /** Recovered longitude. */
  rr_lon?: number;
}

/** Top-level shape of `aircraft.json` and `history_NNN.json`. */
export interface AircraftResponse {
  /** Current time on the receiver, in unix seconds. */
  now: number;
  /** Total messages processed since the decoder started. */
  messages: number;
  /** Aircraft currently tracked. */
  aircraft: Aircraft[];
}

/** Shape of `receiver.json`. */
export interface Receiver {
  /** Decoder version string. */
  version: string;
  /** JSON refresh period in seconds. */
  refresh: number;
  /** Receiver latitude in degrees, if set. */
  lat?: number;
  /** Receiver longitude in degrees, if set. */
  lon?: number;
}

/** `stats.json` → `local` subkeys. */
export interface StatsLocal {
  blocks_processed?: number;
  blocks_dropped?: number;
  modeac?: number;
  modes?: number;
  bad?: number;
  unknown_icao?: number;
  accepted?: number[];
  signal?: number;
  peak_signal?: number;
  strong_signals?: number;
}

/** `stats.json` → `remote` subkeys (network feed contributions). */
export interface StatsRemote {
  accepted?: number[];
  bad?: number;
  messages?: number;
  [key: string]: number | number[] | undefined;
}

/** `stats.json` → `cpu` subkeys, percent per stage. */
export interface StatsCpu {
  demod?: number;
  reader?: number;
  background?: number;
}

/** `stats.json` → `cpr` subkeys (decoded position bookkeeping). */
export interface StatsCpr {
  [key: string]: number | undefined;
}

/** `stats.json` → `tracks` subkeys. */
export interface StatsTracks {
  all?: number;
  single_message?: number;
  [key: string]: number | undefined;
}

/** `stats.json` → `messages` subkeys. */
export interface StatsMessages {
  [key: string]: number | undefined;
}

/** One time window inside `stats.json` (`latest`, `last1min`, ...). */
export interface StatsWindow {
  local?: StatsLocal;
  remote?: StatsRemote;
  cpu?: StatsCpu;
  cpr?: StatsCpr;
  tracks?: StatsTracks;
  messages?: StatsMessages;
}

/** Shape of `stats.json`. */
export interface StatsResponse {
  latest?: StatsWindow;
  last1min?: StatsWindow;
  last5min?: StatsWindow;
  last15min?: StatsWindow;
  total?: StatsWindow;
  cpu?: StatsCpu;
  cpr?: StatsCpr;
  tracks?: StatsTracks;
  messages?: StatsMessages;
}

/** `GET /` query API parameters (readsb `--net-api-port`, default 8042). */
export interface QueryParams {
  /** Geographic box: `[lat1, lon1, lat2, lon2]`. */
  box?: readonly [number, number, number, number];
  /** Circular area around a point, radius in nautical miles. */
  circle?: { lat: number; lon: number; radiusNm: number };
  /** One or more ICAO hex addresses to find. */
  findHex?: readonly string[];
  /** Only military aircraft (`filter_mil`). */
  filterMil?: boolean;
  /** Any other query parameter passed through verbatim. */
  extra?: Readonly<Record<string, string>>;
}

/** Normalised result of a query API call. */
export interface QueryResult {
  /** Aircraft matching the query. */
  aircraft: Aircraft[];
  /** The decoded JSON exactly as received. */
  raw: unknown;
}
