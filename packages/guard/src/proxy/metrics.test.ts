/**
 * Tests for `createMetrics()` — verifies that the bundle is isolated
 * per-call, that all custom metrics are registered with the right
 * name and type, and that the Prometheus text output contains the
 * expected HELP / TYPE / sample lines.
 */
import { describe, it, expect } from "vitest";
import {
  createMetrics,
  METRIC_HTTP_REQUESTS_TOTAL,
  METRIC_HTTP_REQUEST_DURATION_SECONDS,
  METRIC_HTTP_REQUESTS_IN_FLIGHT,
  METRIC_UPSTREAM_REQUESTS_TOTAL,
  METRIC_UPSTREAM_REQUEST_DURATION_SECONDS,
  METRIC_RATE_LIMIT_REJECTIONS_TOTAL,
  METRIC_AUTH_FAILURES_TOTAL,
  METRIC_READY_STATE,
  bucketStatusCode,
} from "./metrics.js";

describe("bucketStatusCode", () => {
  it("classifies 2xx responses", () => {
    expect(bucketStatusCode(200)).toBe("2xx");
    expect(bucketStatusCode(204)).toBe("2xx");
    expect(bucketStatusCode(299)).toBe("2xx");
  });
  it("classifies 3xx responses", () => {
    expect(bucketStatusCode(301)).toBe("3xx");
    expect(bucketStatusCode(304)).toBe("3xx");
  });
  it("classifies 4xx responses", () => {
    expect(bucketStatusCode(400)).toBe("4xx");
    expect(bucketStatusCode(401)).toBe("4xx");
    expect(bucketStatusCode(429)).toBe("4xx");
    expect(bucketStatusCode(499)).toBe("4xx");
  });
  it("classifies 5xx responses", () => {
    expect(bucketStatusCode(500)).toBe("5xx");
    expect(bucketStatusCode(502)).toBe("5xx");
    expect(bucketStatusCode(599)).toBe("5xx");
  });
  it("classifies undefined / 0 as the synthetic xxx bucket", () => {
    expect(bucketStatusCode(undefined)).toBe("xxx");
    expect(bucketStatusCode(0)).toBe("xxx");
  });
});

describe("createMetrics", () => {
  it("returns a fresh, isolated registry per call", async () => {
    const a = createMetrics();
    const b = createMetrics();

    a.httpRequests.inc({ method: "GET", route: "/x", status_code: "2xx" });
    a.rateLimitRejections.inc();

    const aText = await a.toText();
    const bText = await b.toText();

    // Counter only present in a, not in b.
    expect(aText).toContain("aide_http_requests_total{");
    expect(bText).not.toContain("aide_http_requests_total{");
    expect(aText).toMatch(/aide_http_requests_total\{[^}]*\}\s+1/);
    expect(bText).not.toMatch(/aide_http_requests_total\{[^}]*\}\s+[1-9]/);

    // Rate-limit counter is independent.
    expect(aText).toMatch(/aide_rate_limit_rejections_total\s+1/);
    expect(bText).toMatch(/aide_rate_limit_rejections_total\s+0/);
  });

  it("registers all eight custom aide_* metrics with correct names", async () => {
    const m = createMetrics();
    const text = await m.toText();

    // The Prometheus text format prefixes each metric with `# HELP`
    // and `# TYPE` lines. Check that each custom metric is exported.
    for (const name of [
      METRIC_HTTP_REQUESTS_TOTAL,
      METRIC_HTTP_REQUEST_DURATION_SECONDS,
      METRIC_HTTP_REQUESTS_IN_FLIGHT,
      METRIC_UPSTREAM_REQUESTS_TOTAL,
      METRIC_UPSTREAM_REQUEST_DURATION_SECONDS,
      METRIC_RATE_LIMIT_REJECTIONS_TOTAL,
      METRIC_AUTH_FAILURES_TOTAL,
      METRIC_READY_STATE,
    ]) {
      expect(text).toContain(`# HELP ${name}`);
      expect(text).toContain(`# TYPE ${name}`);
    }
  });

  it("collects default Node.js process metrics", async () => {
    const m = createMetrics();
    const text = await m.toText();

    // `process_cpu_seconds_total` and `nodejs_eventloop_lag_seconds`
    // are part of the prom-client default metrics set.
    expect(text).toContain("process_cpu_seconds_total");
    expect(text).toContain("nodejs_eventloop_lag_seconds");
  });

  it("aide_http_request_duration_seconds observes a value into the right bucket", async () => {
    const m = createMetrics();
    m.httpDuration.observe(
      { method: "POST", route: "/v1/chat/completions" },
      0.12,
    );
    const text = await m.toText();

    // Histogram buckets are cumulative with `le` (less-than-or-equal).
    // 0.12 falls into `le=0.25` (the smallest bucket boundary ≥ 0.12).
    // prom-client emits labels sorted alphabetically, so the actual
    // line is `le="...",method="POST",route="..."`.
    expect(text).toMatch(
      /aide_http_request_duration_seconds_bucket\{le="0\.25",method="POST",route="\/v1\/chat\/completions"\}\s+1/,
    );
  });

  it("aide_upstream_requests_total is labelled by provider, model, and outcome", async () => {
    const m = createMetrics();
    m.upstreamRequests.inc({
      provider: "openai",
      model: "gpt-4o-mini",
      outcome: "success",
    });
    m.upstreamRequests.inc({
      provider: "openai",
      model: "gpt-4o-mini",
      outcome: "timeout",
    });
    m.upstreamRequests.inc({
      provider: "openai",
      model: "gpt-4o-mini",
      outcome: "error",
    });

    const text = await m.toText();
    expect(text).toMatch(
      /aide_upstream_requests_total\{provider="openai",model="gpt-4o-mini",outcome="success"\}\s+1/,
    );
    expect(text).toMatch(
      /aide_upstream_requests_total\{provider="openai",model="gpt-4o-mini",outcome="timeout"\}\s+1/,
    );
    expect(text).toMatch(
      /aide_upstream_requests_total\{provider="openai",model="gpt-4o-mini",outcome="error"\}\s+1/,
    );
  });

  it("aide_ready_state gauge updates", async () => {
    const m = createMetrics();
    m.readyState.set(0);
    expect(await m.toText()).toMatch(/aide_ready_state\s+0/);
    m.readyState.set(1);
    expect(await m.toText()).toMatch(/aide_ready_state\s+1/);
  });

  it("aide_http_requests_in_flight is registered and starts at 0", async () => {
    const m = createMetrics();
    m.httpInFlight.inc();
    m.httpInFlight.inc();
    m.httpInFlight.dec();
    const text = await m.toText();
    expect(text).toMatch(/aide_http_requests_in_flight\s+1/);
  });
});
