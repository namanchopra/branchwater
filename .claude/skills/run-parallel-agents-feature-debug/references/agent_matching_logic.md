# Agent Matching Logic Reference

This document provides detailed rules, patterns, and edge cases for matching features, tasks, and file types to the appropriate specialized agent.

## Agent Type Catalog

### laravel-senior-engineer

**Primary Expertise:**

- Laravel 12.x backend development
- Eloquent ORM and database operations (MySQL, Redis, DynamoDB)
- Queue systems with Horizon
- Service layer patterns
- RESTful API development
- Artisan commands and migrations

**Technology Indicators:**

- File extensions: `*.php`
- Directory patterns: `/app/`, `/routes/`, `/database/`, `/config/`
- Framework files: `artisan`, `composer.json` with Laravel dependencies
- Code patterns: Eloquent models, `namespace App\`, Laravel facades

**Common Task Patterns:**

- "Build API endpoint for..."
- "Create Eloquent model for..."
- "Implement queue job for..."
- "Add migration for..."
- "Create service class for..."

**Edge Cases:**

- Pure PHP without Laravel → Use `general-purpose` instead
- Magento PHP code → Use `laravel-senior-engineer` (Magento is PHP/Composer-based; closest match)
- WordPress PHP → Use `general-purpose` (no WordPress agent)

---

### nextjs-senior-engineer

**Primary Expertise:**

- Next.js 14/15 with App Router
- React Server Components (RSC)
- Server Actions
- Client and server-side rendering strategies
- Advanced caching (revalidation, static generation)
- API routes and middleware

**Technology Indicators:**

- File extensions: `*.tsx`, `*.jsx`
- Directory patterns: `/app/`, `/pages/`, `/components/`
- Framework files: `next.config.js`, `next.config.ts`, `package.json` with `next` dependency
- Code patterns: `'use client'`, `'use server'`, Server Actions, RSC patterns

**Common Task Patterns:**

- "Build page for..."
- "Create React component for..."
- "Implement server action for..."
- "Add API route for..."
- "Build dashboard/UI for..."

**Edge Cases:**

- Pure React without Next.js → Use `react-vite-tailwind-engineer` for Vite/Tailwind setups, or `nextjs-senior-engineer` if it lives in a Next.js project
- Remix app → Use `nextjs-senior-engineer` (closest full-stack React framework agent) or `react-vite-tailwind-engineer` for UI-heavy work
- React Native → Use `expo-react-native-engineer`

---

### react-vite-tailwind-engineer

**Primary Expertise:**

- React with Vite bundler
- Tailwind CSS styling
- TypeScript frontend development
- SPA architecture
- Component libraries and design systems
- Client-side routing (React Router, TanStack Router)

**Technology Indicators:**

- File extensions: `*.tsx`, `*.jsx`, `*.css`
- Directory patterns: `/src/`, `/components/`, `/pages/`
- Framework files: `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `package.json` with `vite` + `react` dependencies
- Code patterns: Tailwind utility classes, `import.meta.env`, Vite-specific patterns

**Common Task Patterns:**

- "Build React component with Tailwind for..."
- "Create Vite-based frontend for..."
- "Style component with Tailwind..."
- "Implement client-side routing for..."
- "Build design system component..."

**Edge Cases:**

- Next.js project with Tailwind → Use `nextjs-senior-engineer` (Next.js takes priority)
- React without Vite or Tailwind → Still use if it's a standalone React SPA
- Storybook components → Good match for component-focused work

---

### express-senior-engineer

**Primary Expertise:**

- Express.js framework
- Middleware architecture
- RESTful API development
- Queue systems with Bull
- Logging with Pino
- Node.js server-side development
- NestJS projects (Express-based under the hood)

**Technology Indicators:**

- File extensions: `*.js`, `*.ts`
- Dependencies: `package.json` with `express` or `@nestjs/*`
- Code patterns: `app.use()`, `app.get()`, `express.Router()`, middleware functions, `@Injectable()`, `@Controller()`

**Common Task Patterns:**

- "Build Express API for..."
- "Create middleware for..."
- "Add REST endpoint for..."
- "Implement Express route handler for..."
- "Build NestJS module for..."
- "Create service with DI for..."

**Edge Cases:**

- NestJS projects → Use `express-senior-engineer` (NestJS uses Express under the hood)
- Fastify without Express → Use `express-senior-engineer` (closest Node.js API agent)
- Serverless functions → Use `general-purpose` unless explicitly Express-based

---

### nodejs-cli-senior-engineer

**Primary Expertise:**

- Node.js CLI tool development
- commander.js / yargs argument parsing
- Interactive prompts (inquirer, prompts)
- File system operations
- Process management and child processes
- npm package publishing

**Technology Indicators:**

- File extensions: `*.js`, `*.ts`
- Framework files: `package.json` with `commander` or `yargs` dependency, `bin` field in package.json
- Directory patterns: `/bin/`, `/cli/`, `/commands/`
- Code patterns: `#!/usr/bin/env node`, `program.command()`, `process.argv`

**Common Task Patterns:**

- "Build CLI tool for..."
- "Add CLI command for..."
- "Implement interactive prompt for..."
- "Create npm CLI package for..."
- "Parse CLI arguments for..."

**Edge Cases:**

- Node.js script (not a CLI tool) → Use `general-purpose`
- Express-based server with CLI entry point → Use `express-senior-engineer` for the server, `nodejs-cli-senior-engineer` for the CLI

---

### python-senior-engineer

**Primary Expertise:**

- Python backend development
- Django web framework
- Data pipelines and ETL
- SQLAlchemy and database operations
- Testing with pytest
- Package management (pip, poetry, uv)

**Technology Indicators:**

- File extensions: `*.py`
- Framework files: `requirements.txt`, `pyproject.toml`, `setup.py`, `manage.py` (Django)
- Directory patterns: `/app/`, `/src/`, `/<project_name>/`
- Code patterns: Django models, Python imports, decorators

**Common Task Patterns:**

- "Build Django view for..."
- "Create Python data pipeline for..."
- "Implement SQLAlchemy model for..."
- "Add pytest tests for..."
- "Build Python script for..."

**Edge Cases:**

- FastAPI project → Use `fastapi-senior-engineer` instead
- Jupyter notebooks / data science → Use `general-purpose` or `python-senior-engineer` depending on scope
- Pure scripting (no framework) → Use `python-senior-engineer` for Python-heavy work

---

### fastapi-senior-engineer

**Primary Expertise:**

- FastAPI framework specifically
- Async database operations (SQLAlchemy async, Tortoise ORM)
- JWT authentication and OAuth2
- Pydantic models and validation
- Background tasks and Celery
- OpenAPI/Swagger documentation

**Technology Indicators:**

- File extensions: `*.py`
- Framework files: `requirements.txt` or `pyproject.toml` with `fastapi` dependency
- Directory patterns: `/app/`, `/routers/`, `/schemas/`, `/models/`
- Code patterns: `@app.get()`, `@app.post()`, `async def`, Pydantic `BaseModel`, `Depends()`

**Common Task Patterns:**

- "Build FastAPI endpoint for..."
- "Create Pydantic schema for..."
- "Implement JWT auth for..."
- "Add async database query for..."
- "Build background task for..."

**Edge Cases:**

- Django project → Use `python-senior-engineer` instead
- Flask project → Use `python-senior-engineer` (closest general Python agent)
- Python script with no web framework → Use `python-senior-engineer`

---

### go-senior-engineer

**Primary Expertise:**

- Go backend services and APIs
- HTTP servers (net/http, Gin, Echo, Fiber)
- Database operations (database/sql, GORM, sqlx)
- Concurrency patterns (goroutines, channels)
- gRPC services
- Middleware and routing

**Technology Indicators:**

- File extensions: `*.go`
- Framework files: `go.mod`, `go.sum`
- Directory patterns: `/cmd/`, `/internal/`, `/pkg/`, `/api/`
- Code patterns: `package main`, `func main()`, `http.HandleFunc`, Go struct definitions

**Common Task Patterns:**

- "Build Go API for..."
- "Create HTTP handler for..."
- "Implement gRPC service for..."
- "Add database layer for..."
- "Build Go microservice for..."

**Edge Cases:**

- Go CLI tool → Use `go-cli-senior-engineer` instead
- Go library (no main) → Use `go-senior-engineer` for API/service libraries
- Go with AWS Lambda → Use `go-senior-engineer` for the Go code, `devops-aws-senior-engineer` for infra

---

### go-cli-senior-engineer

**Primary Expertise:**

- Go CLI tool development
- Cobra command framework
- Viper configuration management
- Interactive terminal UIs (bubbletea, lipgloss)
- File system operations in Go
- Cross-platform binary distribution

**Technology Indicators:**

- File extensions: `*.go`
- Framework files: `go.mod` with `cobra` or `viper` dependency
- Directory patterns: `/cmd/`, `/internal/`
- Code patterns: `cobra.Command{}`, `viper.Get*()`, `os.Args`

**Common Task Patterns:**

- "Build Go CLI tool for..."
- "Add cobra command for..."
- "Implement CLI configuration with viper..."
- "Create terminal UI for..."
- "Build cross-platform CLI..."

**Edge Cases:**

- Go web server → Use `go-senior-engineer` instead
- Simple Go script (no cobra) → Use `go-senior-engineer` or `go-cli-senior-engineer` based on whether it's a CLI tool
- Go tool that is both CLI and server → Split: CLI parts to `go-cli-senior-engineer`, server parts to `go-senior-engineer`

---

### ios-macos-senior-engineer

**Primary Expertise:**

- Swift and SwiftUI development
- Xcode project management
- Swift Package Manager (SPM)
- AVFoundation (audio/video)
- StoreKit (in-app purchases)
- Core Data and SwiftData
- iOS and macOS app development

**Technology Indicators:**

- File extensions: `*.swift`, `*.xib`, `*.storyboard`
- Framework files: `Package.swift`, `*.xcodeproj`, `*.xcworkspace`, `Podfile`
- Directory patterns: `/*.xcodeproj/`, `/Sources/`, `/Tests/`
- Code patterns: `import SwiftUI`, `import UIKit`, `@Observable`, `struct ContentView: View`

**Common Task Patterns:**

- "Build iOS screen for..."
- "Create SwiftUI view for..."
- "Implement StoreKit purchase for..."
- "Add AVFoundation player for..."
- "Build macOS menu bar app for..."

**Edge Cases:**

- Objective-C project → Use `ios-macos-senior-engineer` (Swift/ObjC interop is common)
- Cross-platform mobile (iOS + Android) → Use `expo-react-native-engineer` if React Native, or split: `ios-macos-senior-engineer` for iOS
- watchOS / tvOS → Use `ios-macos-senior-engineer` (closest Apple platform agent)

---

### expo-react-native-engineer

**Primary Expertise:**

- Expo React Native development
- Expo Router for navigation
- Expo Modules API
- Cross-platform mobile (iOS/Android/web)
- react-native-logs for logging
- EAS deployment

**Technology Indicators:**

- File extensions: `*.tsx`, `*.jsx`
- Framework files: `app.json` (Expo config), `package.json` with `expo` dependency
- Directory patterns: `/app/` (Expo Router)
- Code patterns: Expo modules, `expo-router`, React Native components

**Common Task Patterns:**

- "Build mobile screen for..."
- "Create Expo module for..."
- "Implement navigation for..."
- "Add mobile feature for..."
- "Build cross-platform app for..."

**Edge Cases:**

- Pure React Native without Expo → Use `expo-react-native-engineer` (still closest mobile agent)
- Web-only React → Use `nextjs-senior-engineer` or `react-vite-tailwind-engineer`
- Flutter mobile app → Use `expo-react-native-engineer` for mobile expertise or `general-purpose`

---

### devops-aws-senior-engineer

**Primary Expertise:**

- AWS infrastructure and services
- AWS CDK (Infrastructure as Code)
- CloudFormation templates
- Terraform for AWS
- CI/CD pipelines (CodePipeline, GitHub Actions with AWS)
- IAM, VPC, Lambda, ECS, S3, RDS, DynamoDB

**Technology Indicators:**

- File extensions: `*.ts` (CDK), `*.tf` (Terraform), `*.yaml`/`*.yml` (CloudFormation)
- Framework files: `cdk.json`, `*.tf`, `template.yaml`, `serverless.yml`
- Directory patterns: `/cdk/`, `/infra/`, `/terraform/`, `/cloudformation/`
- Code patterns: `new cdk.Stack`, `resource "aws_"`, `AWS::`, CDK constructs

**Common Task Patterns:**

- "Deploy to AWS..."
- "Create CDK stack for..."
- "Set up Terraform for..."
- "Configure IAM roles for..."
- "Build CI/CD pipeline for..."

**Edge Cases:**

- GCP or Azure → Use `general-purpose` (no GCP/Azure-specific agent)
- Docker without AWS → Use `devops-docker-senior-engineer`
- Kubernetes on AWS → Use `devops-aws-senior-engineer` for EKS, `devops-docker-senior-engineer` for container config

---

### devops-docker-senior-engineer

**Primary Expertise:**

- Docker containerization
- Docker Compose multi-service orchestration
- Dockerfile optimization (multi-stage builds)
- Container networking and volumes
- Docker build caching strategies
- Container security best practices

**Technology Indicators:**

- File extensions: `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`, `.dockerignore`
- Directory patterns: `/docker/`, project root
- Code patterns: `FROM`, `RUN`, `COPY`, `EXPOSE`, `services:`, `volumes:`

**Common Task Patterns:**

- "Containerize application..."
- "Create Docker Compose for..."
- "Optimize Dockerfile for..."
- "Set up multi-stage build for..."
- "Configure Docker networking for..."

**Edge Cases:**

- Kubernetes YAML (not Docker) → Use `devops-aws-senior-engineer` if on AWS, else `general-purpose`
- Docker + AWS deployment → Split: `devops-docker-senior-engineer` for container config, `devops-aws-senior-engineer` for AWS infra

---

### general-purpose

**Primary Expertise:**

- General research and exploration
- Multi-language code analysis
- File system operations
- Tasks not matching specific frameworks

**Use When:**

- No framework-specific patterns detected
- Exploratory tasks ("find all instances of...")
- Multi-framework analysis
- Configuration file edits
- Documentation generation
- Shell scripting
- Technologies without a dedicated agent (SvelteKit, Vue/Nuxt, Ruby on Rails, Java/Spring, etc.)

**Common Task Patterns:**

- "Search for..."
- "Analyze these files..."
- "Explore the codebase..."
- "Generate documentation for..."

---

## Matching Algorithm

### Step-by-Step Process

1. **Check for explicit framework mentions** in the task description
   - If user says "Laravel API", match to `laravel-senior-engineer`
   - If user says "Next.js page", match to `nextjs-senior-engineer`
   - If user says "FastAPI endpoint", match to `fastapi-senior-engineer`
   - If user says "Go service", match to `go-senior-engineer`
   - If user says "iOS app", match to `ios-macos-senior-engineer`
   - If user says "Docker setup", match to `devops-docker-senior-engineer`

2. **Analyze file paths** (if provided)
   - Check file extensions: `.php`, `.tsx`, `.py`, `.go`, `.swift`, `.dart`, etc.
   - Check directory patterns: `/app/Http/` (Laravel), `/cmd/` (Go), `/Sources/` (Swift)

3. **Search for framework config files** in the workspace
   - `artisan` + `composer.json` with Laravel → Laravel
   - `next.config.*` → Next.js
   - `vite.config.*` + `tailwind.config.*` → React Vite Tailwind
   - `app.json` + `expo` dependency → Expo React Native
   - `go.mod` + `cobra` dependency → Go CLI
   - `go.mod` (no cobra) → Go
   - `Package.swift` or `*.xcodeproj` → iOS/macOS
   - `pyproject.toml` with `fastapi` → FastAPI
   - `manage.py` or `pyproject.toml` with `django` → Python
   - `cdk.json` or `*.tf` → DevOps AWS
   - `Dockerfile` or `docker-compose.yml` → DevOps Docker
   - `nest-cli.json` or `@nestjs/*` deps → Express (NestJS uses Express)

4. **Analyze code patterns** (if code is visible)
   - `Eloquent`, `namespace App\` → Laravel
   - `'use client'`, `'use server'` → Next.js
   - Tailwind classes + Vite imports → React Vite Tailwind
   - `@app.get()`, `Depends()` → FastAPI
   - `cobra.Command{}` → Go CLI
   - `http.HandleFunc` → Go
   - `import SwiftUI` → iOS/macOS
   - `@Injectable()`, `@Controller()` → Express (NestJS)
   - `app.use()`, `express.Router()` → Express

5. **Default to general-purpose** if no clear match

### Multi-Agent Scenarios

When a task requires multiple agent types:

**Scenario 1: Full-stack feature**

- User: "Build user profile with backend API and frontend page"
- Split into:
  - Backend API → `laravel-senior-engineer` or `express-senior-engineer` or `fastapi-senior-engineer`
  - Frontend page → `nextjs-senior-engineer` or `react-vite-tailwind-engineer`

**Scenario 2: Backend microservices**

- User: "Build payment service (Go) and notification handler (Express)"
- Split into:
  - Payment service → `go-senior-engineer`
  - Notification handler → `express-senior-engineer`

**Scenario 3: Cross-platform**

- User: "Build mobile app (Expo) and web dashboard (Next.js)"
- Split into:
  - Mobile → `expo-react-native-engineer`
  - Web → `nextjs-senior-engineer`

**Scenario 4: Native + API**

- User: "Build iOS app and Go backend API"
- Split into:
  - iOS app → `ios-macos-senior-engineer`
  - Backend API → `go-senior-engineer`

**Scenario 5: Infra + App**

- User: "Containerize the app and deploy to AWS"
- Split into:
  - Docker setup → `devops-docker-senior-engineer`
  - AWS deployment → `devops-aws-senior-engineer`

**Scenario 6: CLI + Backend**

- User: "Build a CLI tool that manages the Express API"
- Split into:
  - CLI tool → `nodejs-cli-senior-engineer` or `go-cli-senior-engineer`
  - API work → `express-senior-engineer`

---

## File Pattern Detection Matrix

| File Pattern                             | Agent Type                       | Confidence |
| ---------------------------------------- | -------------------------------- | ---------- |
| `*.php` + `/app/Http/`                   | `laravel-senior-engineer`        | High       |
| `*.php` + `/app/code/` (Magento)         | `laravel-senior-engineer`        | Medium     |
| `*.tsx` + `/app/` + `next.config.*`      | `nextjs-senior-engineer`         | High       |
| `*.tsx` + `vite.config.*`                | `react-vite-tailwind-engineer`   | High       |
| `*.tsx` + `app.json` + `expo`            | `expo-react-native-engineer`     | High       |
| `*.ts` + `express` imports               | `express-senior-engineer`        | Medium     |
| `*.ts` + `nest-cli.json` or `@nestjs/*`  | `express-senior-engineer`        | High       |
| `*.ts`/`*.js` + `bin` + `commander`      | `nodejs-cli-senior-engineer`     | High       |
| `*.py` + `fastapi` dependency            | `fastapi-senior-engineer`        | High       |
| `*.py` + `manage.py` (Django)            | `python-senior-engineer`         | High       |
| `*.py` (generic)                         | `python-senior-engineer`         | Medium     |
| `*.go` + `cobra` dependency              | `go-cli-senior-engineer`         | High       |
| `*.go` + `go.mod` (no cobra)             | `go-senior-engineer`             | High       |
| `*.swift` + `*.xcodeproj`               | `ios-macos-senior-engineer`      | High       |
| `*.swift` + `Package.swift`             | `ios-macos-senior-engineer`      | High       |
| `Dockerfile` / `docker-compose.yml`      | `devops-docker-senior-engineer`  | High       |
| `cdk.json` / `*.tf` / `template.yaml`   | `devops-aws-senior-engineer`     | High       |
| `*.dart` + `pubspec.yaml`               | `expo-react-native-engineer`     | Low        |
| `*.php` (generic)                        | `general-purpose`                | Low        |
| `*.ts` (no framework)                    | `general-purpose`                | Low        |

---

## Edge Case Handling

### Ambiguous File Extensions

**Problem:** TypeScript (`.ts`, `.tsx`) is used by Next.js, React Vite, NestJS, Express, and Expo

**Solution:**

1. Check for framework config files first
2. Look at directory structure
3. Examine import statements
4. Default to most common for the project if uncertain

### Mixed Technology Stacks

**Problem:** Project uses both Laravel backend and Next.js frontend

**Solution:**

- Analyze which part of the stack the task targets
- If task spans both, split into two agents
- Use file paths to determine context

### NestJS Projects

**Problem:** NestJS is a distinct framework but has no dedicated agent

**Solution:**

- Use `express-senior-engineer` (NestJS is built on Express)
- The Express agent handles TypeScript Node.js APIs, middleware, and dependency injection patterns
- NestJS decorators (`@Injectable()`, `@Controller()`) are recognizable patterns for the Express agent

### Remix Projects

**Problem:** Remix is a React framework but has no dedicated agent

**Solution:**

- Use `nextjs-senior-engineer` for full-stack Remix work (loaders, actions, SSR)
- Use `react-vite-tailwind-engineer` for UI/component-heavy Remix work
- Both agents understand React patterns that Remix shares

### Flutter / Dart Projects

**Problem:** Flutter has no dedicated agent

**Solution:**

- For mobile app logic → Use `expo-react-native-engineer` (closest mobile expertise)
- For general Dart/Flutter → Use `general-purpose`

### Unknown Frameworks

**Problem:** Encountering a framework not in the agent catalog (e.g., SvelteKit, Nuxt.js, Ruby on Rails)

**Solution:**

- Use `general-purpose` agent
- Document the framework for future reference
- Consider requesting a new specialized agent if frequently used

### Testing and Build Tasks

**Problem:** Running tests or builds that span multiple frameworks

**Solution:**

- If tests are framework-specific (e.g., Laravel PHPUnit tests), use framework agent
- If running global build scripts, use `general-purpose`
- If parallelizing tests across subsystems, split by framework

---

## Confidence Scoring

When matching agents, assign confidence scores:

- **High (90-100%):** Clear framework indicators, config files present, explicit user mention
- **Medium (60-89%):** File patterns match, but no config files or some ambiguity
- **Low (30-59%):** Weak signals, could be multiple frameworks
- **Very Low (<30%):** No clear indicators, default to `general-purpose`

**Decision Rule:**

- High/Medium confidence → Use specialized agent
- Low/Very Low → Use `general-purpose` OR ask user for clarification

---

## Future Agent Types

Potential agents that may be added in the future:

- `svelte-senior-engineer` - For SvelteKit applications
- `vue-senior-engineer` - For Vue.js/Nuxt applications
- `rails-senior-engineer` - For Ruby on Rails applications
- `spring-boot-senior-engineer` - For Java Spring Boot APIs
- `rust-senior-engineer` - For Rust backends and CLI tools

When encountering these technologies currently, use `general-purpose` and note the limitation.
