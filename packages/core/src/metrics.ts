/**
 * AIDE Core - Performance Metrics
 */
import { createLogger, type Logger } from "./logger.js";
import type { MetricEntry } from "./types.js";

export interface MetricTimer {
  stop(success?: boolean, metadata?: Record<string, unknown>): number;
  elapsed(): number;
}

export interface MetricsCollectorOptions {
  maxEntries?: number;
  logger?: Logger;
  onMetric?: (entry: MetricEntry) => void;
}

export class MetricsCollector {
  private entries: MetricEntry[] = [];
  private maxEntries: number;
  private logger: Logger;
  private onMetric?: (e: MetricEntry) => void;

  constructor(o: MetricsCollectorOptions = {}) {
    this.maxEntries = o.maxEntries ?? 1000;
    this.logger = o.logger ?? createLogger({ module: "metrics" });
    this.onMetric = o.onMetric;
  }

  startTimer(command: string): MetricTimer {
    const start = performance.now();
    let stopped = false;
    let lastDuration = 0;

    return {
      // Arrow methods capture `this` from the enclosing method body,
      // so both the parent `MetricsCollector` and the timer state
      // (start/stopped/lastDuration) are visible without aliasing.
      stop: (success = true, metadata?: Record<string, unknown>): number => {
        if (stopped) return lastDuration;
        stopped = true;
        lastDuration = Math.round(performance.now() - start);

        const entry: MetricEntry = {
          timestamp: Date.now(),
          command,
          duration_ms: lastDuration,
          memory_peak_mb: Math.round(
            process.memoryUsage().heapUsed / 1024 / 1024,
          ),
          success,
          metadata,
        };

        this.record(entry);
        return lastDuration;
      },

      elapsed: (): number => {
        return Math.round(performance.now() - start);
      },
    };
  }

  record(entry: MetricEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    this.logger.debug(
      `Metric: ${entry.command} took ${entry.duration_ms}ms (${entry.success ? "ok" : "fail"})`,
    );
    this.onMetric?.(entry);
  }

  getEntries(): MetricEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
