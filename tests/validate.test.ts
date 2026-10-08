import { describe, expect, it } from "vitest";
import type { Aircraft } from "../src/index.js";
import {
  ValidationError,
  validateAircraft,
  validateAircraftResponse,
  validateReceiver,
  validateStats,
} from "../src/index.js";

/** Run `fn` and return the ValidationError it threw (fails the test otherwise). */
function caught(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error("expected the call to throw a ValidationError");
}

describe("validateAircraft", () => {
  it("accepts a minimal aircraft that only carries hex", () => {
    const aircraft = validateAircraft({ hex: "4ca1d8" });
    expect(aircraft.hex).toBe("4ca1d8");
  });

  it("preserves unknown extra fields added by newer decoders", () => {
    const aircraft = validateAircraft({ hex: "abc123", futureField: { nested: true } });
    expect((aircraft as unknown as Record<string, unknown>)["futureField"]).toEqual({
      nested: true,
    });
  });

  it("accepts a full realistic aircraft object", () => {
    const aircraft: Aircraft = validateAircraft({
      hex: "4ca1d8",
      type: "A320",
      flight: "RYR8812",
      alt_baro: 34000,
      alt_geom: 34125,
      gs: 462.4,
      ias: 281,
      tas: 475,
      mach: 0.78,
      track: 118.4,
      track_rate: -0.1,
      roll: 1.2,
      mag_heading: 117.9,
      true_heading: 119.4,
      baro_rate: 0,
      geom_rate: -64,
      squawk: "1234",
      emergency: "none",
      category: "A3",
      nav_qnh: 1013.2,
      nav_altitude_mcp: 35000,
      nav_altitude_fms: 34000,
      nav_heading: 118,
      nav_modes: ["latlon", "gps", "vnav"],
      lat: 51.31,
      lon: -0.22,
      nic: 8,
      rc: 1852,
      seen_pos: 0.4,
      version: 2,
      nic_baro: 1,
      nac_p: 10,
      nac_v: 4,
      sil: 3,
      sil_type: "abs",
      gva: 1,
      sda: 2,
      mlat: [],
      tisb: [],
      messages: 4213,
      seen: 1.2,
      rssi: -12.5,
      alert: 0,
      spi: 0,
      wd: 250,
      ws: 42,
      oat: -48,
      tat: -21,
      dst: 34.7,
      dir: 91.2,
      r: "EI-DSD",
      t: "A320",
      dbFlags: 1,
      rr_lat: 51.3,
      rr_lon: -0.2,
      lastPosition: { lat: 51.3, lon: -0.2, seen_pos: 3.5, nic: 8, rc: 1852 },
    });
    expect(aircraft.alt_baro).toBe(34000);
    expect(aircraft.nav_modes).toEqual(["latlon", "gps", "vnav"]);
    expect(aircraft.lastPosition?.lat).toBe(51.3);
  });

  it('accepts alt_baro "ground"', () => {
    expect(validateAircraft({ hex: "abc123", alt_baro: "ground" }).alt_baro).toBe("ground");
  });

  it("rejects non-object inputs", () => {
    for (const input of [null, undefined, "abc", 42, ["abc"]]) {
      expect(() => validateAircraft(input)).toThrow(ValidationError);
      expect(() => validateAircraft(input)).toThrow("$: expected an object");
    }
  });

  it("rejects a missing hex", () => {
    expect(() => validateAircraft({ flight: "TEST1" })).toThrow(
      '$.hex: "hex" is required and must be a string',
    );
  });

  it("rejects a non-string hex", () => {
    expect(() => validateAircraft({ hex: 123456 })).toThrow(
      '$.hex: "hex" is required and must be a string',
    );
  });

  it("rejects a string lat instead of a number", () => {
    const error = caught(() => validateAircraft({ hex: "abc123", lat: "51.5" }));
    expect(error.path).toBe("$.lat");
    expect(error.message).toBe("$.lat: expected a number");
    expect(error.name).toBe("ValidationError");
  });

  it("rejects a numeric flight instead of a string", () => {
    expect(() => validateAircraft({ hex: "abc123", flight: 123 })).toThrow(
      "$.flight: expected a string",
    );
  });

  it('rejects an alt_baro that is neither a number nor "ground"', () => {
    expect(() => validateAircraft({ hex: "abc123", alt_baro: "high" })).toThrow(
      '$.alt_baro: expected a number or "ground"',
    );
  });

  it("rejects a non-array nav_modes", () => {
    expect(() => validateAircraft({ hex: "abc123", nav_modes: "latlon" })).toThrow(
      "$.nav_modes: expected an array",
    );
  });

  it("rejects a nav_modes array containing non-strings", () => {
    expect(() => validateAircraft({ hex: "abc123", nav_modes: ["gps", 4] })).toThrow(
      "$.nav_modes[1]: expected strings",
    );
  });

  it("rejects a non-array mlat list", () => {
    expect(() => validateAircraft({ hex: "abc123", mlat: "latlon" })).toThrow(
      "$.mlat: expected an array",
    );
  });

  it("rejects a non-object lastPosition", () => {
    expect(() => validateAircraft({ hex: "abc123", lastPosition: "51.5" })).toThrow(
      "$.lastPosition: expected an object",
    );
  });

  it("rejects a lastPosition with a string lat", () => {
    expect(() =>
      validateAircraft({ hex: "abc123", lastPosition: { lat: "51.5", lon: -0.2 } }),
    ).toThrow('$.lastPosition: "lat" and "lon" must be numbers');
  });

  it("rejects a lastPosition with a string lon", () => {
    expect(() =>
      validateAircraft({ hex: "abc123", lastPosition: { lat: 51.5, lon: "-0.2" } }),
    ).toThrow('$.lastPosition: "lat" and "lon" must be numbers');
  });

  it("accepts a valid lastPosition", () => {
    const aircraft = validateAircraft({
      hex: "abc123",
      lastPosition: { lat: 51.5, lon: -0.2, seen_pos: 5 },
    });
    expect(aircraft.lastPosition?.lon).toBe(-0.2);
  });
});

describe("validateAircraftResponse", () => {
  it("accepts a valid aircraft.json document", () => {
    const doc = validateAircraftResponse({
      now: 1_700_000_000.5,
      messages: 123456,
      aircraft: [{ hex: "abc123" }, { hex: "def456", alt_baro: "ground" }],
    });
    expect(doc.aircraft).toHaveLength(2);
    expect(doc.messages).toBe(123456);
  });

  it("rejects a missing now", () => {
    expect(() => validateAircraftResponse({ messages: 1, aircraft: [] })).toThrow(
      '$.now: "now" is required and must be a number',
    );
  });

  it("rejects a missing messages", () => {
    expect(() => validateAircraftResponse({ now: 1, aircraft: [] })).toThrow(
      '$.messages: "messages" is required and must be a number',
    );
  });

  it("rejects a non-array aircraft list", () => {
    expect(() => validateAircraftResponse({ now: 1, messages: 2, aircraft: {} })).toThrow(
      '$.aircraft: "aircraft" is required and must be an array',
    );
  });

  it("rejects a non-object envelope", () => {
    expect(() => validateAircraftResponse([])).toThrow("$: expected an object");
  });

  it("points at the offending aircraft index in the message", () => {
    const error = caught(() =>
      validateAircraftResponse({
        now: 1,
        messages: 2,
        aircraft: [{ hex: "abc123" }, { flight: "NOHEX" }],
      }),
    );
    expect(error.message).toContain('$.aircraft[1].hex: "hex" is required and must be a string');
  });
});

describe("validateReceiver", () => {
  it("accepts a receiver.json document with position", () => {
    const receiver = validateReceiver({
      version: "readsb (git: 4f7ac10)",
      refresh: 1,
      lat: 51.5,
      lon: -0.12,
    });
    expect(receiver.version).toContain("readsb");
    expect(receiver.lat).toBe(51.5);
  });

  it("accepts a receiver.json document without position", () => {
    const receiver = validateReceiver({ version: "dump1090-fa 3.8.1", refresh: 2 });
    expect(receiver.version).toBe("dump1090-fa 3.8.1");
    expect(receiver.lat).toBeUndefined();
  });

  it("rejects a missing version", () => {
    expect(() => validateReceiver({ refresh: 1 })).toThrow(
      '$.version: "version" is required and must be a string',
    );
  });

  it("rejects a non-string version", () => {
    expect(() => validateReceiver({ version: 3, refresh: 1 })).toThrow(
      '$.version: "version" is required and must be a string',
    );
  });

  it("rejects a missing refresh", () => {
    expect(() => validateReceiver({ version: "x" })).toThrow(
      '$.refresh: "refresh" is required and must be a number',
    );
  });

  it("rejects a string lat", () => {
    expect(() => validateReceiver({ version: "x", refresh: 1, lat: "51.5" })).toThrow(
      "$.lat: expected a number",
    );
  });

  it("rejects a non-object document", () => {
    expect(() => validateReceiver("receiver")).toThrow("$: expected an object");
  });
});

describe("validateStats", () => {
  it("accepts a stats.json document with several windows", () => {
    const stats = validateStats({
      latest: { local: { blocks_processed: 10, blocks_dropped: 0, modes: 42 } },
      last1min: { local: { modes: 7, accepted: [8000] }, cpu: { demod: 4.5 } },
      total: { local: { blocks_processed: 900_000 } },
    });
    expect(stats.last1min?.local?.modes).toBe(7);
    expect(stats.total?.local?.blocks_processed).toBe(900_000);
  });

  it("accepts nested remote / cpr / tracks / messages dicts of numbers", () => {
    const stats = validateStats({
      last5min: {
        remote: { messages: 12, bad: 3 },
        cpr: { good: 100, fixed: 2 },
        tracks: { all: 44, single_message: 9 },
        messages: { total: 1200 },
      },
    });
    expect(stats.last5min?.tracks?.all).toBe(44);
  });

  it("rejects a document with no window keys at all", () => {
    expect(() => validateStats({})).toThrow(
      "$: expected at least one of latest, last1min, last5min, last15min, total",
    );
  });

  it("rejects a window that is not an object", () => {
    expect(() => validateStats({ total: 5 })).toThrow("$.total: expected an object");
  });

  it("rejects a non-number inside a window local dict", () => {
    expect(() => validateStats({ total: { local: { modes: "42" } } })).toThrow(
      "$.total.local.modes: expected a number",
    );
  });

  it("rejects a non-array accepted counter", () => {
    expect(() => validateStats({ total: { local: { accepted: 12 } } })).toThrow(
      "$.total.local.accepted: expected an array",
    );
  });

  it("rejects an accepted array containing non-numbers", () => {
    expect(() => validateStats({ total: { local: { accepted: [1, "2"] } } })).toThrow(
      "$.total.local.accepted[1]: expected numbers",
    );
  });

  it("rejects a local dict that is not an object", () => {
    expect(() => validateStats({ total: { local: 1 } })).toThrow(
      "$.total.local: expected an object",
    );
  });

  it("rejects a non-number inside a nested cpu dict", () => {
    expect(() => validateStats({ last1min: { cpu: { demod: "4" } } })).toThrow(
      "$.last1min.cpu: expected numbers",
    );
  });

  it("rejects a nested dict that is not an object", () => {
    expect(() => validateStats({ last1min: { cpr: 1 } })).toThrow(
      "$.last1min.cpr: expected an object",
    );
  });

  it("rejects a non-number at the top-level cpu dict", () => {
    expect(() => validateStats({ total: {}, cpu: { demod: "4" } })).toThrow(
      "$.cpu: expected numbers",
    );
  });

  it("rejects a top-level nested dict that is not an object", () => {
    expect(() => validateStats({ total: {}, tracks: 3 })).toThrow(
      "$.tracks: expected an object",
    );
  });

  it("rejects a non-object document", () => {
    expect(() => validateStats(null)).toThrow("$: expected an object");
  });
});
