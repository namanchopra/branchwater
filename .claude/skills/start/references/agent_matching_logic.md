# Agent Matching Logic Reference

This document provides comprehensive rules, patterns, and decision trees for matching tasks to the appropriate specialized agent persona in the start skill workflow.

## Core Principle

**Always use the RIGHT agent for the RIGHT job.** Specialized agents have deep domain expertise that produces higher quality output than general-purpose implementation. The start skill's primary responsibility is identifying when to delegate vs when to execute directly.

---

## Agent Type Catalog

### laravel-senior-engineer

**Primary Expertise:**

- Laravel 12.x backend development
- Multi-database architectures (MySQL, Redis, DynamoDB)
- Eloquent ORM, models, relationships
- Queue systems with Horizon
- Service layer patterns
- RESTful API development
- Artisan commands, migrations, seeders
- Laravel-specific testing (PHPUnit, Feature tests)
- Production-ready enterprise applications

**Technology Indicators:**

- File extensions: `*.php`
- Directory patterns: `/app/`, `/routes/`, `/database/`, `/config/`, `/tests/Feature/`
- Framework files: `artisan`, `composer.json` with Laravel dependencies
- Code patterns:
  - `namespace App\Http\Controllers`
  - `use Illuminate\`
  - Eloquent models extending `Model`
  - `Route::` definitions
  - `php artisan` commands
  - Laravel facades (`Cache::`, `Queue::`, `DB::`)

**Task Pattern Triggers:**

- "Build Laravel API endpoint for..."
- "Create Eloquent model for..."
- "Implement queue job for..."
- "Add migration for..."
- "Create service class for..."
- "Write Feature test for..."
- "Set up Horizon queue..."
- "Add Redis caching to..."

**Confidence Scoring:**

- **High (90-100%):** Laravel framework files present, `composer.json` has `laravel/framework`, explicit mention
- **Medium (60-89%):** PHP files in `/app/Http/` or `/app/Models/` structure
- **Low (<60%):** Generic PHP files without Laravel indicators

**When NOT to use:**

- Pure PHP without framework → `general-purpose`
- WordPress → `general-purpose` (no WordPress agent)
- Magento PHP → `laravel-senior-engineer` (closest PHP agent, Magento shares PHP ecosystem)

---

### nextjs-senior-engineer

**Primary Expertise:**

- Next.js 14/15 with App Router
- React Server Components (RSC)
- Server Actions
- Client and server-side rendering strategies
- Streaming patterns
- Advanced caching (revalidation, ISR, static generation)
- API routes and middleware
- Production-ready full-stack applications

**Technology Indicators:**

- File extensions: `*.tsx`, `*.jsx`
- Directory patterns: `/app/`, `/pages/`, `/components/`, `/lib/`
- Framework files: `next.config.js`, `next.config.ts`, `package.json` with `next` dependency
- Code patterns:
  - `'use client'` directive
  - `'use server'` directive
  - `export default function Page()`
  - `export async function generateMetadata()`
  - Server Actions: `export async function someAction()`
  - `useRouter`, `usePathname`, `useSearchParams` from `next/navigation`

**Task Pattern Triggers:**

- "Build Next.js page for..."
- "Implement server action for..."
- "Add API route for..."
- "Build dashboard/UI for..."
- "Create layout component..."
- "Add streaming for..."
- "Implement caching strategy for..."

**Confidence Scoring:**

- **High (90-100%):** `next.config.*` exists, App Router structure (`/app/`), explicit mention
- **Medium (60-89%):** React/TSX files with Next.js patterns (like `Image` from `next/image`)
- **Low (<60%):** Generic React components without Next.js-specific imports

**When NOT to use:**

- Pure React SPA (Vite-based) → `react-vite-tailwind-engineer`
- React Native → `expo-react-native-engineer`
- Remix app → `nextjs-senior-engineer` (closest full-stack React framework agent)

---

### react-vite-tailwind-engineer

**Primary Expertise:**

- React with Vite build tool
- Tailwind CSS styling
- TypeScript frontends
- SPA architecture and client-side routing
- Component library development
- State management (Zustand, Redux, Jotai)
- Form handling (React Hook Form, Formik)
- Production-ready frontend applications

**Technology Indicators:**

- File extensions: `*.tsx`, `*.jsx`, `*.css`
- Framework files: `vite.config.ts`, `vite.config.js`, `tailwind.config.*`, `postcss.config.*`
- Directory patterns: `/src/`, `/src/components/`, `/src/pages/`, `/src/hooks/`
- Code patterns:
  - `import { useState, useEffect } from 'react'`
  - Tailwind utility classes: `className="flex items-center..."`
  - Vite-specific: `import.meta.env`
  - React Router: `useNavigate`, `useParams`, `<Route>`

**Task Pattern Triggers:**

- "Build React component for..."
- "Create Vite app for..."
- "Style with Tailwind..."
- "Add client-side routing for..."
- "Build SPA for..."
- "Create form with validation..."
- "Implement state management..."

**Confidence Scoring:**

- **High (90-100%):** `vite.config.*` exists, `tailwind.config.*` exists, explicit mention of Vite/Tailwind
- **Medium (60-89%):** React/TSX files with Tailwind classes but no clear Vite config
- **Low (<60%):** Generic React components without Vite or Tailwind indicators

**When NOT to use:**

- Next.js app → `nextjs-senior-engineer`
- React Native → `expo-react-native-engineer`
- Server-rendered React → `nextjs-senior-engineer`

---

### express-senior-engineer

**Primary Expertise:**

- Express.js framework
- Middleware architecture
- RESTful API development
- Queue systems with Bull
- Logging with Pino
- NestJS applications (Express under the hood)
- Node.js server-side applications with any framework
- Production-ready Node.js APIs

**Technology Indicators:**

- File extensions: `*.js`, `*.ts`
- Dependencies: `package.json` with `express` or `@nestjs/*`
- Code patterns:
  - `const express = require('express')` or `import express from 'express'`
  - `app.use()` middleware
  - `app.get()`, `app.post()`, etc. route handlers
  - `express.Router()`
  - `req`, `res`, `next` parameters
  - NestJS: `@Injectable()`, `@Controller()`, `@Module()` decorators
  - NestJS: `@Get()`, `@Post()` route decorators

**Task Pattern Triggers:**

- "Build Express API for..."
- "Create middleware for..."
- "Add REST endpoint for..."
- "Implement Express route handler for..."
- "Add logging with Pino..."
- "Set up Bull queue in Express..."
- "Build NestJS module for..."
- "Create NestJS service for..."
- "Implement NestJS guard/interceptor..."

**Confidence Scoring:**

- **High (90-100%):** `express` or `@nestjs/*` in dependencies, middleware patterns, explicit mention
- **Medium (60-89%):** Node.js HTTP server patterns with Express-like structure
- **Low (<60%):** Generic Node.js without Express indicators

**When NOT to use:**

- Serverless functions → `general-purpose`
- Node.js CLI tools → `nodejs-cli-senior-engineer`
- Pure frontend Node.js tooling → `general-purpose`

---

### nodejs-cli-senior-engineer

**Primary Expertise:**

- Node.js CLI tool development
- Commander.js and other CLI frameworks
- Interactive prompts (inquirer, prompts)
- File system operations
- Process management
- Package publishing and distribution
- CLI testing patterns
- Production-ready CLI applications

**Technology Indicators:**

- File extensions: `*.js`, `*.ts`
- Framework files: `package.json` with `commander`, `yargs`, `inquirer`, or `meow` dependencies
- Code patterns:
  - `#!/usr/bin/env node` shebang
  - `program.command()` (commander.js)
  - `process.argv` parsing
  - `process.stdin`, `process.stdout` usage
  - `bin` field in `package.json`

**Task Pattern Triggers:**

- "Build CLI tool for..."
- "Create Node.js command-line app..."
- "Add CLI command for..."
- "Implement interactive prompts..."
- "Parse command-line arguments..."
- "Create npx-runnable tool..."

**Confidence Scoring:**

- **High (90-100%):** `bin` field in `package.json`, CLI frameworks in dependencies, shebang present
- **Medium (60-89%):** Node.js scripts with `process.argv` usage
- **Low (<60%):** Generic Node.js scripts

**When NOT to use:**

- Express/API servers → `express-senior-engineer`
- Frontend build scripts → `general-purpose`

---

### python-senior-engineer

**Primary Expertise:**

- Python application development
- Django web framework
- Data pipelines and ETL
- Scientific computing and data analysis
- SQLAlchemy ORM
- Celery task queues
- Python testing (pytest, unittest)
- Production-ready Python applications

**Technology Indicators:**

- File extensions: `*.py`
- Framework files: `requirements.txt`, `pyproject.toml`, `setup.py`, `manage.py` (Django)
- Directory patterns: `/src/`, `/tests/`, Django apps structure
- Code patterns:
  - `from django.` imports
  - `class Meta:` in models
  - `urlpatterns` in URLs
  - `import pandas`, `import numpy`
  - SQLAlchemy models and sessions

**Task Pattern Triggers:**

- "Build Python script for..."
- "Create Django view for..."
- "Implement data pipeline..."
- "Add Django model for..."
- "Write pytest for..."
- "Build ETL process..."
- "Create Celery task..."

**Confidence Scoring:**

- **High (90-100%):** `manage.py` exists (Django), `pyproject.toml` present, explicit mention
- **Medium (60-89%):** Python files with framework imports
- **Low (<60%):** Generic Python scripts

**When NOT to use:**

- FastAPI specifically → `fastapi-senior-engineer`
- Python CLI tools → `python-senior-engineer` (handles general Python)
- Go backends → `go-senior-engineer`

---

### fastapi-senior-engineer

**Primary Expertise:**

- FastAPI framework specifically
- Async database operations (SQLAlchemy async, Tortoise ORM)
- JWT authentication and OAuth2
- Pydantic models and validation
- Dependency injection
- Background tasks
- WebSocket support
- OpenAPI/Swagger documentation
- Production-ready async Python APIs

**Technology Indicators:**

- File extensions: `*.py`
- Framework files: `requirements.txt` or `pyproject.toml` with `fastapi` dependency
- Code patterns:
  - `from fastapi import FastAPI`
  - `@app.get()`, `@app.post()` decorators
  - Pydantic models: `class MyModel(BaseModel)`
  - `Depends()` for dependency injection
  - `async def` route handlers
  - `from fastapi.security import` JWT/OAuth2 patterns

**Task Pattern Triggers:**

- "Build FastAPI endpoint for..."
- "Create Pydantic model for..."
- "Implement JWT auth with FastAPI..."
- "Add async database query..."
- "Create FastAPI dependency..."
- "Build WebSocket endpoint..."
- "Add background task..."

**Confidence Scoring:**

- **High (90-100%):** `fastapi` in dependencies, FastAPI decorators in code, explicit mention
- **Medium (60-89%):** Async Python with Pydantic models
- **Low (<60%):** Generic Python without FastAPI indicators

**When NOT to use:**

- Django apps → `python-senior-engineer`
- Flask apps → `python-senior-engineer` (closest match)
- Non-API Python → `python-senior-engineer`

---

### go-senior-engineer

**Primary Expertise:**

- Go backend services and APIs
- net/http and popular routers (chi, gorilla/mux, gin)
- gRPC services
- Database access (database/sql, sqlx, GORM)
- Concurrency patterns (goroutines, channels)
- Go testing and benchmarks
- Microservices architecture
- Production-ready Go backends

**Technology Indicators:**

- File extensions: `*.go`
- Framework files: `go.mod`, `go.sum`
- Directory patterns: `/cmd/`, `/internal/`, `/pkg/`, `/api/`
- Code patterns:
  - `package main`
  - `func main()`
  - `http.HandleFunc`, `http.ListenAndServe`
  - `func (s *Server) ServeHTTP`
  - `import "net/http"`
  - gRPC: `pb.RegisterServiceServer`

**Task Pattern Triggers:**

- "Build Go API for..."
- "Create Go service..."
- "Implement gRPC service..."
- "Add Go HTTP handler..."
- "Write Go tests for..."
- "Build microservice in Go..."
- "Add database layer in Go..."

**Confidence Scoring:**

- **High (90-100%):** `go.mod` exists, Go server patterns, explicit mention
- **Medium (60-89%):** Go files with HTTP or database patterns
- **Low (<60%):** Generic Go files

**When NOT to use:**

- Go CLI tools → `go-cli-senior-engineer`
- Go scripts/utilities without server → `go-cli-senior-engineer` or `general-purpose`

---

### go-cli-senior-engineer

**Primary Expertise:**

- Go CLI tool development
- Cobra and Viper frameworks
- Interactive terminal UIs (bubbletea, lipgloss)
- Flag parsing and subcommands
- Configuration management
- Cross-platform builds
- CLI testing patterns
- Production-ready CLI applications

**Technology Indicators:**

- File extensions: `*.go`
- Framework files: `go.mod` with `cobra`, `viper`, or `bubbletea` dependencies
- Directory patterns: `/cmd/`, `/internal/`
- Code patterns:
  - `cobra.Command{}` definitions
  - `viper.Get*` configuration reads
  - `rootCmd.AddCommand()`
  - `os.Args` or flag parsing
  - `fmt.Println`, `fmt.Fprintf(os.Stderr, ...)`

**Task Pattern Triggers:**

- "Build Go CLI tool for..."
- "Create Cobra command for..."
- "Add CLI subcommand..."
- "Implement interactive terminal UI..."
- "Parse flags for..."
- "Create cross-platform CLI..."

**Confidence Scoring:**

- **High (90-100%):** Cobra/Viper in `go.mod`, CLI command patterns, explicit mention
- **Medium (60-89%):** Go with `os.Args` or flag usage
- **Low (<60%):** Generic Go files

**When NOT to use:**

- Go APIs/servers → `go-senior-engineer`
- Go libraries → `go-senior-engineer` or `general-purpose`

---

### ios-macos-senior-engineer

**Primary Expertise:**

- Swift and SwiftUI development
- iOS and macOS applications
- Xcode project management
- Swift Package Manager (SPM)
- AVFoundation (audio/video)
- StoreKit (in-app purchases)
- Core Data and SwiftData
- UIKit integration
- Production-ready Apple platform applications

**Technology Indicators:**

- File extensions: `*.swift`, `*.xib`, `*.storyboard`
- Framework files: `Package.swift`, `*.xcodeproj`, `*.xcworkspace`, `Podfile`
- Directory patterns: `/Sources/`, `/Tests/`, Xcode group structure
- Code patterns:
  - `import SwiftUI`
  - `import UIKit`
  - `struct ContentView: View`
  - `@State`, `@Binding`, `@ObservedObject`, `@StateObject`
  - `AVPlayer`, `AVCaptureSession`
  - `SKProduct`, `SKPaymentQueue`

**Task Pattern Triggers:**

- "Build iOS app for..."
- "Create SwiftUI view for..."
- "Add macOS feature..."
- "Implement StoreKit purchase..."
- "Create AVFoundation player..."
- "Add Core Data model..."
- "Build Apple Watch complication..."
- "Create SPM package..."

**Confidence Scoring:**

- **High (90-100%):** `*.xcodeproj` or `Package.swift` exists, SwiftUI/UIKit imports, explicit mention
- **Medium (60-89%):** Swift files with Apple framework imports
- **Low (<60%):** Generic Swift without Apple platform indicators

**When NOT to use:**

- Server-side Swift (Vapor) → `general-purpose`
- Cross-platform mobile → `expo-react-native-engineer`

---

### expo-react-native-engineer

**Primary Expertise:**

- Expo React Native development
- Expo Router for navigation
- Expo Modules API
- Cross-platform mobile (iOS/Android/web)
- react-native-logs for logging
- Testing with Jest
- EAS deployment
- Production-ready mobile applications

**Technology Indicators:**

- File extensions: `*.tsx`, `*.jsx`
- Framework files: `app.json` (Expo config), `package.json` with `expo` dependency
- Directory patterns: `/app/` (Expo Router), `/components/`
- Code patterns:
  - `import { ... } from 'expo-...'`
  - `import { ... } from 'react-native'`
  - Expo Router: `useRouter`, `useLocalSearchParams`
  - React Native components: `<View>`, `<Text>`, `<ScrollView>`

**Task Pattern Triggers:**

- "Build mobile screen for..."
- "Create Expo module for..."
- "Implement navigation for..."
- "Add mobile feature for..."
- "Create React Native component..."
- "Add Expo camera integration..."
- "Build Flutter screen..." (Flutter not supported, Expo is closest mobile agent)

**Confidence Scoring:**

- **High (90-100%):** `app.json` with Expo config, `expo` in dependencies, explicit mention
- **Medium (60-89%):** React Native imports without clear Expo markers
- **Low (<60%):** Generic React/TypeScript

**When NOT to use:**

- iOS/macOS native → `ios-macos-senior-engineer`
- Web-only React → `nextjs-senior-engineer` or `react-vite-tailwind-engineer`

---

### devops-aws-senior-engineer

**Primary Expertise:**

- AWS infrastructure and services
- AWS CDK (Cloud Development Kit)
- CloudFormation templates
- Terraform for AWS
- IAM policies and security
- Lambda, API Gateway, ECS, S3, RDS, DynamoDB
- CI/CD pipelines (CodePipeline, GitHub Actions for AWS)
- Infrastructure as Code patterns
- Production-ready cloud architectures

**Technology Indicators:**

- File extensions: `*.tf`, `*.tfvars`, `*.yaml`, `*.json`
- Framework files: `cdk.json`, `template.yaml` (SAM), `*.tf` files, `serverless.yml`
- Directory patterns: `/cdk/`, `/infra/`, `/infrastructure/`, `/terraform/`
- Code patterns:
  - `new cdk.Stack()`, `new s3.Bucket()`
  - `resource "aws_"` (Terraform)
  - `AWSTemplateFormatVersion` (CloudFormation)
  - `provider "aws"` (Terraform)
  - AWS SDK usage: `import boto3`, `AWS.S3()`

**Task Pattern Triggers:**

- "Set up AWS infrastructure for..."
- "Create CDK stack for..."
- "Write Terraform for..."
- "Configure IAM policy..."
- "Deploy Lambda function..."
- "Set up CI/CD pipeline..."
- "Create CloudFormation template..."
- "Configure S3/RDS/DynamoDB..."

**Confidence Scoring:**

- **High (90-100%):** `cdk.json` or `*.tf` files exist, AWS resource patterns, explicit mention
- **Medium (60-89%):** YAML/JSON with AWS-like resource definitions
- **Low (<60%):** Generic infrastructure files

**When NOT to use:**

- Docker-only tasks → `devops-docker-senior-engineer`
- Non-AWS cloud (GCP, Azure) → `general-purpose`
- Application code → Use the appropriate application agent

---

### devops-docker-senior-engineer

**Primary Expertise:**

- Docker containerization
- Docker Compose orchestration
- Dockerfile best practices
- Multi-stage builds
- Container networking
- Volume management
- Image optimization
- Container security
- Production-ready container setups

**Technology Indicators:**

- File extensions: `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`, `.dockerignore`
- Code patterns:
  - `FROM`, `RUN`, `COPY`, `CMD`, `ENTRYPOINT` (Dockerfile)
  - `services:`, `volumes:`, `networks:` (docker-compose)
  - `docker build`, `docker run` commands
  - Multi-stage: `FROM ... AS builder`

**Task Pattern Triggers:**

- "Dockerize application..."
- "Create Dockerfile for..."
- "Set up Docker Compose..."
- "Optimize Docker image..."
- "Add multi-stage build..."
- "Configure container networking..."
- "Create development Docker setup..."

**Confidence Scoring:**

- **High (90-100%):** `Dockerfile` or `docker-compose.yml` exists, explicit mention
- **Medium (60-89%):** Container-related configuration files
- **Low (<60%):** Generic YAML without Docker indicators

**When NOT to use:**

- Kubernetes/ECS orchestration → `devops-aws-senior-engineer` (if AWS) or `general-purpose`
- Application code inside containers → Use the appropriate application agent
- AWS infrastructure → `devops-aws-senior-engineer`

---

### general-purpose

**Primary Expertise:**

- General research and exploration
- Multi-language code analysis
- File system operations
- Tasks not matching specific frameworks
- Configuration file edits
- Documentation generation
- Shell scripting
- Languages/frameworks without dedicated agents (Ruby, Rust, Elixir, etc.)

**Use When:**

- No framework-specific patterns detected
- Exploratory tasks ("find all instances of...")
- Multi-framework analysis
- Shell scripting
- Simple file operations (typo fixes, config edits)
- Documentation work
- Unsupported frameworks (SvelteKit, Nuxt.js, Rails, etc.)

**Task Pattern Triggers:**

- "Search for..."
- "Analyze these files..."
- "Explore the codebase..."
- "Generate documentation for..."
- "Find all files matching..."
- "Fix typo in..."
- "Write shell script..."

---

### Plan

**Primary Expertise:**

- Architecture planning and design decisions
- System design and technical specifications
- Breaking down large features into tasks
- Technology selection and trade-off analysis
- Migration strategies

**Use When:**

- User asks for architecture or design advice
- Planning a large feature before implementation
- Evaluating technology choices
- Creating implementation roadmaps

**Task Pattern Triggers:**

- "Plan the architecture for..."
- "Design the system for..."
- "What's the best approach to..."
- "How should we structure..."
- "Create a technical spec for..."

---

### Explore

**Primary Expertise:**

- Fast codebase exploration and discovery
- Finding patterns across files
- Understanding project structure
- Locating specific implementations
- Mapping dependencies and relationships

**Use When:**

- Need to understand codebase structure quickly
- Finding specific code patterns
- Mapping out how a feature works
- Discovery before implementation

**Task Pattern Triggers:**

- "Find where X is implemented..."
- "How does Y work in this codebase..."
- "Map out the Z feature..."
- "Show me all files related to..."
- "What's the project structure..."

---

## Delegation Decision Tree

### Step 1: Check Task Complexity

```
Is the task trivial? (single-file typo fix, simple read, etc.)
├─ YES → Skip agent delegation, execute directly
└─ NO → Continue to Step 2
```

### Step 2: Identify Technology Stack

```
Scan codebase for technology indicators:
├─ Laravel detected (*.php, /app/, composer.json with laravel/framework)
│  └─ Task involves Laravel work? → laravel-senior-engineer
├─ Magento detected (/app/code/, module.xml)
│  └─ Task involves Magento/PHP work? → laravel-senior-engineer (closest PHP agent)
├─ Next.js detected (next.config.*, /app/ with *.tsx, package.json with next)
│  └─ Task involves Next.js work? → nextjs-senior-engineer
├─ React+Vite detected (vite.config.*, tailwind.config.*, React SPA)
│  └─ Task involves React SPA work? → react-vite-tailwind-engineer
├─ Remix detected (remix.config.*, @remix-run/*)
│  └─ Server-side rendering focus? → nextjs-senior-engineer
│  └─ Client-side SPA focus? → react-vite-tailwind-engineer
├─ Express detected (express dependency)
│  └─ Task involves Express/API work? → express-senior-engineer
├─ NestJS detected (nest-cli.json, @nestjs/*)
│  └─ Task involves NestJS work? → express-senior-engineer (handles NestJS too)
├─ Node.js CLI detected (bin field, commander/yargs dependency)
│  └─ Task involves CLI tool work? → nodejs-cli-senior-engineer
├─ FastAPI detected (fastapi dependency, async Python API)
│  └─ Task involves FastAPI work? → fastapi-senior-engineer
├─ Python/Django detected (manage.py, *.py, requirements.txt)
│  └─ Task involves Python work? → python-senior-engineer
├─ Go server detected (go.mod, net/http patterns)
│  └─ Task involves Go API/service? → go-senior-engineer
├─ Go CLI detected (go.mod with cobra/viper)
│  └─ Task involves Go CLI? → go-cli-senior-engineer
├─ iOS/macOS detected (*.swift, *.xcodeproj, Package.swift)
│  └─ Task involves Apple platform? → ios-macos-senior-engineer
├─ Expo/React Native detected (app.json, expo dependency)
│  └─ Task involves mobile app? → expo-react-native-engineer
├─ Flutter detected (pubspec.yaml, *.dart)
│  └─ Task involves mobile app? → expo-react-native-engineer (closest mobile agent)
├─ AWS infra detected (cdk.json, *.tf with AWS, CloudFormation)
│  └─ Task involves AWS? → devops-aws-senior-engineer
├─ Docker detected (Dockerfile, docker-compose.yml)
│  └─ Task involves containerization? → devops-docker-senior-engineer
└─ No framework detected
   └─ Use general-purpose or Explore agent
```

### Step 3: Assess Task Type

```
What type of work is required?
├─ Feature building (new functionality) → Delegate to specialized agent
├─ Bug fixing/debugging → Delegate to specialized agent
├─ Refactoring → Delegate to specialized agent
├─ Architecture planning → Use Plan agent
├─ Exploration/discovery → Use Explore agent or general-purpose
└─ Simple edits → Execute directly
```

### Step 4: Validate Independence (for parallel work)

```
Are there 3+ independent tasks?
├─ YES → Consider run-parallel-agents-feature-build skill
└─ NO → Delegate to single appropriate agent
```

---

## Matching Algorithm

### Algorithm: Match Task to Agent

```python
def match_agent(task, codebase_context):
    # Step 1: Check for explicit framework mention
    if "Laravel" in task or "Eloquent" in task:
        return "laravel-senior-engineer"
    if "Magento" in task:
        return "laravel-senior-engineer"  # Magento is PHP; Laravel agent is closest
    if "Next.js" in task or "Server Action" in task:
        return "nextjs-senior-engineer"
    if "Remix" in task:
        return "nextjs-senior-engineer"  # Remix → closest full-stack React agent
    if "Vite" in task or "Tailwind" in task and "React" in task:
        return "react-vite-tailwind-engineer"
    if "NestJS" in task or "@nestjs" in task:
        return "express-senior-engineer"  # NestJS handled by Express agent
    if "Express" in task:
        return "express-senior-engineer"
    if "Node.js CLI" in task or "commander" in task or "CLI tool" in task:
        return "nodejs-cli-senior-engineer"
    if "FastAPI" in task or "Pydantic" in task:
        return "fastapi-senior-engineer"
    if "Django" in task or "Python" in task:
        return "python-senior-engineer"
    if "Go CLI" in task or "Cobra" in task or "Viper" in task:
        return "go-cli-senior-engineer"
    if "Go" in task and ("API" in task or "server" in task or "service" in task):
        return "go-senior-engineer"
    if "Swift" in task or "SwiftUI" in task or "iOS" in task or "macOS" in task:
        return "ios-macos-senior-engineer"
    if "Expo" in task or "React Native" in task:
        return "expo-react-native-engineer"
    if "Flutter" in task:
        return "expo-react-native-engineer"  # Flutter → closest mobile agent
    if "AWS" in task or "CDK" in task or "Terraform" in task or "CloudFormation" in task:
        return "devops-aws-senior-engineer"
    if "Docker" in task or "Dockerfile" in task or "container" in task:
        return "devops-docker-senior-engineer"

    # Step 2: Analyze codebase indicators
    frameworks = detect_frameworks(codebase_context)

    if "laravel" in frameworks:
        return "laravel-senior-engineer"
    if "fastapi" in frameworks:
        return "fastapi-senior-engineer"
    if "nextjs" in frameworks:
        return "nextjs-senior-engineer"
    if "react-vite" in frameworks:
        return "react-vite-tailwind-engineer"
    if "nestjs" in frameworks or "express" in frameworks:
        return "express-senior-engineer"
    if "nodejs-cli" in frameworks:
        return "nodejs-cli-senior-engineer"
    if "django" in frameworks or "python" in frameworks:
        return "python-senior-engineer"
    if "go-cli" in frameworks:
        return "go-cli-senior-engineer"
    if "go" in frameworks:
        return "go-senior-engineer"
    if "ios-macos" in frameworks:
        return "ios-macos-senior-engineer"
    if "expo" in frameworks:
        return "expo-react-native-engineer"
    if "aws" in frameworks:
        return "devops-aws-senior-engineer"
    if "docker" in frameworks:
        return "devops-docker-senior-engineer"

    # Step 3: Default to general-purpose
    return "general-purpose"

def detect_frameworks(codebase_context):
    frameworks = []

    # File-based detection
    if "next.config.js" in codebase_context or "next.config.ts" in codebase_context:
        frameworks.append("nextjs")
    if "vite.config.ts" in codebase_context or "vite.config.js" in codebase_context:
        if "tailwind.config" in codebase_context or "react" in codebase_context:
            frameworks.append("react-vite")
    if "nest-cli.json" in codebase_context:
        frameworks.append("nestjs")
    if "composer.json" in codebase_context and "laravel/framework" in codebase_context:
        frameworks.append("laravel")
    if "module.xml" in codebase_context or "/app/code/" in codebase_context:
        frameworks.append("laravel")  # Magento → handled by Laravel agent
    if "app.json" in codebase_context and "expo" in codebase_context:
        frameworks.append("expo")
    if "pubspec.yaml" in codebase_context and "flutter" in codebase_context:
        frameworks.append("expo")  # Flutter → handled by Expo agent
    if "package.json" in codebase_context and "express" in codebase_context:
        if "nestjs" not in frameworks:
            frameworks.append("express")
    if "package.json" in codebase_context:
        if "commander" in codebase_context or "yargs" in codebase_context:
            frameworks.append("nodejs-cli")
    if "requirements.txt" in codebase_context or "pyproject.toml" in codebase_context:
        if "fastapi" in codebase_context:
            frameworks.append("fastapi")
        elif "django" in codebase_context:
            frameworks.append("django")
        else:
            frameworks.append("python")
    if "go.mod" in codebase_context:
        if "cobra" in codebase_context or "viper" in codebase_context:
            frameworks.append("go-cli")
        else:
            frameworks.append("go")
    if any(f in codebase_context for f in [".xcodeproj", "Package.swift", ".swift"]):
        frameworks.append("ios-macos")
    if "cdk.json" in codebase_context or ("provider" in codebase_context and "aws" in codebase_context):
        frameworks.append("aws")
    if "Dockerfile" in codebase_context or "docker-compose" in codebase_context:
        frameworks.append("docker")

    return frameworks
```

---

## Multi-Agent Scenarios

### Scenario 1: Full-Stack Feature

**User Request:** "Build user profile with backend API and frontend page"

**Analysis:**

- Backend API → Identify backend framework (Laravel, Express, FastAPI, Go)
- Frontend page → Identify frontend framework (Next.js, React+Vite)

**Decision:**

- If 2 independent parts → Use `run-parallel-agents-feature-build`
- Split into:
  - Backend agent (framework-specific)
  - Frontend agent (framework-specific)

### Scenario 2: Multi-Framework Codebase

**User Request:** "Fix authentication across the stack"

**Analysis:**

- Authentication touches: Laravel backend + Next.js frontend
- Are they independent fixes or interconnected?

**Decision:**

- If interconnected (shared logic) → Sequential fixes, start with backend
- If independent bugs → Parallel agents

### Scenario 3: Exploration Task

**User Request:** "Find all API endpoints in the codebase"

**Analysis:**

- Discovery task, spans multiple potential frameworks
- Not building/fixing, just exploring

**Decision:**

- Use `Explore` agent with `subagent_type=Explore`
- NOT a specialized framework agent

### Scenario 4: Mobile App with Native and Cross-Platform

**User Request:** "Add push notifications to the mobile app"

**Analysis:**

- Check if the project is Expo/React Native or native iOS/macOS
- Expo indicators → `expo-react-native-engineer`
- Swift/Xcode indicators → `ios-macos-senior-engineer`

**Decision:**

- Match to the detected mobile platform agent

### Scenario 5: Infrastructure + Application

**User Request:** "Deploy the app with Docker on AWS"

**Analysis:**

- Docker containerization → `devops-docker-senior-engineer`
- AWS deployment → `devops-aws-senior-engineer`

**Decision:**

- If Docker and AWS are independent → Parallel agents
- If sequential (Dockerize first, then deploy) → Sequential delegation

---

## Edge Cases

### Edge Case 1: Ambiguous File Extensions

**Problem:** TypeScript (`.ts`, `.tsx`) used by Next.js, Express, Expo, React+Vite

**Solution Priority:**

1. Check for framework config files
2. Examine directory structure
3. Look at import statements
4. Default to most common in project

**Example:**

```
File: src/components/Button.tsx

Indicators to check:
- Is there a next.config.js? → Next.js → nextjs-senior-engineer
- Is there a vite.config.ts? → React SPA → react-vite-tailwind-engineer
- Is there an app.json with Expo? → Expo → expo-react-native-engineer
- None? → Check imports for 'next/*', 'react-native', 'expo'
```

### Edge Case 2: Mixed Technology Project

**Problem:** Project has Laravel backend AND Next.js frontend in same repo

**Solution:**

- Identify which part the task targets based on:
  - File paths mentioned
  - Keywords in request ("API" → backend, "page" → frontend)
  - Explicit user mention

**Example:**

```
User: "Add user authentication"
Ambiguous! Could be:
- Laravel API authentication
- Next.js frontend auth UI
- Both

→ Use AskUserQuestion to clarify
```

### Edge Case 3: Unknown Framework

**Problem:** Framework not in catalog (e.g., SvelteKit, Nuxt.js, Rails, Rust)

**Solution:**

- Use `general-purpose` agent
- Mention limitation to user
- Provide best-effort support

### Edge Case 4: Pure Language Without Framework

**Problem:** Raw PHP, raw TypeScript, raw Python without framework

**Solution:**

- Raw PHP → `laravel-senior-engineer` if PHP-heavy, else `general-purpose`
- Raw TypeScript → `general-purpose`
- Raw Python → `python-senior-engineer`
- Raw Go → `go-senior-engineer`
- Raw Swift → `ios-macos-senior-engineer`

### Edge Case 5: NestJS Projects

**Problem:** NestJS uses Express internally but has its own patterns

**Solution:**

- Use `express-senior-engineer` — it handles NestJS as well as Express
- NestJS decorators, DI, modules are within its expertise

### Edge Case 6: Flutter Projects

**Problem:** No dedicated Flutter agent exists

**Solution:**

- Use `expo-react-native-engineer` for mobile-focused work (closest mobile agent)
- Use `general-purpose` for non-mobile Dart work

### Edge Case 7: Remix Projects

**Problem:** No dedicated Remix agent exists

**Solution:**

- For server-side rendering focus → `nextjs-senior-engineer` (closest SSR React agent)
- For client-side SPA focus → `react-vite-tailwind-engineer`

---

## Confidence Scoring System

When matching agents, assign confidence:

### High Confidence (90-100%)

- Framework config file exists
- Explicit user mention of framework
- Clear code patterns match framework
- **Action:** Confidently delegate to specialized agent

### Medium Confidence (60-89%)

- File patterns suggest framework
- Directory structure matches
- Some code patterns present
- **Action:** Delegate but mention assumption to user

### Low Confidence (30-59%)

- Weak indicators
- Could be multiple frameworks
- **Action:** Use AskUserQuestion to clarify OR use general-purpose

### Very Low (<30%)

- No clear indicators
- **Action:** Use general-purpose

---

## Delegation Brief Template

When delegating to a specialized agent, use this template:

```
Task: [Brief description]

Technology Stack: [Framework identified]

Context:
- Existing patterns: [What you discovered in codebase exploration]
- Related files: [Relevant file paths]
- Dependencies: [What systems this interacts with]

Requirements:
- [Bullet point 1]
- [Bullet point 2]
- [Bullet point 3]

Expected Output:
- [Deliverable 1]
- [Deliverable 2]

Success Criteria:
- [How to verify completion]
- [Test requirements]
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Doing Specialized Work Yourself

**Wrong:**

```
User: "Build Laravel API endpoint"
Assistant: *Writes Laravel code directly without delegating*
```

**Right:**

```
User: "Build Laravel API endpoint"
Assistant: *Identifies Laravel, delegates to laravel-senior-engineer*
```

**Why:** Specialized agents have deep expertise that produces better results.

---

### Anti-Pattern 2: Using Non-Existent Agent

**Wrong:**

```
User: "Fix NestJS service"
Assistant: *Delegates to nestjs-senior-engineer (does not exist)*
```

**Right:**

```
User: "Fix NestJS service"
Assistant: *Delegates to express-senior-engineer (handles NestJS)*
```

**Why:** Only delegate to agents that actually exist in the catalog.

---

### Anti-Pattern 3: Skipping Agent for "Simple" Tasks

**Wrong:**

```
User: "Add simple Laravel validation rule"
Assistant: "This is simple, I'll do it directly"
```

**Right:**

```
User: "Add simple Laravel validation rule"
Assistant: *Still delegates to laravel-senior-engineer for framework expertise*
```

**Why:** Even "simple" tasks benefit from domain expertise and pattern knowledge.

---

### Anti-Pattern 4: Ignoring Multiple Frameworks

**Wrong:**

```
User: "Fix auth in Laravel backend and Next.js frontend"
Assistant: *Tries to do both without recognizing it's two different domains*
```

**Right:**

```
User: "Fix auth in Laravel backend and Next.js frontend"
Assistant: *Recognizes two frameworks, splits into parallel agents or sequential fixes*
```

**Why:** Different frameworks require different expertise.

---

### Anti-Pattern 5: Using Phantom Agent Names

**Wrong:**

```
User: "Build Flutter screen"
Assistant: *Delegates to flutter-senior-engineer (does not exist)*
```

**Right:**

```
User: "Build Flutter screen"
Assistant: *Delegates to expo-react-native-engineer (closest mobile agent)*
```

**Why:** Always map to agents that exist. Never invent agent names.

---

## Quick Reference: Agent Selection Table

| Technology / Framework | Agent                          | Notes                                    |
| ---------------------- | ------------------------------ | ---------------------------------------- |
| Laravel                | `laravel-senior-engineer`      |                                          |
| PHP (generic)          | `laravel-senior-engineer`      | Or `general-purpose` if no Laravel       |
| Magento                | `laravel-senior-engineer`      | Closest PHP agent                        |
| Next.js                | `nextjs-senior-engineer`       |                                          |
| Remix                  | `nextjs-senior-engineer`       | Closest SSR React agent                  |
| React + Vite           | `react-vite-tailwind-engineer` |                                          |
| Tailwind CSS           | `react-vite-tailwind-engineer` | Or `nextjs-senior-engineer` if Next.js   |
| Express.js             | `express-senior-engineer`      |                                          |
| NestJS                 | `express-senior-engineer`      | NestJS built on Express                  |
| Node.js CLI            | `nodejs-cli-senior-engineer`   |                                          |
| Python (general)       | `python-senior-engineer`       | Django, data, scripts                    |
| Django                 | `python-senior-engineer`       |                                          |
| FastAPI                | `fastapi-senior-engineer`      |                                          |
| Flask                  | `python-senior-engineer`       | Closest Python web agent                 |
| Go (servers/APIs)      | `go-senior-engineer`           |                                          |
| Go (CLI tools)         | `go-cli-senior-engineer`       |                                          |
| Swift / SwiftUI        | `ios-macos-senior-engineer`    |                                          |
| iOS / macOS            | `ios-macos-senior-engineer`    |                                          |
| Expo / React Native    | `expo-react-native-engineer`   |                                          |
| Flutter                | `expo-react-native-engineer`   | Closest mobile agent                     |
| AWS / CDK / Terraform  | `devops-aws-senior-engineer`   |                                          |
| Docker / Compose       | `devops-docker-senior-engineer`|                                          |
| Architecture planning  | `Plan`                         |                                          |
| Codebase exploration   | `Explore`                      |                                          |
| Everything else        | `general-purpose`              | Ruby, Rust, Elixir, SvelteKit, etc.     |

---

## Quick Reference: Agent Selection Checklist

Before delegating, verify:

- [ ] I have identified the technology stack correctly
- [ ] I have selected an agent that ACTUALLY EXISTS in the catalog
- [ ] I have NOT used a phantom agent name (no nestjs, remix, flutter, magento, expo-react-native-senior-engineer)
- [ ] I have gathered sufficient context to brief the agent
- [ ] I have created a clear, comprehensive brief for the agent
- [ ] I have established success criteria for the agent's work
- [ ] If multiple agents are needed, I have determined if they can work in parallel

---

## Summary

**Key Principles:**

1. Always use the RIGHT agent for the RIGHT job
2. Only delegate to agents that EXIST in the catalog
3. Specialized agents produce higher quality than general implementation
4. Match based on: explicit mention > framework files > code patterns > defaults
5. When in doubt, use AskUserQuestion to clarify
6. Simple edits can be done directly, but complex framework work should be delegated
7. Context gathering is mandatory before delegation

**Valid Agent Names (exhaustive list):**

1. `laravel-senior-engineer`
2. `nextjs-senior-engineer`
3. `react-vite-tailwind-engineer`
4. `express-senior-engineer`
5. `nodejs-cli-senior-engineer`
6. `python-senior-engineer`
7. `fastapi-senior-engineer`
8. `go-senior-engineer`
9. `go-cli-senior-engineer`
10. `ios-macos-senior-engineer`
11. `expo-react-native-engineer`
12. `devops-aws-senior-engineer`
13. `devops-docker-senior-engineer`
14. `general-purpose`
15. `Plan`
16. `Explore`

**Decision Flow:**

1. Identify task complexity
2. Scan for technology indicators
3. Match to agent catalog (only valid agents above)
4. Assess confidence level
5. Delegate with comprehensive brief
6. Review and aggregate results
