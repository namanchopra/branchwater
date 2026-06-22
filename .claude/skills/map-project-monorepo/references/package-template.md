# Per-Package CLAUDE.md Template

Use this template for every `packages/*/CLAUDE.md`. Replace ALL placeholders with actual values from Phase 1 discovery.

---

## Template

````markdown
# @scope/package-name

[1-2 sentence purpose. What does this package do? What problem does it solve?]

## Exports ([N] total)

| Export | Kind | Purpose |
|--------|------|---------|
| ExportName | type/interface/function/class/const | What it does |
| ... | ... | ... |

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, re-exports all public API |
| `src/parser.ts` | [What it does] |
| ... | ... |

## Dependencies

Imports from these monorepo packages:

- `@scope/contracts` — types: `TypeA`, `TypeB`
- `@scope/config` — paths: `functionA`, `CONSTANT_B`

## Import Pattern

```typescript
// How consumers use this package
import { ExportA, ExportB } from "@scope/package-name";
import type { TypeA, TypeB } from "@scope/package-name";
```

## Conventions

- [Package-specific conventions, e.g., "All detectors return DetectedItem | null"]
- [Build tool: tsc or tsup]
- [Any gotchas specific to this package]

## Testing

```bash
# If tests exist
pnpm --filter @scope/package-name test
```

Test files in `src/__tests__/`. Uses Vitest.
````

---

## Size Guidelines

| Package Type | Target Lines | Notes |
|-------------|-------------|-------|
| Types-only (contracts) | 50-80 | Large export table, minimal prose |
| Config/paths | 50-80 | Constants + functions table |
| Small engine (5-15 exports) | 80-120 | Focused, few files |
| Medium engine (15-40 exports) | 120-180 | Larger export table |
| Large engine (40+ exports) | 150-200 | May need sub-sections in exports |

## Rules

1. **Every export in `src/index.ts` must appear in the Exports table** — no exceptions
2. **Every `.ts` file in `src/` must appear in Key Files** — skip only `index.ts` if it's just re-exports
3. **Dependencies must be actual imports** — grep the source, don't guess
4. **Import Pattern must show real usage** — find an actual consumer in the monorepo
5. **No prose paragraphs** — tables and bullet lists ONLY
6. **No duplication with root** — don't repeat global conventions (ESM, bare imports)

## Examples of Good vs Bad

**Bad export row:**
```
| parseRules | function | Parses rules |
```

**Good export row:**
```
| parseRules | function | Parse YAML string to RulesConfig (validates with Zod) |
```

**Bad key file:**
```
| `src/utils.ts` | Utilities |
```

**Good key file:**
```
| `src/matchers.ts` | Tool name, file pattern, and command matching with glob support |
```
