# @aide/guard

> CodeShield — verification pipeline for AI-generated code, plus the smart-model-routing HTTP proxy.

`@aide/guard` has two main surfaces:

1. **Library** — `Verifier`, `HallucinationDetector`, `ASTDiffAnalyzer`, `ConfidenceScorer`, `TestRunner` for verifying AI-generated code in your own pipelines.
2. **Server** — `createProxyServer()` returns a Fastify instance that proxies LLM requests, classifies them by task type, routes them through the optimal provider, and records cost + performance.

## Install

```bash
npm install @aide/guard
```

## Library: verify AI-generated code

```ts
import { Verifier } from '@aide/guard';

const verifier = new Verifier();
const report = await verifier.verify({
  path: './src',
  diff: { base: 'main', head: 'feature/new-api' },
  noTest: false,
});

console.log(report.confidence.verdict); // 'TRUST' | 'REVIEW' | 'REJECT'
```

## Server: smart model routing

```ts
import { createProxyServer, installGracefulShutdown } from '@aide/guard';
import { loadConfig } from '@aide/core';

const config = loadConfig();
const server = await createProxyServer({ config });
await server.listen({ port: 9900, host: '0.0.0.0' });

// Graceful shutdown on SIGINT / SIGTERM (k8s, Docker, systemd)
installGracefulShutdown(server);
```

### Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /v1/chat/completions` | OpenAI-compatible chat proxy |
| `GET /v1/models` | List available models across all enabled providers |
| `POST /v1/guard/verify` | Verify a path, diff, or inline code snippet |
| `GET/POST /v1/guard/rules` | Manage custom hallucination-detection rules |
| `GET/POST /v1/guard/trusted-packages` | Manage trusted-package allowlist |
| `GET /health` | Liveness probe (always 200 unless process is hung) |
| `GET /readyz` | Readiness probe (503 when starting up or shutting down) |
| `GET /metrics` | Prometheus text format (OpenMetrics 1.0), no auth |

### Prometheus metrics

`GET /metrics` exposes the standard `prom-client` default Node.js
process metrics plus eight custom metrics, all prefixed `aide_`:

| Metric | Type | Labels | What it measures |
|---|---|---|---|
| `aide_http_requests_total` | counter | `method`, `route`, `status_code` | Total HTTP requests, status bucketed into 2xx/3xx/4xx/5xx |
| `aide_http_request_duration_seconds` | histogram | `method`, `route` | End-to-end request duration, including proxy overhead |
| `aide_http_requests_in_flight` | gauge | — | Concurrent requests currently being served |
| `aide_upstream_requests_total` | counter | `provider`, `model`, `outcome` | Total upstream LLM calls, outcome ∈ {success, error, timeout} |
| `aide_upstream_request_duration_seconds` | histogram | `provider`, `model` | Full upstream call duration (including retries) |
| `aide_rate_limit_rejections_total` | counter | — | 429s returned by the per-Bearer-token rate limiter |
| `aide_auth_failures_total` | counter | — | 401s returned by the Bearer-token gate |
| `aide_ready_state` | gauge | — | `1` when `/readyz` returns 200, `0` otherwise |

The `route` label is the Fastify route pattern (e.g.
`/v1/chat/completions`) — never the literal request URL — so
cardinality stays bounded.

Scrape with a Prometheus ServiceMonitor (a working example lives
in `deploy/k8s/templates/90-servicemonitor.yaml`) or a vanilla
Prometheus scrape job.

### Security

- Bearer-token auth on every endpoint except `/health` and `/readyz`
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` on every response
- Timing-safe token comparison (no early-return on length mismatch)
- HSTS intentionally **not** set; run behind a TLS-terminating reverse proxy in production

## License

MIT — see [LICENSE](../../LICENSE).
