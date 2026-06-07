/**
 * @aide-dev/guard — Proxy readiness flag.
 *
 * Kubernetes and other orchestrators differentiate liveness from readiness:
 *  - Liveness (`/health`): "is the process responding?" — never gate this on
 *    upstream health, otherwise a transient provider outage will get the
 *    pod killed and restarted.
 *  - Readiness (`/readyz`): "should I receive traffic right now?" — must
 *    be 200 only when the server is fully initialised AND not on its way
 *    down. The pod's endpoint is removed from the Service when this
 *    returns 503, so any in-flight rolling update is drained cleanly.
 *
 * The flag is process-global because there is exactly one proxy per
 * Node.js process. Tests reset it via `__resetForTests()`.
 */

let started = false;
let shuttingDown = false;

export const readiness = {
  markStarted(): void {
    started = true;
  },
  markShuttingDown(): void {
    shuttingDown = true;
  },
  isReady(): boolean {
    return started && !shuttingDown;
  },
  hasStarted(): boolean {
    return started;
  },
  isShuttingDown(): boolean {
    return shuttingDown;
  },
  /** Exposed for tests; do not call from production code. */
  __resetForTests(): void {
    started = false;
    shuttingDown = false;
  },
};
