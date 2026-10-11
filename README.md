# dump1090-sdk

[![CI](https://github.com/technothatch/dump1090-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/technothatch/dump1090-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/technothatch/dump1090-sdk/blob/main/LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/technothatch/dump1090-sdk)](https://github.com/technothatch/dump1090-sdk/releases)
[![Issues](https://img.shields.io/github/issues/technothatch/dump1090-sdk)](https://github.com/technothatch/dump1090-sdk/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/technothatch/dump1090-sdk/pulls)
[![Code size](https://img.shields.io/github/languages/code-size/technothatch/dump1090-sdk)](https://github.com/technothatch/dump1090-sdk)
[![Last commit](https://img.shields.io/github/last-commit/technothatch/dump1090-sdk)](https://github.com/technothatch/dump1090-sdk/commits/main)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![Coverage](https://img.shields.io/badge/coverage-99%25-brightgreen.svg)](https://github.com/technothatch/dump1090-sdk)

Typed client for the HTTP API exposed by [dump1090](https://github.com/flightaware/dump1090)
(dump1090-fa) and [readsb](https://github.com/wiedehopf/readsb) — the decoders that turn an
RTL-SDR dongle into live ADS-B data. Both projects publish JSON (`data/aircraft.json`,
`receiver.json`, `stats.json`, `history_NNN.json`) and readsb adds a query API on port 8042,
but the payloads are loosely specified: every field except `hex` is optional, `alt_baro` is
*either* a number *or* the string `"ground"`, and decoders add keys between releases. This
library gives that contract real TypeScript types plus a runtime validator, so a script,
dashboard or alerting job fails loudly on a malformed payload instead of silently reading
`undefined` — and works unchanged in Node ≥20 and in the browser.

## Features

- **Typed access to every JSON document** — `getAircraft()`, `getReceiver()`,
  `getStats()`, `getHistory(n)` return validated `AircraftResponse` / `Receiver` /
  `StatsResponse` objects, not `any`.
- **Runtime validation with JSON paths** — `validateAircraft()` and friends accept unknown
  extra fields (decoders add them regularly) but reject a *known* field of the wrong type
  with an error like `$.aircraft[3].lat: expected a number`.
- **`"ground"` handled for you** — `altitudeFt()` maps dump1090's surface sentinel to `0`
  ft, and `isAirborne()` treats it as authoritative even alongside a stale `alt_geom`.
- **Geodesy helpers** — haversine `distanceNm()` and `bearingDeg()` in nautical miles, the
  unit the ADS-B world (and dump1090's own `dst`/`dir` fields) uses.
- **`watch()` polling loop** — configurable interval with ±`jitter`, exponential backoff
  capped at `maxBackoffMs`, and clean shutdown through `AbortSignal` or `handle.stop()`.
- **readsb query API** — `queryApi({ box | circle | findHex | filterMil | extra })` builds
  the `?box=…&filter_mil` query for `--net-api-port` and normalises the response, whether
  the server returns a bare array or an `aircraft.json`-style envelope.
- **Emergency helpers** — `isEmergency()` flags squawks 7500/7600/7700 and any non-`none`
  emergency state; `label()` never renders an empty table cell.
- **Zero runtime dependencies, zero Node-only APIs** — the core path uses only `fetch`,
  `URL`, `AbortController` and timers.

## Install

```bash
npm install dump1090-sdk
```

Requires Node 20+ (or any runtime with global `fetch`). Ships its own type declarations —
no `@types/*` needed.

## Quickstart

Fetch, filter and display what is in the air right now:

```ts
import { altitudeFt, createClient, distanceNm, isAirborne, isEmergency } from "dump1090-sdk";

const client = createClient({ baseUrl: "http://192.168.1.10:8080" });

const { now, messages, aircraft } = await client.getAircraft();
console.log(`${aircraft.length} aircraft / ${messages} messages @ ${now}`);

const home = { lat: 51.5, lon: -0.12 };

for (const plane of aircraft.filter(isAirborne)) {
  const nm = distanceNm(plane, home.lat, home.lon);
  if (nm === null || nm > 30) continue;
  const feet = altitudeFt(plane) ?? 0;
  console.log(
    `${(plane.flight ?? plane.hex).padEnd(8)} ${String(feet).padStart(6)} ft  ` +
      `${nm.toFixed(1).padStart(5)} nm  ${plane.squawk ?? "----"}`,
  );
}

for (const plane of aircraft.filter(isEmergency)) {
  console.warn(`EMERGENCY ${plane.hex} squawk ${plane.squawk ?? "?"}`);
}
```

```console
42 aircraft / 158204 messages @ 1759509667
4CA1D8    34000 ft   12.4 nm  1234
EZY81KM  31000 ft   24.9 nm  7277
SWR72UR       0 ft    18.2 nm  3661   ← alt_baro: "ground", altitudeFt → 0
```

Poll it with jitter, backoff and a stop switch:

```ts
const controller = new AbortController();

const handle = client.watch(
  ({ aircraft }) => console.log(`airborne: ${aircraft.filter(isAirborne).length}`),
  {
    signal: controller.signal,
    onError: (error, attempt) => console.error(`poll ${attempt} failed: ${String(error)}`),
  },
);

// later — either works, both are idempotent:
handle.stop();
// controller.abort();
```

Query the readsb API (`--net-api-port 8042`, same host by default):

```ts
const { aircraft } = await client.queryApi({
  box: [51.0, -1.5, 52.5, 1.0],
  findHex: ["4ca1d8", "e48f1a"],
  filterMil: true,
});
// → GET http://192.168.1.10:8042/?box=51,-1.5,52.5,1&find_hex=4CA1D8,E48F1A&filter_mil
```

## Configuration reference

### `createClient(options)`

| Option | Type | Meaning | Default |
| --- | --- | --- | --- |
| `baseUrl` | `string` | Decoder HTTP base URL (the `--write-json` server) | *required* |
| `refreshMs` | `number` | `watch()` poll interval in ms | `2000` |
| `timeoutMs` | `number` | Per-request timeout in ms | `5000` |
| `maxBackoffMs` | `number` | Backoff ceiling after repeated failures, ms | `30000` |
| `jitter` | `number` | Interval jitter fraction `0..1` | `0.1` |
| `apiBaseUrl` | `string` | Base URL of the readsb query API (`--net-api-port`) | same host, port `8042` |
| `fetchImpl` | `FetchLike` | Custom `fetch` (tests, polyfills) | global `fetch` |
| `random` | `() => number` | RNG driving jitter (inject for deterministic tests) | `Math.random` |

Invalid `refreshMs` (`<= 0`, `NaN`) or `jitter` outside `0..1` throws `RangeError` at
construction time.

### `client.watch(onData, options?)`

| Option | Type | Meaning | Default |
| --- | --- | --- | --- |
| `signal` | `AbortSignal` | Stop polling when the signal aborts | — |
| `onError` | `(error, attempt) => void` | Called on every failed poll; `attempt` starts at 1 | — |

### Endpoints and validation

| Method | Request | Validated by |
| --- | --- | --- |
| `getAircraft()` | `GET /data/aircraft.json` | `validateAircraftResponse` |
| `getReceiver()` | `GET /data/receiver.json` | `validateReceiver` |
| `getStats()` | `GET /data/stats.json` | `validateStats` |
| `getHistory(n)` | `GET /data/history_NNN.json` (`n` = 0…999, zero-padded) | `validateAircraftResponse` |
| `queryApi(params)` | `GET /?box=…&circle=…&find_hex=…&filter_mil` on port `8042` | `validateAircraftResponse` / `validateAircraft` |

### Narrowing helpers

| Helper | Returns |
| --- | --- |
| `altitudeFt(a)` | barometric altitude in ft (`"ground"` → `0`), falls back to `alt_geom`, else `null` |
| `isAirborne(a)` | `false` for `"ground"` or no altitude; never guesses |
| `hasPosition(a)` | `true` when both `lat` and `lon` are numbers |
| `distanceNm(a, lat, lon)` | great-circle distance in NM, or `null` without a position |
| `isEmergency(a)` | squawk 7500/7600/7700 or a non-`none` emergency state |
| `label(a)` | trimmed `flight`, falling back to uppercase `hex` |

## How it works

```
   HTTP (fetch)                    validation                 pure helpers
┌──────────────────────────┐  ┌───────────────────────────┐  ┌────────────────────────┐
│ client.ts                │  │ validate.ts               │  │ helpers.ts             │
│  joinUrl → fetch         │  │  tolerant: unknown keys   │  │  altitudeFt  "ground"→0│
│  → timeout (AbortCtrl)   │─▶│  strict : known key types │─▶│  isAirborne             │
│  → !ok ? HttpError       │  │  errors carry JSON paths  │  │  distanceNm ← geo.ts   │
│  → JSON ? : SyntaxError  │  │                           │  │  isEmergency · label    │
└──────────────────────────┘  └───────────────────────────┘  └────────────────────────┘

watch():  poll ──▶ +refreshMs ± jitter ──▶ poll ──▶ …
                    on failure: refreshMs · 2^(n-1), clamped to maxBackoffMs
                    on AbortSignal / stop(): pending timer cleared, loop ends
```

Three layers, each independently testable:

1. **`validate.ts`** knows the dump1090/readsb contract. It never rejects a payload for
   carrying a key it does not recognise — decoders and tar1090 add fields regularly — but a
   `lat` that is a string is a bug worth surfacing, so it throws a `ValidationError` whose
   message pinpoints `$.aircraft[7].lat`.
2. **`client.ts`** owns all I/O: one `fetch` per request, an `AbortController` per request
   (so a caller's signal *and* the timeout both cancel it), `HttpError` for non-2xx,
   `SyntaxError` for unparseable bodies, then validation. `watch()` is a timer loop on top:
   ±`jitter` on every interval, exponential backoff while polls keep failing, and a failure
   counter that resets the moment one succeeds.
3. **`helpers.ts` / `geo.ts`** are pure functions — no clock, no I/O — which is why
   `"ground"` handling and haversine maths can be exhaustively unit-tested without a socket.

The same client runs in Node and in the browser: nothing in the core path uses Node-only
APIs, so a dashboard can `import { createClient } from "dump1090-sdk"` directly.

## Development

```bash
git clone https://github.com/technothatch/dump1090-sdk.git
cd dump1090-sdk
npm ci

npm run lint            # oxlint, --deny-warnings (src + tests)
npm run typecheck       # tsc --noEmit, type-checks src/ and tests/
npm run test            # vitest run
npm run test:coverage   # vitest + v8 coverage (80% thresholds, CI runs this)
npm run build           # tsc -p tsconfig.build.json → dist/
```

The suite covers validator happy/sad paths, `"ground"` altitude handling, haversine and
bearing maths, the `watch()` loop under fake timers (jitter, backoff, abort, late
responses), query-string construction, and real HTTP against a local
`http.createServer` stub — 135 tests at 99% line coverage. CI runs lint, typecheck, tests
with coverage and build on Node 20, 22 and 24.

## Related projects

- [dump1090-fa](https://github.com/flightaware/dump1090) — FlightAware's dump1090, source of the `data/*.json` documents
- [readsb](https://github.com/wiedehopf/readsb) — high-performance fork with the `--net-api-port` query API
- [tar1090](https://github.com/wiedehopf/tar1090) — web UI for readsb/dump1090
- [graphs1090](https://github.com/wiedehopf/graphs1090) — long-term statistics graphs for the same decoder

## License

MIT © technothatch. See [LICENSE](LICENSE).

---

## Related projects

Part of the [technothatch ADS-B toolkit](https://github.com/technothatch/technothatch#readme) - the full index with one-liners for every tool lives there.

- **Run & operate:** [dump1090-stack](https://github.com/technothatch/dump1090-stack) - full Compose stack; [dump1090-healthcheck](https://github.com/technothatch/dump1090-healthcheck) - decoder watchdog; [dump1090-alerts](https://github.com/technothatch/dump1090-alerts) - rule-based alerting
- **Metrics & data:** [dump1090-exporter](https://github.com/technothatch/dump1090-exporter) - Prometheus; [dump1090-influx](https://github.com/technothatch/dump1090-influx) - InfluxDB/Telegraf; [dump1090-grafana](https://github.com/technothatch/dump1090-grafana) - dashboards; [dump1090-recorder](https://github.com/technothatch/dump1090-recorder) - SQLite history; [dump1090-coverage](https://github.com/technothatch/dump1090-coverage) - heatmaps & reports
- **Feeds & networking:** [beast-relay](https://github.com/technothatch/beast-relay) - Beast fan-out; [dump1090-geofence](https://github.com/technothatch/dump1090-geofence) - region-filtered feeds; [dump1090-to-mqtt](https://github.com/technothatch/dump1090-to-mqtt) - MQTT/Home Assistant
- **Interfaces:** [dump1090-dashboard](https://github.com/technothatch/dump1090-dashboard) - web UI; [adsb-tui](https://github.com/technothatch/adsb-tui) - terminal radar; [dump1090-cli](https://github.com/technothatch/dump1090-cli) - aircraft.json CLI; [dump1090-sdk](https://github.com/technothatch/dump1090-sdk) - TypeScript client
- **Testing & decoding:** [dump1090-simulator](https://github.com/technothatch/dump1090-simulator) - synthetic traffic; [dump1090-replay](https://github.com/technothatch/dump1090-replay) - recorded history replay; [squawk-decoder](https://github.com/technothatch/squawk-decoder) - squawk/emitter/ICAO decoder
