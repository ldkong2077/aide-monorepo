# @aide/core

> Shared primitives: types, config loading, structured logging, error types, metrics, and the SQLite storage helper.

Most `@aide/*` packages depend on `@aide/core`. It has no AI/LLM dependencies of its own.

## Install

```bash
npm install @aide/core
```

## What's in here

- **`loadConfig()` / `saveConfig()`** — multi-level YAML config with `${ENV}` expansion
- **`createLogger({ module })`** — pino-based structured logger
- **`MetricsCollector`** — in-memory ring buffer of command timings, with `startTimer`/`stop` API
- **`AideError` / `ValidationError` / `ConfigError`** — typed error hierarchy
- **`SQLiteStorage`** — shared `better-sqlite3` wrapper used by `guard` and `graph`
- **Type definitions** for `AppConfig`, `ChatMessage`, `ProviderConfig`, `VerificationReport`, `CostRecord`, etc.

## Usage

```ts
import { loadConfig, createLogger, MetricsCollector } from '@aide/core';

const config = loadConfig();
const log = createLogger({ module: 'my-feature' });
const metrics = new MetricsCollector();

const timer = metrics.startTimer('expensive-op');
try {
  await doWork();
  timer.stop(true);
} catch (e) {
  timer.stop(false, { error: String(e) });
  log.error({ err: e }, 'op failed');
}
```

## License

MIT — see [LICENSE](../../LICENSE).
