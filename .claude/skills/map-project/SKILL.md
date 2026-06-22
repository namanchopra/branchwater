---
name: map-project
description: Scan the codebase and generate/update CLAUDE.md + reference files (exports, architecture, dev guide) with real project-specific patterns. Run after each coding session or major refactor to keep the AI context map current. Supports Laravel, Next.js, NestJS, Expo/React Native, and Node.js projects.
---

<EXTREMELY-IMPORTANT>
If you are about to update CLAUDE.md, you **ABSOLUTELY MUST** complete Phase 0 (detection) and Phase 1 (discovery) first.

**SKIPPING DISCOVERY = INCOMPLETE DOCUMENTATION = AI AGENT FAILURE**

This is not optional. You cannot rationalize "good enough" without running verification checks.
</EXTREMELY-IMPORTANT>

# Update CLAUDE.md After Installation

## MANDATORY FIRST RESPONSE PROTOCOL

Before writing ANY documentation:

1. ☐ Complete Phase 0: Detect the framework
2. ☐ Complete Phase 1: Framework-specific discovery (ALL steps)
3. ☐ Create API surface inventory with counts
4. ☐ Verify >90% coverage is achievable
5. ☐ Announce: "Detected [Framework]. Starting documentation update targeting 10/10"

**Writing docs without discovery = guaranteed gaps. Phase 0 + Phase 1 are NON-NEGOTIABLE.**

## Overview

After installing framework agents, CLAUDE.md and its imported files contain generic placeholder examples. This skill guides you to systematically discover the actual project patterns and update these files with real, project-specific information.

**Core principle:** Discover exhaustively, then document. Analyze ALL exports/classes/routes before writing.

**Quality target:** 10/10 AI agent effectiveness — documentation should enable an AI to implement features correctly on the first attempt.

**Supported frameworks:** Laravel, Next.js (App Router), NestJS, Expo/React Native (expo-router), Node.js monorepo.

## Context Budget Limits

Your documentation MUST fit within these constraints:

| Component | Max Lines | Rationale |
|-----------|-----------|-----------|
| Main CLAUDE.md | 1,000 | Always loaded, keep lean |
| Each @import file | 500 | Lazy-loaded, can be detailed |
| All imports combined | 1,500 | ~3k tokens = 1.5% of context |
| **Total** | 2,500 | Leaves 98%+ for actual work |

### If Over Budget

1. Move code examples >30 lines to "reference by path" format
2. Convert prose to tables (3x more token-efficient)
3. Consolidate overlapping sections
4. Remove redundant information between files

## What Makes 10/10 Documentation

AI agents are most effective when documentation provides:

### 1. Step-by-Step Implementation Guides

❌ Poor (4/10): "We use controllers for API endpoints"
✅ Excellent (10/10): Numbered steps with actual code templates from the codebase

````markdown
## Adding a New API Endpoint (Laravel)

### Step 1: Create the Model
```php
class ModelName extends Model
{
    use BelongsToAccount, HasUuids;
    protected $fillable = ['account_id', 'name'];
}
```

### Step 2: Create the Form Request
### Step 3: Create the Controller (thin — delegates to Service)
### Step 4: Register Routes in routes/api.php
````

### 2. Response Formats

❌ Poor: "API returns JSON"
✅ Excellent: Every response shape with types

```markdown
// NestJS — Interceptor wraps all responses:
{ success: true, data: T, timestamp: string }

// Error — Exception Filter formats:
{ success: false, error: string, code: 'ERROR_CODE', details: [...] }
```

### 3. State Machines with Visual Diagrams

```markdown
## Gift Redemption State Machine
```
pending → fulfilled
    ↓
cancelled
```

| Current | Action | New State | Who |
|---------|--------|-----------|-----|
| pending | Admin approves | fulfilled | Admin |
| pending | Admin cancels | cancelled | Admin |
```

### 4. Route/Screen Tables

❌ Poor: "Routes are in the routes folder"
✅ Excellent: Complete table with all routes

```markdown
| Route | File | Type | Purpose |
|-------|------|------|---------|
| `/` | app/page.tsx | Server Component | Home page |
| `/dashboard/[id]` | app/dashboard/[id]/page.tsx | Server Component | User detail |
| `/api/users` | app/api/users/route.ts | GET, POST | User CRUD |
```

### 5. API Surface Tables

```markdown
| Export | Type | Purpose |
|--------|------|---------|
| parseMarkdownToBlocks | function | Parse plan text → Block[] |
| Plan | interface | Full plan with versions |
```

## When to Use

- **Initial install:** User just installed agents and CLAUDE.md has generic examples
- **Project start:** Beginning work on a project for the first time
- **Key milestones:** After major architecture changes
- **Periodic refresh:** User asks to "update docs" or "sync CLAUDE.md with project"

---

## Common Rationalizations (All Wrong)

- "I already know this codebase" → STILL do Phase 1 discovery
- "The exports haven't changed much" → STILL verify counts
- "This is a small project" → STILL create all 3 required files
- "80% coverage is good enough" → NO, 90% minimum
- "I can eyeball the exports" → Use search commands, not memory
- "Wrong framework won't matter" → Phase 0 detection is MANDATORY

---

## Phase 0: Framework Detection (MANDATORY)

Before discovery, detect the framework. Check in this order (most specific first):

| # | Check | Confirming Files | Framework |
|---|-------|------------------|-----------|
| 1 | `composer.json` + `artisan` | `app/Models/`, `routes/api.php` | **Laravel** |
| 2 | `next.config.*` exists | `app/page.tsx` or `src/app/page.tsx` | **Next.js** |
| 3 | `nest-cli.json` OR `@nestjs/core` in package.json | `src/**/*.module.ts` | **NestJS** |
| 4 | `app.json` with `"expo"` key | `app/_layout.tsx` (expo-router) | **Expo/React Native** |
| 5 | `package.json` + `packages/*/package.json` | `packages/*/src/index.ts` | **Node.js monorepo** |

**Announce:** "Detected **[Framework]**. Proceeding with framework-specific discovery."

**If multiple match** (e.g. monorepo containing Next.js app): use the most specific framework for the primary app. Document sub-packages separately if needed.

---

## Phase 1: Exhaustive Discovery (MANDATORY)

**Do NOT skip this phase.** Follow the steps for your detected framework.

### Laravel

1. **Models:** `ls app/Models/*.php` — list all, note relationships (`belongsTo`, `hasMany`, `belongsToMany`), scopes, casts
2. **Services:** `ls app/Services/**/*.php` — list key public methods per service
3. **Jobs:** `ls app/Jobs/*.php` — note what dispatches each (Observer, Command, other Job)
4. **Observers:** `ls app/Observers/*.php` — which model, which events (`created`, `updated`)
5. **Middleware:** `ls app/Http/Middleware/*.php` — note alias from `bootstrap/app.php`
6. **API Resources:** `ls app/Http/Resources/*.php` — which model each transforms
7. **Form Requests:** `ls app/Http/Requests/*.php` — key validation rules per request
8. **Routes:** `grep "Route::" routes/api.php` — extract ALL methods, paths, controllers, middleware groups
9. **Commands:** `ls app/Console/Commands/*.php` + schedules from `routes/console.php`
10. **Also scan:** `app/Enums/`, `app/Traits/`, `app/Contracts/`, `app/Mail/`

### Next.js (App Router)

1. **Page routes:** `find app -name 'page.tsx' -o -name 'page.ts'` (or `src/app/`) — derive URL from path
2. **API routes:** `find app/api -name 'route.ts'` — grep for exported `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
3. **Layouts:** `find app -name 'layout.tsx'` — note which routes each wraps
4. **Server Actions:** `grep -r "'use server'" src --include="*.ts" --include="*.tsx"` — list all action functions
5. **Client Components:** `grep -rl "'use client'" src` — identify interactive components
6. **Middleware:** `find . -maxdepth 2 -name 'middleware.ts'` — note matcher config
7. **Hooks:** `find src/hooks -name '*.ts' -o -name '*.tsx'` — list custom hooks
8. **Types:** `grep -rh "^export interface\|^export type" src/types --include="*.ts"`

### NestJS

1. **Modules:** `find src -name '*.module.ts'` — note imports, exports, controllers, providers per module
2. **Controllers:** `find src -name '*.controller.ts'` — grep `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`
3. **Services:** `find src -name '*.service.ts'` — list key methods
4. **Entities:** `find src -path '*/entities/*.ts' -o -path '*/entity/*.ts'` — note properties, relationships
5. **DTOs:** `find src -path '*/dtos/*.ts' -o -path '*/dto/*.ts'` — note class-validator decorators
6. **Guards:** `find src -name '*.guard.ts'` — what they protect (JWT, roles, etc.)
7. **Pipes:** `find src -name '*.pipe.ts'` — validation/transformation purpose
8. **Interceptors:** `find src -name '*.interceptor.ts'` — logging, response transform, caching
9. **Filters:** `find src -name '*.filter.ts'` — exception handling
10. **Decorators:** `find src/common/decorators -name '*.ts'` — custom metadata annotations

### Expo/React Native (expo-router)

1. **Screen routes:** `find app -name '*.tsx' ! -name '_layout.tsx' ! -name '+not-found.tsx'` — derive URL from path
2. **Layouts:** `find app -name '_layout.tsx'` — navigation type (Stack, Tabs, Drawer)
3. **Components:** `find src/components -name '*.tsx'` — categorize: ui, shared, features
4. **Hooks:** `find src -name 'use*.ts' -o -name 'use*.tsx'` — global + module-specific
5. **Stores:** `find src -name '*Store.ts' -o -name '*store.ts'` — Zustand/Redux state + actions
6. **API hooks:** `grep -rl "useQuery\|useMutation" src --include="*.ts"` — React Query hooks
7. **Services:** `find src/services -name '*.ts'` — API client, storage, notifications
8. **Types:** `grep -rh "^export interface\|^export type" src --include="*.ts" | sort | uniq`
9. **Platform-specific:** `find . -name '*.ios.tsx' -o -name '*.android.tsx' -o -name '*.web.tsx'`

### Node.js Monorepo

1. **Packages:** `ls packages/*/package.json` — find entry points via `jq '.main, .exports'`
2. **Exports:** `grep "^export" packages/*/src/index.ts` — count types, functions, constants
3. **Subpath exports:** `find packages/*/src -name "index.ts"` + check `"exports"` in package.json
4. **TypeScript interfaces:** `grep -rh "^export interface\|^export type" packages/*/src --include="*.ts"`
5. **Route handlers:** `grep -r "router\.\|app\.\(get\|post\|put\|delete\)" --include="*.ts"`
6. **State machines:** Look for entities with `status` or `state` fields

### Inventory Checklist (all frameworks)

Before proceeding to Phase 2, you MUST have:

- [ ] Complete list of all discoverable items with counts
- [ ] All routes/screens mapped
- [ ] All state machines identified (entities with status/state fields)
- [ ] Import/use patterns noted

---

## Phase 2: Required Output Files

You MUST create/update these 3 files. No exceptions.

### File 1: `exports-reference.md` (REQUIRED)

**Location:** `.claude/claude-md-refs/exports-reference.md`
**Target:** 300-500 lines | **Coverage:** >90% of discovered items

Use framework-appropriate sections:

#### Laravel

| Section | Table Columns |
|---------|---------------|
| Models | Model, Table, Key Relationships, Scopes |
| Enums | Enum, Cases, Backing Type |
| Services | Service, Key Methods, Purpose |
| Contracts | Interface, Methods, Implementations |
| Jobs | Job, Dispatched By, Purpose |
| Console Commands | Command, Signature, Schedule |
| Middleware | Alias, Class, Purpose |
| Observers | Observer, Model, Triggers |
| API Resources | Resource, Model, Purpose |
| Form Requests | Request, Controller, Key Validation Rules |
| Mailables | Mailable, View, Purpose |
| Traits | Trait, Used By, Purpose |

End with **Import Patterns**: `use App\Models\Toast;`, `use App\Services\ToastService;`

#### Next.js

| Section | Table Columns |
|---------|---------------|
| Page Routes | Route, File, Type (Server/Client), Purpose |
| API Routes | Route, Method, File, Purpose |
| Server Actions | Action, File, Parameters, Return |
| Middleware | Middleware, File, Purpose |
| Layouts | Layout, File, Scope |
| Custom Hooks | Hook, File, Purpose |
| Types | Type, File, Purpose |

#### NestJS

| Section | Table Columns |
|---------|---------------|
| Modules | Module, Exports, Purpose |
| Controllers & Routes | Controller, Method, Route, Guards, Pipes |
| Services | Service, Methods, Purpose |
| Entities | Entity, Properties, Relationships |
| DTOs | DTO, Fields, Validators |
| Guards | Guard, Purpose, Scope |
| Pipes | Pipe, Purpose, Applied |
| Interceptors | Interceptor, Purpose, Scope |
| Filters | Filter, Exception Type, Purpose |
| Decorators | Decorator, Purpose, Usage |

#### Expo/React Native

| Section | Table Columns |
|---------|---------------|
| Routes/Screens | Route, File, Dynamic Params, Layout, Purpose |
| Components | Component, Path, Category (ui/shared/feature), Purpose |
| Hooks | Hook, Path, Parameters, Returns, Purpose |
| Services | Service, Path, Key Methods, Purpose |
| Stores | Store, Path, State, Actions, Purpose |
| API Hooks | Hook, Path, Type (Query/Mutation), Cache Key, Purpose |
| Types | Type, Path, Key Fields, Purpose |
| Constants | Constant, Path, Value/Type, Purpose |
| Platform-Specific | Component, Platforms, Files, Purpose |

#### Node.js Monorepo

| Section | Table Columns |
|---------|---------------|
| @scope/package Types | Export, Type, Purpose |
| @scope/package Functions | Export, Purpose, Returns |
| @scope/package Constants | Export, Value, Purpose |
| Subpath Exports | Subpath, Export, Purpose |

End with **Import Patterns**: `import { Type } from '@scope/package';`

### File 2: `development-guide.md` (REQUIRED)

**Location:** `.claude/claude-md-refs/development-guide.md`
**Target:** 300-500 lines

Must include framework-appropriate implementation guides:

| Framework | Required Guides |
|-----------|----------------|
| **Laravel** | Adding a New API Endpoint (7 steps: Model → Migration → Form Request → Resource → Service → Controller → Routes), Response Format (`ApiResponse`), Adding Notifications (Observer → Job), Adding Commands, Multi-tenancy pattern, Testing |
| **Next.js** | Adding a Page Route, Adding an API Route, Adding a Server Action, Adding Middleware, Data Fetching (Server vs Client), Response Format, Testing |
| **NestJS** | Adding a Feature Module (8 steps: Module → Entity → DTO → Repository → Service → Controller → Register → Import), Creating Guards/Pipes/Interceptors, Response Format, Testing |
| **Expo/RN** | Adding a Screen/Route (create in `app/`, implement, configure `_layout.tsx`), Adding API Calls (React Query: types → hook → component), Adding Navigation (Tab/Stack/Drawer), Adding State (Zustand + AsyncStorage), Testing, Environment Variables, Building (EAS) |
| **Node.js** | Adding a Route Handler, Adding an Integration, Response Format, Error Handling, Testing |

**All guides must use actual code from the codebase, not placeholders.**

### File 3: `architecture.md` (REQUIRED)

**Location:** `.claude/claude-md-refs/architecture.md`
**Target:** 300-500 lines

All frameworks need these core sections:

1. **Dependency/Import Graph** — ASCII diagram showing how components depend on each other
2. **Request/Data Lifecycle** — Flow from entry to response
3. **Routes/Screens Table** — ALL routes with methods, handlers/files, auth requirements
4. **State Machines** — ASCII diagram + transition table for each stateful entity
5. **Key Subsystems** — 1 paragraph + key files per major subsystem

Framework-specific additions:

| Framework | Extra Sections |
|-----------|---------------|
| **Laravel** | Multi-tenancy tree (Account → scoped models), Observer → Job async flow, Docker services, Scheduled commands |
| **Next.js** | Server/Client Component boundary, Caching strategy (ISR, revalidate), RSC payload flow |
| **NestJS** | DI/IoC container flow, Module import/export graph, Request pipeline (Middleware → Guards → Interceptors → Pipes → Handler → Interceptors → Filters) |
| **Expo/RN** | Navigation tree (Stack/Tab/Drawer nesting), Data flow layers (Screen → Hook → API Hook → Service → Backend), State management strategy table, Offline strategy, Authentication flow, Deep linking |
| **Node.js** | Package dependency graph, Subpath export map |

### File 4: Update `CLAUDE.md`

Add imports and Quick Reference table:

```markdown
## Project Documentation

@.claude/claude-md-refs/architecture.md
@.claude/claude-md-refs/development-guide.md
@.claude/claude-md-refs/exports-reference.md

## Quick Documentation Reference

| Need Help With | See File |
|----------------|----------|
| Adding features, endpoints, screens | development-guide.md |
| Understanding system structure, flows | architecture.md |
| Finding models, services, hooks, exports | exports-reference.md |
```

---

## Phase 3: Verification (MANDATORY)

Do NOT mark complete until ALL checks pass.

### Check 1: API Surface Coverage (>90%)

Run framework-appropriate count:

| Framework | Actual Count Command | Documented Count |
|-----------|---------------------|------------------|
| Laravel | `find app -name "*.php" -type f \| wc -l` | `grep -c "^\|" .claude/claude-md-refs/exports-reference.md` |
| Next.js | `find app -name 'page.tsx' -o -name 'route.ts' \| wc -l` | Count route table rows |
| NestJS | `find src -name '*.module.ts' -o -name '*.controller.ts' -o -name '*.service.ts' \| wc -l` | Count module/controller/service rows |
| Expo/RN | `find app -name '*.tsx' ! -name '_layout.tsx' \| wc -l` + `find src -name 'use*.ts' \| wc -l` | Count route + hook rows |
| Node.js | `grep -rh "^export" packages/*/src/index.ts \| wc -l` | Count export table rows |

**FAIL if:** Coverage < 90%. Go back to Phase 1.

### Check 2: Context Budget

```bash
wc -l CLAUDE.md .claude/claude-md-refs/*.md
```

**FAIL if:** CLAUDE.md > 1,000 lines, any import > 500, total > 2,500.

### Check 3: Required Sections

**exports-reference.md:** Has table for EACH category, has Import/Use Patterns section
**development-guide.md:** Has "Adding a New X" with numbered steps and actual code
**architecture.md:** Has dependency graph, request lifecycle, route/screen table, state machines (if any)

### Check 4: No Duplicates

No information duplicated between CLAUDE.md and import files, or between import files.

### Check 5: AI Effectiveness Test

Can an AI agent now:
- [ ] Find any model/service/hook/export by searching exports-reference.md?
- [ ] Add a new feature by following development-guide.md step-by-step?
- [ ] Understand the system architecture from architecture.md?
- [ ] Know which file to read for any task from CLAUDE.md Quick Reference?

**If ANY answer is "no", the documentation is incomplete.**

---

## Quality Checklist (Must Score 10/10)

| Category | 0 points | 1 point | 2 points |
|----------|----------|---------|----------|
| **API Surface Coverage** | <50% documented | 50-89% | >90% in tables |
| **Implementation Guidance** | Describes what exists | Shows file locations | Step-by-step with code templates |
| **State/Workflow Diagrams** | No diagrams | Lists states | ASCII diagram + transition table |
| **Routes/Screens** | No route docs | Lists some routes | Complete table with methods, auth |
| **Context Efficiency** | Over budget | Within budget, has duplication | Within budget, no duplication |

**Total: 10/10 required to complete this skill.**

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Skipping framework detection | Phase 0 prevents using wrong discovery commands |
| Using Node.js patterns for Laravel | PHP has classes/traits/models, not exports/packages |
| Using controller patterns for Next.js | Next.js uses file-based routing, not controller classes |
| Generic descriptions | Every code example must come from the actual codebase |
| Missing exports-reference.md | This file is REQUIRED, not optional |
| Over context budget | Tables > prose, reference by path for code >30 lines |
| Self-assessing "good enough" | Use objective verification checks |

---

## Failure Modes

### Failure Mode 1: Skipping Discovery
**Symptom:** Writing docs immediately, missing 40%+ of items
**Fix:** Phase 1 is MANDATORY. Complete inventory before writing ANY documentation.

### Failure Mode 2: Wrong Framework Detection
**Symptom:** Using `grep "^export"` on a Laravel project, or scanning `app/Models/` on a Next.js project
**Fix:** Phase 0 detection is MANDATORY. Check files in priority order.

### Failure Mode 3: Generic Templates
**Symptom:** Copy-pasting skill templates without actual project code
**Fix:** Every code example must come from the actual codebase. No placeholders.

### Failure Mode 4: Over Budget
**Symptom:** CLAUDE.md > 1000 lines, context bloat
**Fix:** Tables > prose, reference by path for code >30 lines, consolidate sections.

### Failure Mode 5: Self-Assessing "Good Enough"
**Symptom:** Marking complete at 70% coverage without running verification commands
**Fix:** Run ALL verification checks. Must pass ALL 5 objectively.

### Failure Mode 6: No State Machines
**Symptom:** Listing states without visual diagram
**Fix:** Add ASCII diagram + transition table for every entity with states.

---

## Quick Workflow Summary

```
PHASE 0: DETECT FRAMEWORK
├── Check composer.json+artisan → Laravel
├── Check next.config.* → Next.js
├── Check nest-cli.json/@nestjs/core → NestJS
├── Check app.json(expo)+_layout.tsx → Expo/React Native
├── Check packages/*/package.json → Node.js monorepo
└── Announce detected framework

PHASE 1: DISCOVERY (framework-specific, do not skip)
├── Scan all classes/files/exports per framework steps
├── Map all routes/screens
├── Identify state machines
└── Create inventory with counts

PHASE 2: DOCUMENTATION (3 required files)
├── CREATE exports-reference.md (>90% coverage, framework tables)
├── CREATE development-guide.md (step-by-step, actual code)
├── CREATE architecture.md (diagrams, routes, flows)
└── UPDATE CLAUDE.md (add @imports, keep <1000 lines)

PHASE 3: VERIFICATION (all must pass)
├── API surface coverage >90%
├── Context budget met (<2500 lines total)
├── All required sections present
├── No duplicates between files
└── AI effectiveness test passes

COMPLETE: Announce final quality score (must be 10/10)
```

---

## Completion Announcement

```
Documentation update complete.

**Framework:** [Laravel/Next.js/NestJS/Expo/Node.js monorepo]

**Quality Score: X/10**
- API Surface Coverage: X/2 (Y% of Z items documented)
- Implementation Guidance: X/2
- State/Workflow Diagrams: X/2
- Routes/Screens: X/2
- Context Efficiency: X/2

**Files created/updated:**
- exports-reference.md: X lines
- development-guide.md: X lines
- architecture.md: X lines
- CLAUDE.md: X lines
- Total: X lines (within 2,500 budget)

**Verification passed:** All 5 checks complete.
```

---

_This skill ensures documentation enables AI agents to implement features correctly on the first attempt — across Laravel, Next.js, NestJS, Expo/React Native, and Node.js monorepo projects._
