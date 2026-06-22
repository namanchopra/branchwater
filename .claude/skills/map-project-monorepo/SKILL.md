---
name: map-project-monorepo
description: Scan a monorepo and generate/update per-package CLAUDE.md files. Each subdirectory gets a focused, self-contained CLAUDE.md with exports, key files, dependencies, and conventions. Run after each coding session, major refactors, or package additions to keep the AI context map current.
---

<EXTREMELY-IMPORTANT>
Before writing ANY per-package CLAUDE.md, you **ABSOLUTELY MUST** complete Phase 1 discovery.

**SKIPPING DISCOVERY = INCOMPLETE PER-PACKAGE DOCS = CLAUDE SEARCHING BLINDLY**

This is not optional. Each sub-directory CLAUDE.md must be self-contained.
Claude lazy-loads these files — they ONLY load when Claude touches files in that directory.
If the CLAUDE.md is incomplete, Claude has NO context for that package.
</EXTREMELY-IMPORTANT>

# Update CLAUDE.md for Monorepo

## MANDATORY FIRST RESPONSE PROTOCOL

Before writing ANY documentation:

1. ☐ Discover all `packages/*/` and `apps/*/` directories
2. ☐ For each, count exports and identify key files
3. ☐ Map inter-package dependencies
4. ☐ Identify which packages have tests
5. ☐ Announce: "Generating CLAUDE.md for X packages + Y apps, targeting 10/10"

**Writing per-package docs without discovery = guaranteed gaps. Phase 1 is NON-NEGOTIABLE.**

## Overview

In a monorepo, Claude Code **lazy-loads** subdirectory CLAUDE.md files — they only load when Claude touches files in that directory. Sibling packages never see each other's CLAUDE.md. This means each per-package CLAUDE.md must be **self-contained**: everything Claude needs to work effectively in that package, right there.

This skill generates a focused CLAUDE.md for every `packages/*/` and `apps/*/` directory, then **simplifies** the root CLAUDE.md and reference files by pushing per-package detail down to where Claude actually needs it.

**Core principle:** Detail lives where it's used. Root stays lean. Packages are self-contained.

**Quality target:** 10/10 — Claude should implement features correctly on first attempt in ANY package.

## How Claude Code Loads Subdirectory CLAUDE.md

Understanding the loading mechanism is critical:

| Behavior | Detail |
|----------|--------|
| **Lazy loading** | `packages/foo/CLAUDE.md` loads ONLY when Claude reads/writes files under `packages/foo/` |
| **No cross-loading** | Working in `packages/foo/` does NOT load `packages/bar/CLAUDE.md` |
| **Root always loads** | Root `CLAUDE.md` loads at startup for every session |
| **@imports work** | Per-package CLAUDE.md can use `@` imports for shared reference files |
| **Hierarchy** | Instructions from parent CLAUDE.md are inherited (root applies everywhere) |

**Implication:** Per-package CLAUDE.md must include everything Claude needs for that package. Don't assume root-level detail will be available — keep root lean, push detail down.

## Context Budget

| Component | Max Lines | Rationale |
|-----------|-----------|-----------|
| Root CLAUDE.md | 300 | Always loaded — keep it to project-wide info only |
| Root @import files | 500 each | Lazy-loaded by topic, shared reference material |
| Per-package CLAUDE.md | 50-200 | Lazy-loaded per directory, focused on that package |
| Per-app CLAUDE.md | 80-250 | Lazy-loaded per directory, apps are more complex |

**Why these limits:**
- Root is ALWAYS in context — every token counts
- Per-package files load only when needed — can be more detailed
- But still concise — tables over prose, no duplication

## When to Use

- **After monorepo refactor:** Single package split into many (e.g., `packages/core` → 12 packages)
- **Package added/removed:** New package needs CLAUDE.md, removed package's docs are stale
- **After running `map-project`:** Root docs exist but no per-package files
- **Claude searches blindly:** Searching across 15+ packages for something in one package
- **Periodic refresh:** User asks to update monorepo docs or sync CLAUDE.md files

**Symptoms:**
- Claude reads 10 files across 5 packages to find one function
- No CLAUDE.md files exist in `packages/*/` or `apps/*/`
- Root CLAUDE.md has 400+ line exports-reference trying to cover all packages
- Claude uses wrong import patterns or outdated types for a specific package

## When NOT to Use

- **Single-package project:** Use `map-project` instead
- **Only root needs updating:** Use `map-project` instead
- **Monorepo with 1-2 packages:** Overhead not worth it — root docs suffice

---

## Common Rationalizations (All Wrong)

- "The root CLAUDE.md already covers everything" → Root loads for ALL sessions; per-package loads ONLY when needed. Push detail down.
- "Per-package CLAUDE.md will be redundant" → No — Claude doesn't see root @import files when working in a subdirectory unless they're loaded. Each package must stand alone.
- "I'll just do the important packages" → ALL packages need CLAUDE.md. The one you skip is the one Claude will struggle with.
- "50 lines isn't enough" → Tables compress information 3x. 50 lines of tables = 150 lines of prose.
- "I can copy the same template everywhere" → Each package has different exports, dependencies, and conventions. Customize every file.
- "The root exports-reference.md already has this" → Move it down. Root should have summary counts, not full export tables.
- "Phase 1 takes too long for 15 packages" → Use parallel grep/find commands. Discovery takes 2 minutes. Skipping it costs 20 minutes of rework.

---

## Phase 1: Monorepo Discovery (MANDATORY)

**Gate: Complete inventory before writing ANY per-package CLAUDE.md.**

### Step 1: Find All Packages and Apps

```bash
# List all packages
ls -d packages/*/package.json 2>/dev/null | sed 's|/package.json||'

# List all apps
ls -d apps/*/package.json 2>/dev/null | sed 's|/package.json||'
```

### Step 2: Build Package Inventory

For EACH package/app, collect:

```bash
# Package name from package.json
cat packages/*/package.json | jq -r '.name'

# Export count from index.ts
for pkg in packages/*/; do
  name=$(jq -r '.name' "$pkg/package.json" 2>/dev/null)
  count=$(grep -c "^export" "$pkg/src/index.ts" 2>/dev/null || echo 0)
  echo "$name: $count exports"
done
```

Create inventory table:

| Package | Exports | Has Tests | Key Role |
|---------|---------|-----------|----------|
| @scope/contracts | ? | No | Shared types |
| @scope/config | ? | No | Paths, env |
| ... | ... | ... | ... |

### Step 3: Map Inter-Package Dependencies

For each package, find which other monorepo packages it imports:

```bash
# For each package, find internal dependencies
for pkg in packages/*/; do
  name=$(jq -r '.name' "$pkg/package.json" 2>/dev/null)
  deps=$(grep -rh "from \"@" "$pkg/src/" --include="*.ts" 2>/dev/null | \
    sed 's/.*from "\(@[^"]*\)".*/\1/' | sort -u | tr '\n' ', ')
  echo "$name → $deps"
done
```

### Step 4: Extract Exports Per Package

For each package, list ALL exports:

```bash
# Full export listing per package
for pkg in packages/*/; do
  name=$(jq -r '.name' "$pkg/package.json" 2>/dev/null)
  echo "=== $name ==="
  grep "^export" "$pkg/src/index.ts" 2>/dev/null
  echo ""
done
```

### Step 5: Identify Key Files Per Package

```bash
# List source files per package
for pkg in packages/*/; do
  name=$(jq -r '.name' "$pkg/package.json" 2>/dev/null)
  echo "=== $name ==="
  find "$pkg/src" -name "*.ts" -not -name "*.test.ts" -not -name "*.spec.ts" | sort
  echo ""
done
```

### Step 6: Check for Tests

```bash
# Find which packages have tests
for pkg in packages/*/; do
  name=$(jq -r '.name' "$pkg/package.json" 2>/dev/null)
  tests=$(find "$pkg" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
  echo "$name: $tests test files"
done
```

### Phase 1 Gate

Before proceeding, you MUST have:

- [ ] List of ALL packages with export counts
- [ ] List of ALL apps with descriptions
- [ ] Inter-package dependency map
- [ ] Key files per package
- [ ] Test file inventory
- [ ] Role description for each package (1-line purpose)

---

## Phase 2: Per-Package CLAUDE.md Generation

**Gate: EVERY package in `packages/*/` has a CLAUDE.md.**

For EACH package, create `packages/<name>/CLAUDE.md` using the template from `references/package-template.md`.

### Required Sections Per Package

Every per-package CLAUDE.md MUST have:

| Section | Purpose | Format |
|---------|---------|--------|
| **Header** | Package name + 1-line purpose | `# @scope/name` + paragraph |
| **Exports** | ALL exported items | Table: Export, Kind, Purpose |
| **Key Files** | Source files with descriptions | Table: File, Purpose |
| **Dependencies** | Which @scope/* packages are imported | Bullet list |
| **Import Pattern** | How consumers import from this package | Code block |
| **Conventions** | Package-specific rules | Bullet list or table |
| **Testing** | How to test (if tests exist) | Command + pattern |

### Content Quality Rules

1. **Export tables must be COMPLETE** — every `export` from `index.ts` appears in the table
2. **Key files must list ALL source files** — not just "the important ones"
3. **Dependencies must be accurate** — grep the actual imports, don't guess
4. **Import patterns must show real examples** — from actual consumers in the monorepo
5. **No prose paragraphs** — tables and bullet lists only. Save tokens.

### Package CLAUDE.md Size Guide

| Package Complexity | Target Lines | Example |
|-------------------|-------------|---------|
| Foundation (types only) | 50-80 | contracts, config |
| Engine (5-15 exports) | 80-120 | session-engine, projects-engine |
| Engine (15-40 exports) | 120-180 | guards-engine, history-engine |
| Engine (40+ exports) | 150-200 | review-engine (with schemas) |

---

## Phase 3: Per-App CLAUDE.md Generation

**Gate: EVERY app in `apps/*/` has a CLAUDE.md.**

Apps are more complex than packages. Use the template from `references/app-template.md`.

### Required Sections Per App

Every per-app CLAUDE.md MUST have:

| Section | Purpose | Format |
|---------|---------|--------|
| **Header** | App name + purpose | `# @scope/name` + paragraph |
| **File Structure** | Directory tree with descriptions | Tree + table |
| **Entry Points** | Main files and their roles | Table |
| **Commands** | Build, start, test commands | Table |
| **Dependencies** | Which @scope/* packages are imported | Table with purpose |
| **Key Patterns** | Architecture patterns used | Descriptions + examples |

### App-Specific Sections

**For API/Server apps, also include:**
- Route table (ALL routes with methods, handlers)
- Middleware stack
- Request/response patterns with types

**For CLI apps, also include:**
- Command table (all commands with descriptions)
- Hook handler table (if applicable)
- stdin/stdout patterns

**For Web UI apps, also include:**
- Pages table (route → component)
- Key components list
- State management patterns
- API integration patterns

### App CLAUDE.md Size Guide

| App Type | Target Lines | Example |
|----------|-------------|---------|
| API server | 150-250 | api (routes, middleware, patterns) |
| CLI tool | 120-200 | cli (commands, hooks, entry points) |
| Web UI | 120-200 | web-ui (pages, components, patterns) |

---

## Phase 4: Root Simplification

**Gate: Root CLAUDE.md + reference files simplified. No per-package detail in root.**

After generating per-package CLAUDE.md files, simplify the root:

### What STAYS in Root CLAUDE.md

- Project name + 1-line description
- Package map table (name + 1-line purpose — NO export counts)
- Global conventions (ESM, bare imports, build commands)
- Quick reference table (which file to read)
- @imports for shared reference files
- Skills, agents, plugins table
- Hook handlers table (cross-cutting concern)
- Type gotchas (cross-cutting concern)

### What MOVES to Per-Package CLAUDE.md

- Per-package export tables → each package's own CLAUDE.md
- Per-package file listings → each package's own CLAUDE.md
- Package-specific conventions → each package's own CLAUDE.md

### What STAYS in Root Reference Files

**architecture.md:**
- High-level dependency graph (package relationships)
- Data flow diagrams (cross-package flows)
- State machines (cross-cutting concepts)
- API routes table (quick lookup — detail in apps/api/CLAUDE.md)

**development-guide.md:**
- Cross-cutting "how to add a new X" guides
- Response formats (shared across API)
- Error handling patterns (shared)
- Testing patterns (shared)

**exports-reference.md:**
- Summary table ONLY (package name + export count + 1-line purpose)
- Import patterns section (how to import from each package)
- Remove per-export detail — that now lives in per-package CLAUDE.md

### Root Simplification Checklist

- [ ] Root CLAUDE.md is ≤ 300 lines
- [ ] exports-reference.md has summary table only (≤ 150 lines)
- [ ] architecture.md has no per-package file listings (≤ 400 lines)
- [ ] development-guide.md has no per-package export tables (≤ 500 lines)
- [ ] No per-package detail duplicated between root and subdirectory files

---

## Phase 5: Verification (MANDATORY)

**Gate: ALL checks pass before marking complete.**

### Check 1: Coverage

```bash
# Count packages/apps that need CLAUDE.md
TOTAL=$(ls -d packages/*/package.json apps/*/package.json 2>/dev/null | wc -l)

# Count generated CLAUDE.md files
GENERATED=$(ls packages/*/CLAUDE.md apps/*/CLAUDE.md 2>/dev/null | wc -l)

echo "Coverage: $GENERATED / $TOTAL"
```

**FAIL if:** Any package/app is missing CLAUDE.md

### Check 2: Export Completeness

For each package, verify export coverage:

```bash
for pkg in packages/*/; do
  actual=$(grep -c "^export" "$pkg/src/index.ts" 2>/dev/null || echo 0)
  documented=$(grep -c "^|" "$pkg/CLAUDE.md" 2>/dev/null || echo 0)
  name=$(basename "$pkg")
  echo "$name: $documented documented / $actual exports"
done
```

**FAIL if:** Any package has < 90% export coverage

### Check 3: Context Budget

```bash
# Root files
wc -l CLAUDE.md
wc -l .claude/claude-md-refs/*.md

# Per-package files
for f in packages/*/CLAUDE.md apps/*/CLAUDE.md; do
  wc -l "$f"
done
```

**FAIL if:**
- Root CLAUDE.md > 300 lines
- Any per-package CLAUDE.md > 200 lines
- Any per-app CLAUDE.md > 250 lines

### Check 4: Self-Containment

For each per-package CLAUDE.md, verify it answers:

- [ ] What does this package do? (header)
- [ ] What does it export? (exports table)
- [ ] What files does it contain? (key files)
- [ ] What does it depend on? (dependencies)
- [ ] How do I import from it? (import pattern)

### Check 5: No Duplication

Verify per-package export details are NOT duplicated in root reference files:

- [ ] exports-reference.md has summary table only — no per-export rows
- [ ] Root CLAUDE.md has no per-package file listings
- [ ] Per-package CLAUDE.md does not repeat root conventions

### Check 6: Root Simplified

- [ ] Root CLAUDE.md is ≤ 300 lines (down from previous size)
- [ ] exports-reference.md is ≤ 150 lines (summary only)
- [ ] No per-package detail remains in root files

---

## Quality Checklist (Must Score 10/10)

### Coverage (0-2 points)
- **0:** Some packages missing CLAUDE.md
- **1:** All packages have CLAUDE.md but some incomplete
- **2:** Every package and app has complete CLAUDE.md

### Export Completeness (0-2 points)
- **0:** <50% of exports documented per package
- **1:** 50-89% coverage
- **2:** >90% coverage in every package

### Self-Containment (0-2 points)
- **0:** Per-package docs reference root files for basic info
- **1:** Mostly self-contained but missing some context
- **2:** Each CLAUDE.md is fully self-contained for its package

### Root Simplification (0-2 points)
- **0:** Root still has per-package detail
- **1:** Some detail moved but root still verbose
- **2:** Root is lean (≤300 lines), detail pushed to packages

### Context Efficiency (0-2 points)
- **0:** Over budget or heavy duplication
- **1:** Within budget but some duplication
- **2:** Within budget, zero duplication, tables over prose

**Total: 10/10 required to complete this skill**

---

## Failure Modes

### Failure Mode 1: Copy-Paste Templates

**Symptom:** All per-package CLAUDE.md files look identical with placeholder text
**Fix:** Each file must have actual exports, actual file names, actual dependencies from discovery.

### Failure Mode 2: Root Not Simplified

**Symptom:** Per-package files created but root CLAUDE.md still 500+ lines with full export tables
**Fix:** Phase 4 is mandatory. Move detail down, slim root to ≤300 lines.

### Failure Mode 3: Missing Packages

**Symptom:** 10 of 12 packages have CLAUDE.md, 2 skipped
**Fix:** Check 1 catches this. Every package, no exceptions.

### Failure Mode 4: Incomplete Exports

**Symptom:** Package has 43 exports but CLAUDE.md only lists 20
**Fix:** Use grep to get actual count, verify table row count matches.

### Failure Mode 5: Broken Cross-References

**Symptom:** Per-package CLAUDE.md references root @import that moved
**Fix:** Per-package files should be self-contained. No @imports to root reference files.

### Failure Mode 6: Prose Instead of Tables

**Symptom:** Per-package CLAUDE.md is 300 lines of paragraphs
**Fix:** Tables compress 3x. A 40-export package needs a 40-row table, not 40 paragraphs.

---

## Quick Workflow Summary

```
PHASE 1: DISCOVERY (Do not skip)
├── Find all packages/ and apps/ directories
├── Count exports per package
├── Map inter-package dependencies
├── List key files per package
├── Check for test files
└── Gate: Complete inventory

PHASE 2: PER-PACKAGE CLAUDE.md (Every package)
├── Header + purpose
├── Exports table (ALL exports)
├── Key files table
├── Dependencies list
├── Import patterns
├── Conventions + testing
└── Gate: Every package has CLAUDE.md

PHASE 3: PER-APP CLAUDE.md (Every app)
├── Header + purpose
├── File structure + entry points
├── Commands table
├── Dependencies with purposes
├── App-specific sections (routes/commands/pages)
└── Gate: Every app has CLAUDE.md

PHASE 4: ROOT SIMPLIFICATION
├── Slim root CLAUDE.md to ≤300 lines
├── Slim exports-reference.md to summary table only
├── Remove per-package detail from root files
├── Keep cross-cutting concerns in root
└── Gate: Root simplified, no duplication

PHASE 5: VERIFICATION (All must pass)
├── Check 1: Every package/app has CLAUDE.md
├── Check 2: >90% export coverage per package
├── Check 3: Context budget met
├── Check 4: Self-containment verified
├── Check 5: No duplication
├── Check 6: Root simplified
└── Gate: All 6 checks pass

COMPLETE: Announce final quality score (must be 10/10)
```

---

## Completion Announcement

When done, announce:

```
Monorepo CLAUDE.md generation complete.

**Quality Score: X/10**
- Coverage: X/2 (N packages + M apps documented)
- Export Completeness: X/2 (>90% per package)
- Self-Containment: X/2
- Root Simplification: X/2 (root: N lines, was M lines)
- Context Efficiency: X/2

**Files created:**
- packages/contracts/CLAUDE.md: X lines
- packages/config/CLAUDE.md: X lines
- [... all packages ...]
- apps/api/CLAUDE.md: X lines
- apps/cli/CLAUDE.md: X lines
- apps/web-ui/CLAUDE.md: X lines

**Root simplified:**
- CLAUDE.md: X lines (was Y)
- exports-reference.md: X lines (was Y)

**Verification passed:** All 6 checks complete.
```

---

## Integration with Other Skills

- **`map-project`** — Use that for single-package projects or root-only updates. Use THIS skill for monorepo per-package docs.
- **`start`** — Start skill identifies if monorepo docs are needed
- **`rebuild`** — After rebuild, run this if packages were added/removed

**Workflow:**
```
New package added
       │
       ▼
rebuild skill (verify build)
       │
       ▼
map-project-monorepo (this skill)
       │
       ▼
commit skill (commit the new CLAUDE.md files)
```

---

## References

See `references/` for templates:

| Reference | Purpose |
|-----------|---------|
| `package-template.md` | Template for per-package CLAUDE.md with all required sections |
| `app-template.md` | Template for per-app CLAUDE.md with app-type-specific sections |

---

_This skill ensures every package and app in a monorepo has focused, self-contained documentation that loads exactly when Claude needs it._
