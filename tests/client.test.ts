import { describe, expect, it } from "vitest";
import {
  DEFAULT_API_PORT,
  DEFAULT_JITTER,
  DEFAULT_MAX_BACKOFF_MS,
  DEFAULT_REFRESH_MS,
  DEFAULT_TIMEOUT_MS,
  HttpError,
  createClient,
  defaultApiBaseUrl,
  joinUrl,
} from "../src/index.js";

describe("createClient options", () => {
  it("exposes the configured base URLs", () => {
    const client = createClient({ baseUrl: "http://192.168.1.10:8080" });
    expect(client.baseUrl).toBe("http://192.168.1.10:8080");
    expect(client.apiBaseUrl).toBe("http://192.168.1.10:8042");
  });

  it("keeps an explicit apiBaseUrl untouched", () => {
    const client = createClient({
      baseUrl: "http://decoder:8080",
      apiBaseUrl: "http://decoder:9000/",
    });
    expect(client.apiBaseUrl).toBe("http://decoder:9000/");
  });

  it("exports sane defaults", () => {
    expect(DEFAULT_REFRESH_MS).toBe(2000);
    expect(DEFAULT_TIMEOUT_MS).toBe(5000);
    expect(DEFAULT_MAX_BACKOFF_MS).toBe(30_000);
    expect(DEFAULT_JITTER).toBe(0.1);
    expect(DEFAULT_API_PORT).toBe(8042);
  });

  it("rejects a non-positive refreshMs", () => {
    expect(() => createClient({ baseUrl: "http://x", refreshMs: 0 })).toThrow(RangeError);
    expect(() => createClient({ baseUrl: "http://x", refreshMs: -5 })).toThrow(RangeError);
    expect(() => createClient({ baseUrl: "http://x", refreshMs: Number.NaN })).toThrow(
      RangeError,
    );
  });

  it("rejects a jitter outside 0..1", () => {
    expect(() => createClient({ baseUrl: "http://x", jitter: -0.01 })).toThrow(RangeError);
    expect(() => createClient({ baseUrl: "http://x", jitter: 1.5 })).toThrow(RangeError);
    expect(() => createClient({ baseUrl: "http://x", jitter: 0 })).not.toThrow();
    expect(() => createClient({ baseUrl: "http://x", jitter: 1 })).not.toThrow();
  });
});

describe("joinUrl", () => {
  it("joins without duplicating slashes", () => {
    expect(joinUrl("http://localhost:8080", "data/aircraft.json")).toBe(
      "http://localhost:8080/data/aircraft.json",
    );
  });

  it("strips trailing slashes from the base", () => {
    expect(joinUrl("http://localhost:8080///", "data/aircraft.json")).toBe(
      "http://localhost:8080/data/aircraft.json",
    );
  });

  it("strips leading slashes from the path", () => {
    expect(joinUrl("http://localhost:8080", "/data/aircraft.json")).toBe(
      "http://localhost:8080/data/aircraft.json",
    );
  });
});

describe("defaultApiBaseUrl", () => {
  it("moves the host onto the readsb API port and drops any path", () => {
    expect(defaultApiBaseUrl("http://localhost:8080")).toBe("http://localhost:8042");
    expect(defaultApiBaseUrl("http://decoder.lan:8080/dump1090/")).toBe(
      "http://decoder.lan:8042",
    );
    expect(defaultApiBaseUrl("https://feed.example.com")).toBe("https://feed.example.com:8042");
  });

  it("returns the input untouched when it is not an absolute URL", () => {
    expect(defaultApiBaseUrl("not a url")).toBe("not a url");
  });
});

describe("HttpError", () => {
  it("formats status, status text and URL", () => {
    const error = new HttpError(404, "Not Found", "http://localhost/data/x.json");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("HttpError");
    expect(error.status).toBe(404);
    expect(error.url).toBe("http://localhost/data/x.json");
    expect(error.message).toBe("HTTP 404 Not Found for http://localhost/data/x.json");
  });

  it("falls back to 'error' when the status text is empty", () => {
    const error = new HttpError(418, "", "http://localhost/teapot");
    expect(error.message).toBe("HTTP 418 error for http://localhost/teapot");
  });
});
