---
name: update-claude-settings
description: Use when setting up a new project, auditing existing settings, or determining which read-only bash commands to allow. Analyzes the repository to detect tech stack, build tools, frameworks, services, and monorepo structure, then generates recommended Claude Code settings.local.json permissions and MCP server suggestions. Invoke via /update-claude-settings or when user says "audit settings", "setup permissions", "configure claude settings".
---

<EXTREMELY-IMPORTANT>
Before generating ANY settings recommendations, you **ABSOLUTELY MUST**:

1. Detect the actual tech stack from lock files and config files (not assumptions)
2. Read existing .claude/settings.local.json and .mcp.json to understand current state
3. Include both read-only AND development commands appropriate for each detected tool
4. Only include commands for tools actually detected in the project
5. Never include absolute paths, user-specific paths, or destructive system commands

**Generating settings without detection = wrong package manager commands, missing tools, security risks**

This is not optional. Every recommendation requires stack verification.
</EXTREMELY-IMPORTANT>

# Update Claude Settings

## MANDATORY FIRST RESPONSE PROTOCOL

Before generating ANY settings, you **MUST** complete this checklist:

1. ☐ List all files in the repository root (`ls -la`)
2. ☐ Detect config and lock files (package.json, pyproject.toml, go.mod, Cargo.toml, etc.)
3. ☐ Read dependency files to identify frameworks and libraries
4. ☐ Check for monorepo indicators (lerna.json, nx.json, turbo.json, pnpm-workspace.yaml)
5. ☐ Check for service integrations (Sentry, Linear, etc.)
6. ☐ Read existing .claude/settings.local.json (if it exists)
7. ☐ Read existing .mcp.json (if it exists)
8. ☐ Announce: "Detected [stack]: generating settings for [N] command categories and [M] WebFetch domains"

**Generating settings WITHOUT completing this checklist = wrong permissions and missed tools.**

## Overview

Analyze a repository to generate recommended Claude Code `settings.local.json` permissions for read-only commands. Detects the tech stack, build tools, frameworks, services, and monorepo structure to produce accurate, project-specific recommendations.

**What this skill does:**
- Detects languages, package managers, frameworks, and build tools from config/lock files
- Detects service integrations (Sentry, Linear, etc.)
- Generates a complete `settings.local.json` with both read-only AND development commands
- Includes framework-specific commands Claude needs (artisan, next, expo, manage.py, cargo, etc.)
- Suggests relevant WebFetch domains for framework documentation
- Suggests MCP server configurations when applicable
- Merges with existing settings if present

**What this skill does NOT do:**
- Install or configure any tools
- Modify code or project structure
- Include destructive system commands (rm -rf, format, etc.)
- Guess at tools not detected in the project
- Include user-specific or absolute paths

## When to Use

- User says "audit settings", "setup permissions", "configure claude settings", "/update-claude-settings"
- User is setting up a new project with Claude Code
- User wants to review or update existing Claude Code permissions
- $ARGUMENTS provided as guidance (e.g., `/update-claude-settings add docker commands`)

**Never generate settings proactively.** Only when explicitly requested.

## When NOT to Use

- **Empty repository** — no files to detect; ask user to describe their stack instead
- **User wants to run commands** — this skill generates permission config, it doesn't execute project commands
- **User wants to modify code** — this skill only produces settings.local.json and .mcp.json recommendations
- **Settings are already comprehensive** — if existing settings cover the detected stack, say so

## Step 1: Detect Tech Stack

**Gate: All languages, package managers, and build tools identified before proceeding to Step 2.**

Run detection commands:

```bash
# List root directory contents
ls -la

# Find config and lock files (up to 2 levels deep)
find . -maxdepth 2 \( -name "*.toml" -o -name "*.json" -o -name "*.lock" -o -name "*.yaml" -o -name "*.yml" -o -name "Makefile" -o -name "Dockerfile" -o -name "*.tf" \) 2>/dev/null | head -50
```

Check for these indicator files:

| Category | Files to Check |
|----------|---------------|
| **Python** | `pyproject.toml`, `setup.py`, `requirements.txt`, `Pipfile`, `poetry.lock`, `uv.lock` |
| **Node.js** | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb` |
| **Go** | `go.mod`, `go.sum` |
| **Rust** | `Cargo.toml`, `Cargo.lock` |
| **Ruby** | `Gemfile`, `Gemfile.lock` |
| **Java/Kotlin** | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| **PHP** | `composer.json`, `composer.lock` |
| **Swift/iOS** | `Package.swift`, `*.xcodeproj`, `*.xcworkspace`, `Podfile` |
| **.NET** | `*.csproj`, `*.sln`, `nuget.config` |
| **React Native** | `app.json` (with `expo` key), `metro.config.js`, `react-native.config.js`, `eas.json` |
| **Build** | `Makefile`, `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml` |
| **Infra** | `*.tf` files, `kubernetes/`, `helm/`, `pulumi/`, `serverless.yml` |
| **Monorepo** | `lerna.json`, `nx.json`, `turbo.json`, `pnpm-workspace.yaml` |

## Step 2: Detect Frameworks and Services

**Gate: All frameworks and service integrations identified before proceeding to Step 3.**

Read dependency files to identify frameworks:

- `package.json` → check `dependencies` and `devDependencies`
- `pyproject.toml` → check `[project.dependencies]` or `[tool.poetry.dependencies]`
- `Gemfile` → check gem names
- `Cargo.toml` → check `[dependencies]`
- `composer.json` → check `require` and `require-dev`
- `go.mod` → check `require` block

Check for framework-specific indicators:

| Framework | Detection |
|-----------|-----------|
| **Next.js** | `next` in package.json deps, `next.config.js`/`next.config.mjs`/`next.config.ts` |
| **React (Vite)** | `vite` + `react` in package.json deps, `vite.config.ts`/`vite.config.js` |
| **Expo/React Native** | `expo` in package.json deps, `app.json` with `expo` key, `eas.json` |
| **Express** | `express` in package.json deps |
| **Laravel** | `laravel/framework` in composer.json require, `artisan` file in root |
| **Magento** | `magento/framework` in composer.json require, `bin/magento` |
| **Django** | `django` in Python deps |
| **FastAPI** | `fastapi` in Python deps |
| **Tailwind CSS** | `tailwindcss` in package.json deps, `tailwind.config.js`/`tailwind.config.ts` |

Check for service integrations:

| Service | Detection |
|---------|-----------|
| **Sentry** | `sentry-sdk` in deps, `@sentry/*` packages, `.sentryclirc`, `sentry.properties` |
| **Linear** | Linear config files, `.linear/` directory |
| **Datadog** | `dd-trace` in deps, `datadog.yaml` |
| **AWS** | `aws-cdk` in deps, `samconfig.toml`, `serverless.yml` |
| **Vercel** | `vercel.json`, `@vercel/*` packages |
| **Supabase** | `supabase/` directory, `@supabase/*` packages |
| **Firebase** | `firebase.json`, `@firebase/*` or `firebase-admin` in deps |

## Step 3: Check Existing Settings

**Gate: Current settings state understood before proceeding to Step 4.**

Read existing configuration files:

```bash
# Check existing Claude Code settings
cat .claude/settings.local.json 2>/dev/null || echo "No existing settings"

# Check existing MCP config
cat .mcp.json 2>/dev/null || echo "No existing .mcp.json"
```

If existing settings are found:
1. Note which commands are already allowed
2. Note which commands are denied
3. Identify gaps (detected tools not in settings)
4. Identify stale entries (settings for tools no longer in the project)

## Step 4: Build Recommendations

**Gate: Complete recommendation generated before proceeding to Step 5.**

Build the allow list by combining baseline commands with stack-specific commands.

### Baseline Commands (Always Include)

These read-only commands are safe and useful for any project:

```json
[
  "Bash(ls:*)",
  "Bash(pwd:*)",
  "Bash(find:*)",
  "Bash(file:*)",
  "Bash(stat:*)",
  "Bash(wc:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(cat:*)",
  "Bash(tree:*)",
  "Bash(git status:*)",
  "Bash(git log:*)",
  "Bash(git diff:*)",
  "Bash(git show:*)",
  "Bash(git branch:*)",
  "Bash(git remote:*)",
  "Bash(git tag:*)",
  "Bash(git stash list:*)",
  "Bash(git rev-parse:*)",
  "Bash(gh pr view:*)",
  "Bash(gh pr list:*)",
  "Bash(gh pr checks:*)",
  "Bash(gh pr diff:*)",
  "Bash(gh issue view:*)",
  "Bash(gh issue list:*)",
  "Bash(gh run view:*)",
  "Bash(gh run list:*)",
  "Bash(gh run logs:*)",
  "Bash(gh repo view:*)",
  "Bash(gh api:*)"
]
```

### Stack-Specific Commands

Only include commands for tools actually detected in the project. Each section is split into **read-only** (safe to auto-allow) and **development** (needed for Claude to work effectively with the framework) commands.

#### Python

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| Any Python | `python --version`, `python3 --version` | `python`, `python3` |
| `poetry.lock` | `poetry show`, `poetry env info` | `poetry install`, `poetry add`, `poetry remove`, `poetry run`, `poetry lock` |
| `uv.lock` | `uv pip list`, `uv tree` | `uv pip install`, `uv add`, `uv remove`, `uv run`, `uv sync`, `uv lock` |
| `Pipfile.lock` | `pipenv graph` | `pipenv install`, `pipenv run` |
| `requirements.txt` (no other lock) | `pip list`, `pip show`, `pip freeze` | `pip install` |
| pytest detected | — | `pytest`, `python -m pytest` |
| mypy/pyright detected | — | `mypy`, `pyright` |
| ruff detected | — | `ruff check`, `ruff format` |

**Python frameworks:**

| If Detected | Development Commands |
|-------------|---------------------|
| **Django** | `python manage.py`, `django-admin` (e.g., `manage.py runserver`, `manage.py migrate`, `manage.py makemigrations`, `manage.py test`, `manage.py shell`, `manage.py createsuperuser`) |
| **FastAPI** | `uvicorn`, `fastapi` (e.g., `uvicorn main:app`, `fastapi dev`) |
| **Flask** | `flask run`, `flask shell` |
| **Celery** | `celery -A`, `celery worker`, `celery beat` |
| **Alembic** | `alembic upgrade`, `alembic downgrade`, `alembic revision`, `alembic history` |

#### Node.js

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| Any Node.js | `node --version` | `node` |
| `pnpm-lock.yaml` | `pnpm list`, `pnpm why` | `pnpm install`, `pnpm add`, `pnpm remove`, `pnpm run`, `pnpm exec`, `pnpm dlx`, `pnpm test` |
| `yarn.lock` | `yarn list`, `yarn info`, `yarn why` | `yarn install`, `yarn add`, `yarn remove`, `yarn run`, `yarn dlx`, `yarn test` |
| `bun.lockb` | `bun --version` | `bun install`, `bun add`, `bun remove`, `bun run`, `bun test`, `bunx` |
| `package-lock.json` | `npm list`, `npm view`, `npm outdated` | `npm install`, `npm run`, `npm test`, `npm exec`, `npx` |
| TypeScript (`tsconfig.json`) | `tsc --version` | `tsc`, `tsc --noEmit`, `npx tsc` |
| ESLint detected | — | `eslint`, `npx eslint` |
| Prettier detected | — | `prettier`, `npx prettier` |
| Vitest detected | — | `vitest`, `npx vitest` |
| Jest detected | — | `jest`, `npx jest` |

**Node.js frameworks:**

| If Detected | Development Commands |
|-------------|---------------------|
| **Next.js** | `npx next build`, `npx next dev`, `npx next start`, `npx next lint`, `npx next info` |
| **Expo/React Native** | `npx expo start`, `npx expo prebuild`, `npx expo install`, `npx expo config`, `npx expo lint`, `eas build`, `eas update`, `eas submit`, `npx eas --version` |
| **Vite** | `npx vite`, `npx vite build`, `npx vite preview` |
| **Express** | (uses `node` and package manager `run` commands — no additional CLI) |
| **Tailwind CSS** | `npx tailwindcss`, `npx tailwindcss --watch` |
| **Storybook** | `npx storybook dev`, `npx storybook build` |
| **Prisma** | `npx prisma generate`, `npx prisma migrate`, `npx prisma db push`, `npx prisma db pull`, `npx prisma studio`, `npx prisma format` |
| **Drizzle** | `npx drizzle-kit generate`, `npx drizzle-kit migrate`, `npx drizzle-kit push`, `npx drizzle-kit studio` |

#### PHP

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| `composer.json` | `php --version`, `composer show`, `composer info` | `php`, `composer install`, `composer require`, `composer remove`, `composer update`, `composer dump-autoload` |
| PHPUnit detected | — | `phpunit`, `./vendor/bin/phpunit` |
| PHPStan detected | — | `phpstan`, `./vendor/bin/phpstan` |

**PHP frameworks:**

| If Detected | Development Commands |
|-------------|---------------------|
| **Laravel** | `php artisan` (e.g., `artisan migrate`, `artisan make:model`, `artisan make:controller`, `artisan make:migration`, `artisan route:list`, `artisan config:show`, `artisan test`, `artisan tinker`, `artisan queue:work`, `artisan schedule:run`, `artisan db:seed`, `artisan cache:clear`, `artisan key:generate`, `artisan serve`) |
| **Magento** | `php bin/magento` (e.g., `bin/magento setup:upgrade`, `bin/magento cache:flush`, `bin/magento module:status`, `bin/magento indexer:reindex`, `bin/magento setup:di:compile`) |
| **Symfony** | `php bin/console` (e.g., `bin/console doctrine:migrations:migrate`, `bin/console make:entity`, `bin/console cache:clear`) |

#### Go

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| `go.mod` | `go version`, `go list`, `go mod graph`, `go env` | `go build`, `go run`, `go test`, `go vet`, `go fmt`, `go mod tidy`, `go mod download`, `go generate`, `go get` |
| golangci-lint detected | — | `golangci-lint run` |

#### Rust

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| `Cargo.toml` | `rustc --version`, `cargo --version`, `cargo tree`, `cargo metadata` | `cargo build`, `cargo run`, `cargo test`, `cargo check`, `cargo clippy`, `cargo fmt`, `cargo add`, `cargo remove` |

#### Ruby

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| `Gemfile` | `ruby --version`, `bundle list`, `bundle show` | `bundle install`, `bundle exec`, `bundle add` |

**Ruby frameworks:**

| If Detected | Development Commands |
|-------------|---------------------|
| **Rails** | `rails` (e.g., `rails server`, `rails console`, `rails generate`, `rails db:migrate`, `rails db:seed`, `rails test`, `rails routes`) |
| RSpec detected | `rspec`, `bundle exec rspec` |

#### Java/Kotlin

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| `pom.xml` | `java --version`, `mvn --version`, `mvn dependency:tree` | `mvn compile`, `mvn test`, `mvn package`, `mvn clean`, `mvn install` |
| `build.gradle` / `build.gradle.kts` | `java --version`, `gradle --version`, `gradle dependencies` | `gradle build`, `gradle test`, `gradle clean`, `gradle run`, `./gradlew` |

#### .NET

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| `*.csproj` / `*.sln` | `dotnet --version`, `dotnet list package` | `dotnet build`, `dotnet run`, `dotnet test`, `dotnet add package`, `dotnet remove package`, `dotnet ef` |

#### Build Tools & Infrastructure

| If Detected | Read-Only Commands | Development Commands |
|-------------|-------------------|---------------------|
| `Dockerfile` | `docker --version`, `docker ps`, `docker images` | `docker build`, `docker run`, `docker exec`, `docker logs`, `docker stop`, `docker rm` |
| `docker-compose.yml` | `docker-compose ps`, `docker-compose config` | `docker-compose up`, `docker-compose down`, `docker-compose build`, `docker-compose logs`, `docker-compose exec` |
| `*.tf` files | `terraform --version`, `terraform providers`, `terraform state list` | `terraform plan`, `terraform apply`, `terraform init`, `terraform validate` |
| `Makefile` | `make --version`, `make -n` | `make` |
| `serverless.yml` | `serverless --version` | `serverless deploy`, `serverless invoke`, `serverless logs` |
| AWS CDK (`aws-cdk` in deps) | `cdk --version` | `cdk synth`, `cdk diff`, `cdk deploy`, `cdk destroy` |

### Package Manager Exclusion Rules

Only include the package manager actually used by the project:

| If Detected | Include | Do NOT Include |
|-------------|---------|---------------|
| `pnpm-lock.yaml` | pnpm commands | npm, yarn, bun |
| `yarn.lock` | yarn commands | npm, pnpm, bun |
| `bun.lockb` | bun commands | npm, yarn, pnpm |
| `package-lock.json` | npm commands | yarn, pnpm, bun |
| `poetry.lock` | poetry commands | pip (unless also has requirements.txt) |
| `uv.lock` | uv commands | pip, poetry |
| `Pipfile.lock` | pipenv commands | pip, poetry |

If multiple lock files exist, include only the commands for each detected manager.

### WebFetch Domains

Add documentation domains for detected frameworks:

| If Detected | Add Domains |
|-------------|------------|
| **Django** | `docs.djangoproject.com` |
| **Flask** | `flask.palletsprojects.com` |
| **FastAPI** | `fastapi.tiangolo.com` |
| **React** | `react.dev` |
| **Next.js** | `nextjs.org` |
| **Expo/React Native** | `docs.expo.dev`, `reactnative.dev` |
| **Vite** | `vite.dev` |
| **Tailwind CSS** | `tailwindcss.com` |
| **Vue** | `vuejs.org` |
| **Angular** | `angular.dev` |
| **Svelte** | `svelte.dev` |
| **Express** | `expressjs.com` |
| **Rails** | `guides.rubyonrails.org`, `api.rubyonrails.org` |
| **Laravel** | `laravel.com` |
| **Magento** | `developer.adobe.com` |
| **Go** | `pkg.go.dev` |
| **Rust** | `docs.rs`, `doc.rust-lang.org` |
| **Docker** | `docs.docker.com` |
| **Kubernetes** | `kubernetes.io` |
| **Terraform** | `registry.terraform.io` |
| **AWS CDK** | `docs.aws.amazon.com` |
| **Firebase** | `firebase.google.com` |

Always include general-purpose domains:

```json
[
  "WebFetch(domain:docs.github.com)",
  "WebFetch(domain:cli.github.com)"
]
```

### MCP Server Suggestions

MCP servers are configured in `.mcp.json` (not `settings.local.json`). Only suggest MCP servers for detected services.

```bash
# Check existing MCP config
cat .mcp.json 2>/dev/null || echo "No existing .mcp.json"
```

#### Sentry MCP (if Sentry SDK detected)

```json
{
  "mcpServers": {
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp/{org-slug}/{project-slug}"
    }
  }
}
```

#### Linear MCP (if Linear usage detected)

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "@linear/mcp-server"],
      "env": {
        "LINEAR_API_KEY": "${LINEAR_API_KEY}"
      }
    }
  }
}
```

**Note:** Never suggest GitHub MCP. Always use `gh` CLI commands for GitHub operations.

## Step 5: Present Recommendations

**Gate: User has reviewed the recommendations before proceeding to Step 6.**

Present findings in this structure:

### Output Format

```
## Detected Tech Stack

| Category | Found |
|----------|-------|
| Languages | [detected languages] |
| Package Manager | [detected manager] |
| Frameworks | [detected frameworks] |
| Services | [detected services] |
| Build Tools | [detected tools] |
| Monorepo | [yes/no, tool name] |

## Recommended .claude/settings.local.json

{complete JSON with grouped, commented permissions}

## Recommended .mcp.json (if applicable)

{MCP server config for detected services}

## Changes from Current Settings (if existing settings found)

| Change | Description |
|--------|------------|
| Added | [new commands for detected tools] |
| Removed | [stale commands for tools no longer detected] |
| Unchanged | [commands that remain the same] |
```

Use AskUserQuestion to confirm before writing any files:
- "Apply these settings?" with options to apply all, apply selectively, or just view

## Step 6: Apply Settings

**Gate: User approved the recommendations before writing files.**

If the user approves:

1. Write `.claude/settings.local.json` with the recommended permissions
2. Write `.mcp.json` with MCP server suggestions (if applicable)
3. If merging with existing settings, preserve user customizations (deny list, custom commands)

If existing settings exist, show a clear diff of what will change before writing.

## Step 7: Verify Applied Settings

**Gate: Settings files are valid JSON and contain expected content.**

After writing:

1. Verify `.claude/settings.local.json` is valid JSON:

```bash
python3 -c "import json; json.load(open('.claude/settings.local.json'))" 2>&1 || echo "Invalid JSON"
```

2. Verify `.mcp.json` is valid JSON (if written):

```bash
python3 -c "import json; json.load(open('.mcp.json'))" 2>&1 || echo "Invalid JSON"
```

3. Confirm all detected tools have corresponding commands in the settings
4. Confirm no write/modify commands were included

---

## Safety Rules

| Rule | Reason |
|------|--------|
| Never include destructive system commands | No `rm -rf`, `format`, `fdisk`, or system-level destructive operations |
| Never include absolute paths | Paths are user-specific and non-portable |
| Never include custom scripts | Project scripts may have side effects; only standard tool commands |
| Never guess at tools | Only include commands for tools detected via config/lock files |
| Never include wrong package manager | If project uses pnpm, don't include npm/yarn commands |
| Always include development commands | Claude needs build, test, run, install commands to work effectively |
| Always read existing settings first | Preserve user customizations and deny lists |
| Always verify JSON validity | Invalid settings.local.json breaks Claude Code |
| Always get user approval before writing | User must review recommendations before files are modified |
| Never suggest GitHub MCP | Use `gh` CLI commands for GitHub operations instead |

---

## Quick Reference: Package Manager Detection

```
Lock file exists?
├── pnpm-lock.yaml → pnpm (exclude npm, yarn, bun)
├── yarn.lock → yarn (exclude npm, pnpm, bun)
├── bun.lockb → bun (exclude npm, yarn, pnpm)
├── package-lock.json → npm (exclude yarn, pnpm, bun)
├── poetry.lock → poetry (exclude pip unless requirements.txt also exists)
├── uv.lock → uv (exclude pip, poetry)
├── Pipfile.lock → pipenv (exclude pip, poetry)
├── Cargo.lock → cargo
├── Gemfile.lock → bundler
├── go.sum → go
└── composer.lock → composer
```

---

## Step 8: Verification (MANDATORY)

After completing settings generation, verify the full workflow:

### Check 1: Stack Detection Accuracy
- [ ] Every language detected has corresponding commands in settings
- [ ] No commands included for undetected tools

### Check 2: Command Safety
- [ ] No destructive system commands included (rm -rf, format, fdisk, etc.)
- [ ] No absolute paths or user-specific paths included
- [ ] Development commands are appropriate for detected frameworks

### Check 3: Package Manager Correctness
- [ ] Only the detected package manager's commands are included
- [ ] No competing package manager commands present

### Check 4: Settings Validity
- [ ] `.claude/settings.local.json` is valid JSON (if written)
- [ ] `.mcp.json` is valid JSON (if written)

### Check 5: Completeness
- [ ] WebFetch domains included for detected frameworks
- [ ] MCP suggestions provided for detected services
- [ ] Existing settings preserved where applicable

**Gate:** Do NOT mark settings generation complete until all 5 checks pass.

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking settings generation complete:

### Stack Detection (0-2 points)
- **0 points:** Assumed tech stack without reading config files
- **1 point:** Detected some tools but missed others
- **2 points:** Detected all languages, package managers, frameworks, services, and build tools from config/lock files

### Command Accuracy (0-2 points)
- **0 points:** Included commands for undetected tools or missed framework-specific commands
- **1 point:** Mostly correct but included wrong package manager or missed development commands
- **2 points:** Every command matches a detected tool, includes both read-only and development commands, correct package manager only

### Existing Settings Handling (0-2 points)
- **0 points:** Overwrote existing settings without reading them
- **1 point:** Read existing settings but didn't preserve customizations
- **2 points:** Read existing settings, preserved deny list and custom commands, showed clear diff

### Output Quality (0-2 points)
- **0 points:** Dumped raw JSON without explanation
- **1 point:** Provided settings but missing summary table or grouping
- **2 points:** Complete output: summary table, grouped/commented JSON, merge instructions if applicable

### Verification (0-2 points)
- **0 points:** Didn't verify JSON validity or command correctness
- **1 point:** Verified JSON but didn't check for write commands or wrong package managers
- **2 points:** Verified JSON validity, read-only compliance, package manager correctness, and completeness

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"Most projects use npm"** → STILL detect the actual package manager from lock files
- **"These extra commands might be useful"** → STILL only include commands for detected tools
- **"Any dev command is fine to include"** → STILL verify each command is appropriate for the detected framework
- **"The user can fix it later"** → Get it right NOW; wrong settings cause permission friction
- **"There's no existing settings.local.json"** → STILL check; the user may have customizations elsewhere
- **"I'll just include all package managers"** → STILL exclude package managers not detected in the project
- **"Absolute paths work on this machine"** → STILL use only portable command names
- **"This MCP server would be helpful"** → STILL only suggest MCP servers for detected services

---

## Failure Modes

### Failure Mode 1: Wrong Package Manager

**Symptom:** Settings include npm commands but the project uses pnpm (or similar mismatch)
**Fix:** Always check lock files first. The lock file determines the package manager, not assumptions.

### Failure Mode 2: Destructive Commands Included

**Symptom:** Settings allow `rm -rf`, system-level destructive operations, or commands that could cause data loss
**Fix:** Review every command for safety. Development commands (install, build, test, run) are fine; system-level destructive commands are not.

### Failure Mode 3: Absolute Paths

**Symptom:** Settings include `/Users/name/bin/tool` or `/home/user/.local/bin/script`
**Fix:** Never include absolute paths. Only use bare command names that resolve via PATH.

### Failure Mode 4: Stale Settings

**Symptom:** Settings include commands for tools removed from the project
**Fix:** Always detect the current stack before generating. Cross-reference existing settings against detected tools.

### Failure Mode 5: Invalid JSON

**Symptom:** Claude Code fails to load settings because of JSON syntax errors
**Fix:** Always validate JSON after writing. Use `python3 -c "import json; json.load(open(...))"` to verify.

---

## Quick Workflow Summary

```
STEP 1: DETECT TECH STACK
├── List root directory
├── Find config and lock files
├── Identify languages and package managers
└── Gate: All tools identified

STEP 2: DETECT FRAMEWORKS AND SERVICES
├── Read dependency files
├── Check for service integrations
└── Gate: All frameworks and services identified

STEP 3: CHECK EXISTING SETTINGS
├── Read .claude/settings.local.json
├── Read .mcp.json
├── Note gaps and stale entries
└── Gate: Current state understood

STEP 4: BUILD RECOMMENDATIONS
├── Start with baseline commands
├── Add stack-specific commands
├── Add WebFetch domains
├── Add MCP suggestions
├── Enforce package manager exclusion rules
└── Gate: Complete recommendation generated

STEP 5: PRESENT RECOMMENDATIONS
├── Show detected stack summary
├── Show recommended settings.local.json
├── Show changes from current (if applicable)
├── Get user approval
└── Gate: User reviewed

STEP 6: APPLY SETTINGS
├── Write .claude/settings.local.json
├── Write .mcp.json (if applicable)
├── Preserve existing customizations
└── Gate: User approved and files written

STEP 7: VERIFY SETTINGS
├── Validate JSON
├── Confirm read-only compliance
├── Confirm package manager correctness
└── Gate: Settings verified

STEP 8: VERIFICATION (MANDATORY)
├── Check 1: Stack detection accuracy
├── Check 2: Read-only compliance
├── Check 3: Package manager correctness
├── Check 4: Settings validity
├── Check 5: Completeness
└── Gate: All 5 checks pass
```

---

## Completion Announcement

When settings generation is complete, announce:

```
Settings generation complete.

**Quality Score: X/10**
- Stack Detection: X/2
- Command Accuracy: X/2
- Existing Settings Handling: X/2
- Output Quality: X/2
- Verification: X/2

**Detected Stack:**
- Languages: [list]
- Package Manager: [name]
- Frameworks: [list]
- Services: [list]
- Build Tools: [list]

**Settings:**
- Commands allowed: [count]
- WebFetch domains: [count]
- MCP servers suggested: [count]
- Existing settings: [merged / new / unchanged]

**Verification:**
- JSON valid: ✅
- No destructive commands: ✅
- Correct package manager: ✅
- All tools covered (read-only + development): ✅

**Next steps:**
[Review settings in .claude/settings.local.json, restart Claude Code to apply]
```

---

## Integration with Other Skills

The `update-claude-settings` skill integrates with:

- **`start`** — Run `update-claude-settings` when setting up a new project
- **`map-project`** — After mapping the project, update settings to match
- **`commit`** — After generating settings, commit the changes

**Workflow Chain:**

```
New project setup
       │
       ▼
update-claude-settings skill (this skill)
       │
       ▼
commit skill (commit settings files)
       │
       ▼
Begin development with correct permissions
```
