# Security Policy

## Supported versions

Branchwater is pre-1.0. Security fixes are applied to the **latest published
`0.x` release** on npm (`branchwater`).

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's *Report a vulnerability* (Security → Advisories):

➡️ https://github.com/namanchopra/branchwater/security/advisories/new

Include: affected version, a description, reproduction steps, and impact. You'll
get an acknowledgement, and a fix + coordinated disclosure once confirmed.

## Scope & threat model (context for reporters)

Branchwater is a **local-first developer tool**. Notably:

- The `bw ui` web server binds **`127.0.0.1` only**, requires a per-session
  token (`x-bw-token`, constant-time compared), and rejects non-loopback `Host`
  headers (DNS-rebinding defense). Every mutating endpoint is confirm-gated and
  auto-snapshots first.
- Database credentials flow via the child process **environment** (`PGPASSWORD`),
  never on argv; SQL runs on `psql` stdin with `ON_ERROR_STOP=on`.
- The CLI shells out **without a shell** (`spawn` with an args array).

Most impactful reports involve: credential exposure, command/SQL injection
through config or table/column names, the local server's auth/host checks, or
path traversal in the static file server. These are the areas to probe.
