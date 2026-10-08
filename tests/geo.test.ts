import { describe, expect, it } from "vitest";
import { bearingDeg, haversineNm, normalizeLonDelta } from "../src/index.js";

describe("haversineNm", () => {
  it("returns exactly 0 for identical points", () => {
    expect(haversineNm(51.5, -0.12, 51.5, -0.12)).toBe(0);
  });

  it("measures one degree of latitude at about 60 NM", () => {
    expect(haversineNm(0, 0, 1, 0)).toBeCloseTo(60.04, 1);
  });

  it("is symmetric", () => {
    const forward = haversineNm(40.6413, -73.7781, 51.4775, -0.4614);
    const backward = haversineNm(51.4775, -0.4614, 40.6413, -73.7781);
    expect(backward).toBeCloseTo(forward, 9);
  });

  it("puts JFK and LHR about 3006 NM apart", () => {
    const nm = haversineNm(40.6413, -73.7781, 51.4775, -0.4614);
    expect(nm).toBeGreaterThan(2990);
    expect(nm).toBeLessThan(3020);
  });

  it("takes the short way across the antimeridian", () => {
    expect(haversineNm(0, 179.5, 0, -179.5)).toBeCloseTo(60.04, 1);
  });

  it("handles a full quarter circumference", () => {
    expect(haversineNm(0, 0, 90, 0)).toBeCloseTo(5403.6, 0);
  });
});

describe("bearingDeg", () => {
  it("reports due north as 0", () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 6);
  });

  it("reports due east as 90", () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 6);
  });

  it("reports due south as 180", () => {
    expect(bearingDeg(0, 0, -1, 0)).toBeCloseTo(180, 6);
  });

  it("reports due west as 270", () => {
    expect(bearingDeg(0, 0, 0, -1)).toBeCloseTo(270, 6);
  });

  it("stays inside [0, 360)", () => {
    const bearing = bearingDeg(-33.95, 151.18, 35.68, 139.77);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});

describe("normalizeLonDelta", () => {
  it("wraps oversized positive deltas", () => {
    expect(normalizeLonDelta(370)).toBe(10);
  });

  it("wraps oversized negative deltas", () => {
    expect(normalizeLonDelta(-190)).toBe(170);
  });

  it("keeps in-range deltas untouched", () => {
    expect(normalizeLonDelta(0)).toBe(0);
    expect(normalizeLonDelta(45)).toBe(45);
    expect(normalizeLonDelta(-90)).toBe(-90);
  });

  it("maps 180 and -180 onto the same half-open edge", () => {
    expect(normalizeLonDelta(180)).toBe(-180);
    expect(normalizeLonDelta(-180)).toBe(-180);
  });

  it("handles full turns", () => {
    expect(normalizeLonDelta(765)).toBe(45);
    expect(normalizeLonDelta(-720 - 30)).toBe(-30);
  });
});
