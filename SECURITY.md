# Security Policy

## Supported Versions

AIDE follows a 1-release-window security support policy. Only the
latest minor version receives security patches; the previous minor
version receives security patches for 90 days after the next minor
is released. Older versions are end-of-life.

| Version                | Supported                        |
| ---------------------- | -------------------------------- |
| Latest minor (`1.x.y`) | :white_check_mark: Active        |
| Previous minor         | :shield: Security-only (90 days) |
| Older                  | :x: End-of-life                  |

The current version is **1.0.0** — see the
[releases page](https://github.com/ldkong2077/aide-monorepo/releases) for what
ships in each version.

## Reporting a Vulnerability

**Preferred channel: GitHub private security advisory.**

[Open a private advisory](https://github.com/ldkong2077/aide-monorepo/security/advisories/new)
on the AIDE repository. GitHub's encryption-at-rest and per-advisory
access control are the safest way to share exploit code or detailed
reproduction steps.

**Fallback channel: email.** If you cannot use GitHub advisories,
send a PGP-encrypted email to **security@aide.dev** with the
subject line `AIDE SECURITY: <one-line summary>`. (PGP key on
request; do not include the key fingerprint in this public file.)

**Please do not file public issues for security vulnerabilities.**

### What to include

- Affected package(s) and version(s) (e.g. `@aide-dev/guard@1.0.0`)
- A minimal reproduction (commands, code, or a recorded session)
- The impact you observed (data exposure, privilege escalation, …)
- Your environment (OS, Node.js version, deployment topology)
- Optional: a suggested fix or mitigation

### Response SLAs

| Stage                              | Target               |
| ---------------------------------- | -------------------- |
| Initial acknowledgement            | 48 hours             |
| Severity triage + remediation plan | 7 days               |
| Patch — Critical                   | 24 hours             |
| Patch — High                       | 7 days               |
| Patch — Medium                     | 30 days              |
| Patch — Low                        | Next regular release |

We will keep you informed of progress at each milestone. If you do
not hear back within the acknowledgement window, please ping the
thread or follow up by email.

## Severity Classification

We use [CVSS v3.1](https://www.first.org/cvss/v3.1/specification-document)
with the standard severity bands. Examples relevant to AIDE:

| Severity                | Examples                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical (9.0–10.0)** | Authentication bypass on the proxy, arbitrary code execution via crafted input, secret-key extraction, SSRF that reaches internal services                                                                  |
| **High (7.0–8.9)**      | Denial of service via an unauthenticated endpoint, cross-tenant data exposure in multi-tenant deployments, prompt-injection leading to data exfiltration, supply-chain compromise of a published dependency |
| **Medium (4.0–6.9)**    | Information disclosure of non-sensitive debug output, reflected XSS in the dashboard, missing rate limiting on a paid upstream, secret leakage to error logs                                                |
| **Low (0.1–3.9)**       | Missing best-practice headers, verbose error messages, configuration footguns, lint-only issues                                                                                                             |

## Coordinated Disclosure

We follow a **90-day disclosure window** from the date we acknowledge
your report. We will:

1. Acknowledge the report within 48 hours.
2. Work with you to triage and develop a fix.
3. Reserve a CVE via [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories)
   when the fix ships.
4. Publish the advisory and a `CHANGELOG.md` entry on the day the
   patched release is published.
5. Credit you in the advisory (unless you ask to remain anonymous).

If the 90-day window elapses without a fix, we will publish a
reduced-detail advisory so the community is informed, in
consultation with you.

## Security Update Channels

- **GitHub Security Advisories** (primary):
  [github.com/ldkong2077/aide-monorepo/security/advisories](https://github.com/ldkong2077/aide-monorepo/security/advisories)
- **npm audit advisories** for the published packages
- **Dependabot** pull requests for upstream dependency fixes (the
  repository is configured with `npm` ecosystem weekly updates)
- **GitHub Releases** with `Security:` labels on the release notes

To receive notifications, **Watch → Custom → Releases** on the
repository. The `@aide-dev/cli` and `@aide-dev/guard` packages also publish
release notes to their respective npm feeds.

## Out of Scope

The following are not in scope for the security policy:

- Denial-of-service attacks originating from within a network the
  user already trusts (e.g. a hostile authenticated user; the rate
  limiter covers this for unauthenticated traffic).
- Missing or weak rate limits on `/health`, `/readyz`, `/metrics`
  (these are intentionally cheap so that monitoring infrastructure
  can poll them at high frequency).
- Bugs in upstream LLM providers (OpenAI, Anthropic, DeepSeek, …)
  — report those to the upstream vendor. AIDE passes through their
  API surface verbatim.
- Vulnerabilities in the bundled tree-sitter grammars that are not
  reachable through the public AIDE API.
- Theoretical vulnerabilities that require a configuration that is
  not the documented default.

## Recognition

We thank the following reporters for coordinated disclosures
(alphabetical):

_To be populated after the first disclosure._

Last updated: 2026-06-02
