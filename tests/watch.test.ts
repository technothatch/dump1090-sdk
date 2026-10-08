import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AircraftResponse, FetchLike } from "../src/index.js";
import { createClient } from "../src/index.js";

const doc: AircraftResponse = {
  now: 1_700_000_000,
  messages: 1234,
  aircraft: [{ hex: "abc123", flight: "TEST123", alt_baro: 31000 }],
};

function okResponse(): Response {
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function okFetch(): FetchLike {
  return async () => okResponse();
}

function failFetch(): FetchLike {
  return () => Promise.reject(new Error("connection refused"));
}

describe("watch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately and then once per refresh interval", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      return okResponse();
    };
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      fetchImpl,
      random: () => 0.5,
    });
    const seen: AircraftResponse[] = [];
    const handle = client.watch((response) => seen.push(response));

    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(1);
    expect(calls[0]).toBe("http://decoder.test/data/aircraft.json");

    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toHaveLength(5);

    handle.stop();
  });

  it("delays the next poll by refreshMs * 1.1 when jitter is fully positive", async () => {
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      jitter: 0.1,
      fetchImpl: okFetch(),
      random: () => 1,
    });
    const seen: AircraftResponse[] = [];
    const handle = client.watch((response) => seen.push(response));

    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(109);
    expect(seen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toHaveLength(2);

    handle.stop();
  });

  it("delays the next poll by refreshMs * 0.9 when jitter is fully negative", async () => {
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      jitter: 0.1,
      fetchImpl: okFetch(),
      random: () => 0,
    });
    const seen: AircraftResponse[] = [];
    const handle = client.watch((response) => seen.push(response));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(89);
    expect(seen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toHaveLength(2);

    handle.stop();
  });

  it("uses the default Math.random when no RNG is supplied", async () => {
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      jitter: 0,
      fetchImpl: okFetch(),
    });
    const seen: AircraftResponse[] = [];
    const handle = client.watch((response) => seen.push(response));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toHaveLength(2);

    handle.stop();
  });

  it("backs off exponentially on failure and clamps at maxBackoffMs", async () => {
    const attempts: number[] = [];
    const errors: unknown[] = [];
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      maxBackoffMs: 250,
      fetchImpl: failFetch(),
      random: () => 0.5,
    });
    const handle = client.watch(
      () => {
        throw new Error("onData must not fire for a failing fetch");
      },
      {
        onError: (error, attempt) => {
          errors.push(error);
          attempts.push(attempt);
        },
      },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toEqual([1]);
    expect(String(errors[0])).toContain("connection refused");

    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(200);
    expect(attempts).toEqual([1, 2, 3]);

    await vi.advanceTimersByTimeAsync(250);
    expect(attempts).toEqual([1, 2, 3, 4]);

    await vi.advanceTimersByTimeAsync(250);
    expect(attempts).toEqual([1, 2, 3, 4, 5]);

    handle.stop();
  });

  it("resets the backoff after a successful poll", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls <= 2) throw new Error("flaky decoder");
      return okResponse();
    };
    const attempts: number[] = [];
    const seen: AircraftResponse[] = [];
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      fetchImpl,
      random: () => 0.5,
    });
    const handle = client.watch((response) => seen.push(response), {
      onError: (_error, attempt) => attempts.push(attempt),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toEqual([1]);
    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(200);
    expect(seen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toHaveLength(2);
    expect(calls).toBe(4);

    handle.stop();
  });

  it("stop() halts polling and is idempotent", async () => {
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      fetchImpl: okFetch(),
      random: () => 0.5,
    });
    const onData = vi.fn();
    const handle = client.watch(onData);

    await vi.advanceTimersByTimeAsync(0);
    expect(onData).toHaveBeenCalledTimes(1);

    handle.stop();
    handle.stop();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops polling when the AbortSignal fires", async () => {
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      fetchImpl: okFetch(),
      random: () => 0.5,
    });
    const onData = vi.fn();
    const controller = new AbortController();
    const handle = client.watch(onData, { signal: controller.signal });

    await vi.advanceTimersByTimeAsync(0);
    expect(onData).toHaveBeenCalledTimes(1);

    controller.abort();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    handle.stop();
  });

  it("never fetches when the signal is already aborted", async () => {
    const fetchImpl = vi.fn<FetchLike>(okFetch());
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      fetchImpl,
      random: () => 0.5,
    });
    const onData = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const handle = client.watch(onData, { signal: controller.signal });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();

    handle.stop();
  });

  it("drops a response that lands after stop()", async () => {
    const deferred: { resolve?: (response: Response) => void } = {};
    const fetchImpl: FetchLike = () =>
      new Promise<Response>((resolve) => {
        deferred.resolve = resolve;
      });
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      fetchImpl,
      random: () => 0.5,
    });
    const onData = vi.fn();
    const handle = client.watch(onData);

    await vi.advanceTimersByTimeAsync(0);
    expect(onData).not.toHaveBeenCalled();

    handle.stop();
    deferred.resolve?.(okResponse());

    await vi.advanceTimersByTimeAsync(1000);
    expect(onData).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not report an error when the first poll succeeds", async () => {
    const onError = vi.fn();
    const client = createClient({
      baseUrl: "http://decoder.test",
      refreshMs: 100,
      fetchImpl: okFetch(),
      random: () => 0.5,
    });
    const handle = client.watch(() => undefined, { onError });

    await vi.advanceTimersByTimeAsync(200);
    expect(onError).not.toHaveBeenCalled();

    handle.stop();
  });
});
