# Per-App CLAUDE.md Template

Use this template for every `apps/*/CLAUDE.md`. Apps are more complex than packages and need app-type-specific sections.

---

## Base Template (All Apps)

````markdown
# @scope/app-name

[1-2 sentence purpose. What does this app do? Who uses it?]

## Commands

| Task | Command |
|------|---------|
| Build | `pnpm --filter @scope/app-name build` |
| Start | `[start command]` |
| Test | `[test command or "No tests"]` |

## File Structure

```
apps/app-name/src/
├── index.ts          [Entry point purpose]
├── commands/         [If CLI]
├── routes/           [If API]
├── pages/            [If web UI]
└── ...
```

## Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry point — [what it does] |
| ... | ... |

## Dependencies

| Package | Used For |
|---------|----------|
| `@scope/contracts` | Types: `TypeA`, `TypeB` |
| `@scope/config` | Paths: `functionA` |
| ... | ... |

## Key Patterns

[App-specific architectural patterns — see sections below]

## Conventions

- [App-specific conventions]
- [Build tool: tsup or tsc or vite]
````

---

## API Server App — Additional Sections

Add these sections for HTTP server apps:

````markdown
## Routes

| Route | Method | Handler | Purpose |
|-------|--------|---------|---------|
| `/api/health` | GET | `system.ts:health` | Health check |
| `/api/resource` | GET | `resource.ts:list` | List resources |
| `/api/resource` | POST | `resource.ts:create` | Create resource |
| ... | ... | ... | ... |

## Request/Response Pattern

```typescript
// Route handler signature
interface RouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  projectDir: string;
  params: Record<string, string>;
}

// All handlers follow this pattern:
export async function handlerName(ctx: RouteContext): Promise<void> {
  // ... process request
  jsonResponse(ctx.res, data, statusCode, ctx.req);
}
```

## Middleware

| Middleware | File | Purpose |
|-----------|------|---------|
| CORS | `middleware/cors.ts` | Cross-origin headers |
| ... | ... | ... |

## Real-Time

| Protocol | Purpose | Endpoint |
|----------|---------|----------|
| WebSocket | Live updates | `/ws` |
| SSE | Review events | `/api/review/hub/events` |
````

---

## CLI App — Additional Sections

Add these sections for CLI apps:

````markdown
## Commands

| Command | Purpose | File |
|---------|---------|------|
| `init` | Initialize project | `commands/init.ts` |
| `rules` | Manage rules | `commands/rules.ts` |
| ... | ... | ... |

## Hook Handlers

| Handler | Trigger | Can Block? | File |
|---------|---------|-----------|------|
| `session-start` | SessionStart | No | `hooks/session-start.ts` |
| `pre-tool` | PreToolUse | Yes (exit 2) | `hooks/pre-tool.ts` |
| ... | ... | ... | ... |

## stdin/stdout Pattern

```typescript
// Hook handlers read JSON from stdin
const input: HookInput = JSON.parse(await readStdin());

// Output JSON to stdout (for blocking hooks)
const output: HookOutput = { hookSpecificOutput: { ... } };
console.log(JSON.stringify(output));

// Exit codes: 0 = allow, 2 = block
process.exit(exitCode);
```
````

---

## Web UI App — Additional Sections

Add these sections for web UI apps:

````markdown
## Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Overview and stats |
| Settings | `/settings` | User preferences |
| ... | ... | ... |

## Key Components

| Component | Purpose |
|-----------|---------|
| Sidebar | Navigation + project selector |
| UpdateBanner | Version update notification |
| ... | ... |

## API Integration

```typescript
// All API calls go through the client
import { GuardianClient, createClient } from "@scope/api-client";

const client = createClient({ baseUrl: "http://localhost:9800" });
const rules = await client.getRules();
```

## Design System

- [Color scheme, theme approach]
- [Component library if any]
- [Build output: single HTML file via vite-plugin-singlefile]
````

---

## Size Guidelines

| App Type | Target Lines | Notes |
|----------|-------------|-------|
| API server | 150-250 | Route table is the largest section |
| CLI tool | 120-200 | Command + hook tables |
| Web UI | 120-200 | Pages + components tables |

## Rules

1. **Route/command/page tables must be COMPLETE** — every route, every command, every page
2. **Dependencies must show what's used from each package** — not just the package name
3. **Entry points must explain the startup flow** — what happens when the app starts
4. **Patterns must show real code** — from the actual codebase, not generic examples
5. **No prose paragraphs** — tables and bullet lists ONLY
6. **No duplication with root** — don't repeat global conventions
