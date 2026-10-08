import { describe, expect, it } from "vitest";
import type { FetchLike } from "../src/index.js";
import { ValidationError, buildApiQuery, createClient } from "../src/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fixedFetch(body: unknown, status = 200): FetchLike {
  return async () => jsonResponse(body, status);
}

function errorFetch(status: number, statusText: string): FetchLike {
  return async () => new Response("nope", { status, statusText });
}

describe("buildApiQuery", () => {
  it("returns an empty string for an empty parameter set", () => {
    expect(buildApiQuery({})).toBe("");
  });

  it("encodes a geographic box as lat1,lon1,lat2,lon2", () => {
    expect(buildApiQuery({ box: [51.0, -1.0, 52.0, 0.5] })).toBe("?box=51,-1,52,0.5");
  });

  it("encodes a circle as lat,lon,radiusNm", () => {
    expect(buildApiQuery({ circle: { lat: 51.5, lon: -0.12, radiusNm: 25 } })).toBe(
      "?circle=51.5,-0.12,25",
    );
  });

  it("normalises find_hex entries (trim, uppercase, drop blanks)", () => {
    expect(buildApiQuery({ findHex: [" abc123 ", "", "def456"] })).toBe(
      "?find_hex=ABC123,DEF456",
    );
  });

  it("omits find_hex when every entry is blank", () => {
    expect(buildApiQuery({ findHex: ["", "   "] })).toBe("");
  });

  it("adds filter_mil only when true", () => {
    expect(buildApiQuery({ filterMil: true })).toBe("?filter_mil");
    expect(buildApiQuery({ filterMil: false })).toBe("");
  });

  it("passes extra parameters through with percent-encoding", () => {
    expect(buildApiQuery({ extra: { "a b": "c&d" } })).toBe("?a%20b=c%26d");
  });

  it("joins every supported parameter in a stable order", () => {
    const query = buildApiQuery({
      box: [1, 2, 3, 4],
      circle: { lat: 5, lon: 6, radiusNm: 7 },
      findHex: ["abc123"],
      filterMil: true,
      extra: { filter: "mil" },
    });
    expect(query).toBe("?box=1,2,3,4&circle=5,6,7&find_hex=ABC123&filter_mil&filter=mil");
  });
});

describe("client.queryApi", () => {
  it("targets the readsb API base URL and parses a bare array result", async () => {
    const captured: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      captured.push(url);
      return jsonResponse([{ hex: "abc123", flight: "TEST123" }]);
    };
    const client = createClient({
      baseUrl: "http://decoder.lan:8080",
      fetchImpl,
    });
    const result = await client.queryApi({ box: [1, 2, 3, 4] });
    expect(client.apiBaseUrl).toBe("http://decoder.lan:8042");
    expect(captured).toEqual(["http://decoder.lan:8042/?box=1,2,3,4"]);
    expect(result.aircraft).toHaveLength(1);
    expect(result.aircraft[0]?.hex).toBe("abc123");
    expect(Array.isArray(result.raw)).toBe(true);
  });

  it("accepts an object envelope with an aircraft array", async () => {
    const fetchImpl = fixedFetch({ now: 1, messages: 2, aircraft: [{ hex: "abc123" }] });
    const client = createClient({ baseUrl: "http://decoder.lan:8080", fetchImpl });
    const result = await client.queryApi({ findHex: ["abc123"] });
    expect(result.aircraft).toHaveLength(1);
    expect((result.raw as { messages?: number }).messages).toBe(2);
  });

  it("rejects a result that is neither an array nor an aircraft envelope", async () => {
    const fetchImpl = fixedFetch({ foo: "bar" });
    const client = createClient({ baseUrl: "http://decoder.lan:8080", fetchImpl });
    await expect(client.queryApi({})).rejects.toThrow(ValidationError);
    await expect(client.queryApi({})).rejects.toThrow(
      "query API returned neither an array nor an object with an aircraft array",
    );
  });

  it("rejects a null or scalar result", async () => {
    const bodies: unknown[] = [null, 7, "readsb"];
    for (const body of bodies) {
      const fetchImpl: FetchLike = async () => jsonResponse(body);
      const client = createClient({ baseUrl: "http://decoder.lan:8080", fetchImpl });
      await expect(client.queryApi({})).rejects.toThrow(ValidationError);
    }
  });

  it("rejects an envelope whose aircraft entry is invalid", async () => {
    const fetchImpl = fixedFetch({ now: 1, messages: 2, aircraft: ["not-an-object"] });
    const client = createClient({ baseUrl: "http://decoder.lan:8080", fetchImpl });
    await expect(client.queryApi({})).rejects.toThrow(ValidationError);
    await expect(client.queryApi({})).rejects.toThrow("expected an object");
  });

  it("honours an explicit apiBaseUrl and per-call abort signal", async () => {
    const captured: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      captured.push(url);
      expect(init?.signal).toBeDefined();
      return jsonResponse([]);
    };
    const client = createClient({
      baseUrl: "http://decoder.lan:8080",
      apiBaseUrl: "http://readsb.lan:8042",
      fetchImpl,
    });
    const controller = new AbortController();
    const result = await client.queryApi({ filterMil: true }, { signal: controller.signal });
    expect(result.aircraft).toEqual([]);
    expect(captured).toEqual(["http://readsb.lan:8042/?filter_mil"]);
  });

  it("propagates HTTP errors from the query API", async () => {
    const fetchImpl = errorFetch(503, "Service Unavailable");
    const client = createClient({ baseUrl: "http://decoder.lan:8080", fetchImpl });
    await expect(client.queryApi({})).rejects.toThrow("HTTP 503 Service Unavailable");
  });
});
