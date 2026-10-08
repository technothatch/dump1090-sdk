import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { AircraftResponse } from "../src/index.js";
import { DEFAULT_API_PORT, HttpError, ValidationError, createClient } from "../src/index.js";

const aircraftDoc: AircraftResponse = {
  now: 1_700_000_000.25,
  messages: 987_654,
  aircraft: [
    { hex: "abc123", flight: "LNK1234", alt_baro: 31000, lat: 51.5, lon: -0.12 },
    { hex: "def456", alt_baro: "ground", lat: 51.49, lon: -0.11 },
  ],
};

const receiverDoc = { version: "readsb (git: 4f7ac10)", refresh: 1, lat: 51.5, lon: -0.12 };

const statsDoc = {
  latest: { local: { blocks_processed: 1234, blocks_dropped: 0, modes: 55 } },
  last1min: { local: { modes: 61, accepted: [8000, 8001] }, cpu: { demod: 3.2 } },
  total: { local: { blocks_processed: 4_500_000, blocks_dropped: 12 } },
};

let aircraftStatus = 200;
let aircraftBody = JSON.stringify(aircraftDoc);
let aircraftDelayMs = 0;
const requestPaths: string[] = [];

const server = createServer((req, res) => {
  res.on("error", () => undefined);
  const path = (req.url ?? "/").split("?")[0] ?? "/";
  requestPaths.push(path);
  const json = (status: number, body: string): void => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  };
  if (path === "/data/aircraft.json") {
    const status = aircraftStatus;
    const body = aircraftBody;
    const delay = aircraftDelayMs;
    if (delay > 0) {
      setTimeout(() => json(status, body), delay);
    } else {
      json(status, body);
    }
    return;
  }
  if (path === "/data/receiver.json") {
    json(200, JSON.stringify(receiverDoc));
    return;
  }
  if (path === "/data/stats.json") {
    json(200, JSON.stringify(statsDoc));
    return;
  }
  if (path === "/data/history_000.json" || path === "/data/history_001.json") {
    json(200, JSON.stringify(aircraftDoc));
    return;
  }
  json(404, "not found");
});

let baseUrl = "";

async function rejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

describe("HTTP client against a local stub server", () => {
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    aircraftStatus = 200;
    aircraftBody = JSON.stringify(aircraftDoc);
    aircraftDelayMs = 0;
  });

  it("fetches and validates data/aircraft.json", async () => {
    const client = createClient({ baseUrl });
    const doc = await client.getAircraft();
    expect(doc.aircraft).toHaveLength(2);
    expect(doc.aircraft[0]?.flight).toBe("LNK1234");
    expect(doc.aircraft[1]?.alt_baro).toBe("ground");
    expect(requestPaths.at(-1)).toBe("/data/aircraft.json");
  });

  it("fetches and validates data/receiver.json", async () => {
    const client = createClient({ baseUrl });
    const receiver = await client.getReceiver();
    expect(receiver.version).toContain("readsb");
    expect(receiver.refresh).toBe(1);
    expect(requestPaths.at(-1)).toBe("/data/receiver.json");
  });

  it("fetches and validates data/stats.json", async () => {
    const client = createClient({ baseUrl });
    const stats = await client.getStats();
    expect(stats.latest?.local?.blocks_processed).toBe(1234);
    expect(stats.last1min?.local?.accepted).toEqual([8000, 8001]);
    expect(requestPaths.at(-1)).toBe("/data/stats.json");
  });

  it("zero-pads history chunk filenames", async () => {
    const client = createClient({ baseUrl });
    const first = await client.getHistory(0);
    expect(first.aircraft).toHaveLength(2);
    expect(requestPaths.at(-1)).toBe("/data/history_000.json");

    const second = await client.getHistory(1);
    expect(second.now).toBe(aircraftDoc.now);
    expect(requestPaths.at(-1)).toBe("/data/history_001.json");
  });

  it("rejects out-of-range history indexes without hitting the network", async () => {
    const client = createClient({ baseUrl });
    const before = requestPaths.length;
    await expect(client.getHistory(1000)).rejects.toThrow(RangeError);
    await expect(client.getHistory(-1)).rejects.toThrow(
      "history index must be an integer in [0, 999], got -1",
    );
    await expect(client.getHistory(1.5)).rejects.toThrow(RangeError);
    expect(requestPaths).toHaveLength(before);
  });

  it("surfaces HTTP errors as HttpError with status and URL", async () => {
    const client = createClient({ baseUrl });
    const error = await rejected(client.getHistory(42));
    expect(error).toBeInstanceOf(HttpError);
    const httpError = error as HttpError;
    expect(httpError.status).toBe(404);
    expect(httpError.url).toBe(`${baseUrl}/data/history_042.json`);
    expect(httpError.message).toContain("HTTP 404");
  });

  it("maps a 5xx response onto HttpError", async () => {
    aircraftStatus = 500;
    aircraftBody = "boom";
    const client = createClient({ baseUrl });
    const error = await rejected(client.getAircraft());
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(500);
  });

  it("reports a non-JSON body as SyntaxError", async () => {
    aircraftBody = "<html>gateway sad</html>";
    const client = createClient({ baseUrl });
    await expect(client.getAircraft()).rejects.toThrow(SyntaxError);
    await expect(client.getAircraft()).rejects.toThrow(/invalid JSON/);
  });

  it("fails validation when the payload violates the contract", async () => {
    aircraftBody = JSON.stringify({ now: 1, messages: 2, aircraft: [{ flight: "NOHEX" }] });
    const client = createClient({ baseUrl });
    const error = await rejected(client.getAircraft());
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toContain(
      '$.aircraft[0].hex: "hex" is required and must be a string',
    );
  });

  it("times out a slow response with timeoutMs", async () => {
    aircraftDelayMs = 150;
    const client = createClient({ baseUrl, timeoutMs: 30 });
    await expect(client.getAircraft()).rejects.toThrow(/timed out after 30ms/);
  });

  it("rejects immediately when the caller passes an aborted signal", async () => {
    const client = createClient({ baseUrl });
    const controller = new AbortController();
    controller.abort();
    const error = await rejected(client.getAircraft({ signal: controller.signal }));
    expect(String(error)).toMatch(/abort/i);
  });

  it("aborts an in-flight request when the caller aborts", async () => {
    aircraftDelayMs = 300;
    const client = createClient({ baseUrl });
    const controller = new AbortController();
    const promise = client.getAircraft({ signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    const error = await rejected(promise);
    expect(String(error)).toMatch(/abort/i);
  });

  it("derives the readsb query-API base URL from the decoder host", () => {
    const client = createClient({ baseUrl });
    expect(client.apiBaseUrl).toBe(`http://127.0.0.1:${DEFAULT_API_PORT}`);
  });
});
