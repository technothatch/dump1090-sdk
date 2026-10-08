import { altitudeFt, createClient, distanceNm, isAirborne, isEmergency } from "./src/index.js";

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

const controller = new AbortController();

const handle = client.watch(
  ({ aircraft }) => console.log(`airborne: ${aircraft.filter(isAirborne).length}`),
  {
    signal: controller.signal,
    onError: (error, attempt) => console.error(`poll ${attempt} failed: ${String(error)}`),
  },
);

handle.stop();
controller.abort();

const { aircraft: matched } = await client.queryApi({
  box: [51.0, -1.5, 52.5, 1.0],
  findHex: ["4ca1d8", "e48f1a"],
  filterMil: true,
});
console.log(matched.length);
