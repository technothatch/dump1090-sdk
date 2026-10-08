import { describe, expect, it } from "vitest";
import type { Aircraft } from "../src/index.js";
import {
  altitudeFt,
  distanceNm,
  hasPosition,
  isAirborne,
  isEmergency,
  label,
} from "../src/index.js";

describe("altitudeFt", () => {
  it('maps the "ground" sentinel to 0 ft', () => {
    const aircraft: Aircraft = { hex: "abc123", alt_baro: "ground" };
    expect(altitudeFt(aircraft)).toBe(0);
  });

  it('prefers "ground" over a stale alt_geom', () => {
    const aircraft: Aircraft = { hex: "abc123", alt_baro: "ground", alt_geom: 3400 };
    expect(altitudeFt(aircraft)).toBe(0);
  });

  it("returns the barometric altitude when it is a number", () => {
    const aircraft: Aircraft = { hex: "abc123", alt_baro: 34000, alt_geom: 34125 };
    expect(altitudeFt(aircraft)).toBe(34000);
  });

  it("falls back to the geometric altitude when baro is missing", () => {
    const aircraft: Aircraft = { hex: "abc123", alt_geom: 12500 };
    expect(altitudeFt(aircraft)).toBe(12500);
  });

  it("returns null when the decoder reports no altitude at all", () => {
    expect(altitudeFt({ hex: "abc123" })).toBeNull();
  });
});

describe("isAirborne", () => {
  it('treats a "ground" aircraft as not airborne', () => {
    expect(isAirborne({ hex: "abc123", alt_baro: "ground" })).toBe(false);
  });

  it('treats a "ground" aircraft as not airborne even with alt_geom', () => {
    expect(isAirborne({ hex: "abc123", alt_baro: "ground", alt_geom: 900 })).toBe(false);
  });

  it("treats a numeric baro altitude as airborne", () => {
    expect(isAirborne({ hex: "abc123", alt_baro: 10500 })).toBe(true);
  });

  it("treats a geometric-only altitude as airborne", () => {
    expect(isAirborne({ hex: "abc123", alt_geom: 3000 })).toBe(true);
  });

  it("never guesses when no altitude is known", () => {
    expect(isAirborne({ hex: "abc123" })).toBe(false);
  });
});

describe("hasPosition", () => {
  it("is true when both lat and lon are present", () => {
    expect(hasPosition({ hex: "abc123", lat: 51.5, lon: -0.12 })).toBe(true);
  });

  it("is false without any position", () => {
    expect(hasPosition({ hex: "abc123" })).toBe(false);
  });

  it("is false when only the latitude is known", () => {
    expect(hasPosition({ hex: "abc123", lat: 51.5 })).toBe(false);
  });

  it("is false when only the longitude is known", () => {
    expect(hasPosition({ hex: "abc123", lon: -0.12 })).toBe(false);
  });
});

describe("distanceNm", () => {
  it("measures the aircraft position against a reference point", () => {
    const aircraft: Aircraft = { hex: "abc123", lat: 51.5, lon: -0.12 };
    const nm = distanceNm(aircraft, 51.5, -0.12);
    expect(nm).toBe(0);
  });

  it("returns about 60 NM for one degree of latitude", () => {
    const aircraft: Aircraft = { hex: "abc123", lat: 52.0, lon: 10.0 };
    expect(distanceNm(aircraft, 51.0, 10.0)).toBeCloseTo(60.04, 1);
  });

  it("returns null when the aircraft has no position", () => {
    expect(distanceNm({ hex: "abc123" }, 51.5, -0.12)).toBeNull();
  });

  it("returns null when only one coordinate is present", () => {
    expect(distanceNm({ hex: "abc123", lat: 51.5 }, 51.5, -0.12)).toBeNull();
  });
});

describe("isEmergency", () => {
  it("recognises the ICAO emergency squawks", () => {
    for (const squawk of ["7500", "7600", "7700"]) {
      expect(isEmergency({ hex: "abc123", squawk })).toBe(true);
    }
  });

  it("recognises a non-none emergency state", () => {
    expect(isEmergency({ hex: "abc123", emergency: "general" })).toBe(true);
  });

  it("ignores emergency: none with a routine squawk", () => {
    expect(isEmergency({ hex: "abc123", emergency: "none", squawk: "1000" })).toBe(false);
  });

  it("is false when nothing is reported", () => {
    expect(isEmergency({ hex: "abc123" })).toBe(false);
  });
});

describe("label", () => {
  it("uses the trimmed callsign when present", () => {
    expect(label({ hex: "4ca1d8", flight: "  BAW117 " })).toBe("BAW117");
  });

  it("falls back to the uppercase hex when there is no callsign", () => {
    expect(label({ hex: "4ca1d8" })).toBe("4CA1D8");
  });

  it("falls back to the hex when the callsign is blank", () => {
    expect(label({ hex: "4ca1d8", flight: "   " })).toBe("4CA1D8");
  });
});
