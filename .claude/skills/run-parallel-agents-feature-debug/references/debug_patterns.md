# Debug Patterns Reference

This document provides comprehensive error pattern recognition, debugging strategies for each framework, and root cause analysis techniques for parallel debugging scenarios.

## Error Pattern Recognition

### Test Failure Patterns

#### Laravel PHPUnit Tests

**Common Patterns:**

```
Failed asserting that false is true
Class 'DatabaseSeeder' not found
SQLSTATE[HY000] [2002] Connection refused
This action is unauthorized
Column not found: 1054 Unknown column
```

**Root Causes:**

- Database seeding issues (missing factories, seeders)
- Database connection problems (wrong credentials, service not running)
- Authorization/policy failures
- Migration not run
- Eloquent relationship misconfiguration

**Agent Match:** `laravel-senior-engineer`

---

#### Next.js Jest/Vitest Tests

**Common Patterns:**

```
Cannot read properties of undefined (reading 'map')
Component did not render
Hydration failed because the initial UI does not match
Mock function not called
Snapshot test failed
```

**Root Causes:**

- Missing mock data or incorrect structure
- Component props not matching expectations
- Server/client hydration mismatch
- Async data not resolved before assertions
- Snapshot outdated after component changes

**Agent Match:** `nextjs-senior-engineer`

---

#### React Vite/Tailwind Tests

**Common Patterns:**

```
Cannot find module './Component' from 'src/App.tsx'
ReferenceError: document is not defined
TypeError: Cannot destructure property 'X' of undefined
Tailwind class not applied in test
```

**Root Causes:**

- Vite alias not configured in test runner (vitest vs jest)
- Missing jsdom or happy-dom test environment
- Props or context not provided in test wrapper
- Tailwind JIT not processing test files

**Agent Match:** `react-vite-tailwind-engineer`

---

#### Express/NestJS Tests

**Common Patterns:**

```
Cannot GET /api/endpoint
Unexpected token < in JSON at position 0
Guard returned false
Nest can't resolve dependencies
Timeout - Async callback was not invoked within 5000ms
```

**Root Causes:**

- Route not properly registered
- Response format mismatch (HTML instead of JSON)
- Guard/interceptor blocking request
- Dependency injection configuration missing (NestJS)
- Async operation not awaited or resolved

**Agent Match:** `express-senior-engineer`

---

#### Python/Django Tests

**Common Patterns:**

```
django.db.utils.OperationalError: no such table
AssertionError: 404 != 200
ImproperlyConfigured: settings.DATABASES is improperly configured
ModuleNotFoundError: No module named 'app'
PermissionDenied: You do not have permission
```

**Root Causes:**

- Test database not migrated
- URL routing misconfiguration
- Django settings not pointed to test config
- Python path / virtual environment issue
- Permission/authentication not set up in test

**Agent Match:** `python-senior-engineer`

---

#### FastAPI Tests

**Common Patterns:**

```
422 Unprocessable Entity
starlette.testclient.TestClient: connection refused
pydantic.error_wrappers.ValidationError
sqlalchemy.exc.IntegrityError: UNIQUE constraint failed
RuntimeError: Event loop is closed
```

**Root Causes:**

- Pydantic validation failure (wrong request body shape)
- Test server not started or wrong port
- Request/response schema mismatch
- Database constraint violation in test data
- Async event loop mismanagement in tests

**Agent Match:** `fastapi-senior-engineer`

---

#### Go Tests

**Common Patterns:**

```
--- FAIL: TestHandler (0.00s)
panic: runtime error: nil pointer dereference
cannot use x (variable of type X) as type Y
undefined: SomeFunction
race detected during execution of test
```

**Root Causes:**

- Assertion failure in test case
- Nil pointer not checked before dereference
- Type mismatch or interface not satisfied
- Missing import or unexported function
- Data race in concurrent code

**Agent Match:** `go-senior-engineer` or `go-cli-senior-engineer`

---

#### Swift/Xcode Tests

**Common Patterns:**

```
XCTAssertEqual failed: ("X") is not equal to ("Y")
Thread 1: Fatal error: Unexpectedly found nil
No such module 'PackageName'
Build input file cannot be found
The compiler is unable to type-check this expression
```

**Root Causes:**

- Assertion mismatch in XCTest
- Force unwrapping optional that is nil
- SPM dependency not resolved or target not linked
- File removed from disk but still referenced in project
- Complex generic/closure expression exceeding type checker limits

**Agent Match:** `ios-macos-senior-engineer`

---

#### Expo/React Native Tests

**Common Patterns:**

```
Invariant Violation: requireNativeComponent
Unable to resolve module './NativeModule'
No component found for view with name "RCTView"
Animated: `useNativeDriver` was not specified
TypeError: Cannot read property 'navigate' of undefined
```

**Root Causes:**

- Native module not linked or mocked in tests
- Missing native dependency or Expo module
- React Native bridge not initialized in test environment
- Animation configuration incomplete
- Navigation context not provided in test

**Agent Match:** `expo-react-native-engineer`

---

### Runtime Error Patterns

#### Laravel Runtime Errors

**Common Patterns:**

```
Class 'App\Models\User' not found
Call to a member function on null
Too few arguments to function
SQLSTATE[42S02]: Base table or view not found
419 Page Expired (CSRF token mismatch)
```

**Root Causes:**

- Autoloader cache needs refresh (`composer dump-autoload`)
- Null check missing (relationship returns null)
- Method signature changed but call sites not updated
- Missing migration
- CSRF protection blocking request

**Agent Match:** `laravel-senior-engineer`

---

#### React/Next.js Runtime Errors

**Common Patterns:**

```
Hydration failed
Maximum update depth exceeded
Cannot update during an existing state transition
'X' is not defined
Objects are not valid as a React child
```

**Root Causes:**

- Server/client state mismatch
- Infinite re-render loop (setState in render)
- State update during render phase
- Missing import or typo
- Attempting to render object instead of primitive

**Agent Match:** `nextjs-senior-engineer` or `react-vite-tailwind-engineer`

---

#### Express/NestJS Runtime Errors

**Common Patterns:**

```
Cannot find module '@nestjs/...'
Circular dependency detected
Provider not found
Error: listen EADDRINUSE :::3000
UnhandledPromiseRejectionWarning
```

**Root Causes:**

- Missing package installation
- Circular module imports (A imports B, B imports A)
- Provider not added to module's providers array
- Port already in use
- Missing try/catch in async middleware

**Agent Match:** `express-senior-engineer`

---

#### FastAPI Runtime Errors

**Common Patterns:**

```
422 Unprocessable Entity
Internal Server Error (no detail)
sqlalchemy.exc.OperationalError: connection refused
RuntimeError: no running event loop
AttributeError: 'coroutine' object has no attribute 'X'
```

**Root Causes:**

- Request body doesn't match Pydantic model
- Unhandled exception in route handler
- Database connection pool exhausted or service down
- Mixing sync/async incorrectly
- Forgetting to `await` an async function

**Agent Match:** `fastapi-senior-engineer`

---

#### Go Runtime Errors

**Common Patterns:**

```
panic: runtime error: index out of range
fatal error: concurrent map writes
panic: interface conversion: interface {} is nil
goroutine leak detected
context deadline exceeded
```

**Root Causes:**

- Array/slice access without bounds check
- Concurrent map access without sync.Mutex or sync.Map
- Type assertion on nil interface
- Goroutine not properly cancelled or cleaned up
- External service timeout or slow response

**Agent Match:** `go-senior-engineer`

---

#### Swift/iOS Runtime Errors

**Common Patterns:**

```
Fatal error: Unexpectedly found nil while unwrapping
Thread 1: signal SIGABRT
[LayoutConstraints] Unable to simultaneously satisfy constraints
Publishing changes from within view updates is not allowed
Fatal error: Index out of range
```

**Root Causes:**

- Force unwrapping nil optional
- Unhandled exception or failed assertion
- Conflicting Auto Layout constraints
- SwiftUI state mutation during view body evaluation
- Array index out of bounds

**Agent Match:** `ios-macos-senior-engineer`

---

#### Docker/Container Runtime Errors

**Common Patterns:**

```
ERROR: Service 'app' failed to build
OCI runtime create failed: container_linux.go
port is already allocated
no space left on device
exec format error
```

**Root Causes:**

- Dockerfile syntax error or missing dependency in build
- Container runtime misconfiguration
- Host port conflict
- Docker disk space full (dangling images/volumes)
- Architecture mismatch (ARM image on x86 or vice versa)

**Agent Match:** `devops-docker-senior-engineer`

---

#### AWS/Infrastructure Errors

**Common Patterns:**

```
AccessDeniedException: User is not authorized
CREATE_FAILED (CloudFormation)
Error: Error creating IAM Role
CDK synth failed
Terraform plan failed: resource already exists
```

**Root Causes:**

- IAM permissions insufficient
- CloudFormation stack in failed state
- IAM role policy misconfiguration
- CDK code has type errors or invalid constructs
- Terraform state drift (resource exists outside Terraform)

**Agent Match:** `devops-aws-senior-engineer`

---

### TypeScript Compilation Errors

#### Type Error Patterns

**Laravel/PHP:** (N/A - PHP is dynamically typed, use PHPStan/Psalm for static analysis)

**Next.js / React Vite TypeScript:**

```
Property 'X' does not exist on type 'Y'
Type 'null' is not assignable to type 'string'
Argument of type 'X' is not assignable to parameter of type 'Y'
Cannot find name 'React'
```

**Root Causes:**

- Missing type definition for prop
- Null/undefined not handled (use optional chaining or type guards)
- Type mismatch (wrong type passed to function/component)
- Missing import

**Agent Match:** `nextjs-senior-engineer` or `react-vite-tailwind-engineer`

---

**Express/NestJS TypeScript:**

```
Property 'user' does not exist on type 'Request'
No overload matches this call
'req' implicitly has type 'any'
Decorator '@Injectable()' is not valid here
```

**Root Causes:**

- Need to extend Express Request type
- Middleware type definition incorrect
- Missing @types/express or @types/node
- NestJS decorator on wrong target (class vs method)

**Agent Match:** `express-senior-engineer`

---

### Performance Issues

#### Backend Performance (Laravel/Express/FastAPI/Go)

**Indicators:**

```
Response time > 2s
Database query count > 50 for single request
Memory usage growing unbounded
CPU spike on specific endpoint
```

**Common Causes:**

- **N+1 query problem** (missing eager loading in Laravel, missing joins in FastAPI/Go)
- **Missing database indexes** (full table scans)
- **Memory leak** (not releasing resources, goroutine leaks in Go)
- **Synchronous I/O** (should be async in FastAPI/Express)
- **No caching** (repeated expensive computations)

**Debugging Approach:**

1. Profile with Laravel Telescope, Node profiler, Python cProfile, or Go pprof
2. Check query count and execution time
3. Analyze database EXPLAIN for slow queries
4. Monitor memory usage over time
5. Identify blocking I/O operations

**Agent Match:** Framework-specific (`laravel-senior-engineer`, `express-senior-engineer`, `fastapi-senior-engineer`, `go-senior-engineer`)

---

#### Frontend Performance (Next.js/React)

**Indicators:**

```
First Contentful Paint > 2s
Cumulative Layout Shift > 0.1
Large bundle size (>500KB)
Slow component renders (>100ms)
```

**Common Causes:**

- **Unnecessary re-renders** (missing memoization)
- **Large bundle** (not code-splitting)
- **Unoptimized images** (not using Next.js Image)
- **Blocking JavaScript** (not deferring non-critical code)
- **Heavy computations** in render (should be useMemo)

**Debugging Approach:**

1. Use React DevTools Profiler
2. Check bundle analyzer for large dependencies
3. Lighthouse audit for Core Web Vitals
4. Identify components re-rendering unnecessarily
5. Check for blocking network requests

**Agent Match:** `nextjs-senior-engineer` or `react-vite-tailwind-engineer`

---

#### Mobile Performance (iOS/Expo)

**Indicators:**

```
Dropped frames / janky scrolling
High memory usage warnings
Slow app launch (> 3s)
Battery drain
Large app bundle size
```

**Common Causes:**

- **Too many re-renders** in React Native (missing memo)
- **Large images** not optimized or cached
- **Heavy computation on main thread** (should be on background thread)
- **Memory leaks** from uncleared subscriptions/listeners
- **Too many native bridge calls** in React Native

**Debugging Approach:**

1. Use Xcode Instruments (iOS) or React Native Perf Monitor
2. Profile memory usage and allocations
3. Check for unnecessary re-renders with React DevTools
4. Monitor JS thread frame rate
5. Audit native module usage

**Agent Match:** `ios-macos-senior-engineer` or `expo-react-native-engineer`

---

## Framework-Specific Debugging Strategies

### Laravel Debugging Strategy

**Step 1: Gather Context**

- Check error message and stack trace
- Review recent migrations and model changes
- Check `.env` configuration
- Review logs in `storage/logs/`

**Step 2: Isolate the Issue**

- Can you reproduce with `php artisan tinker`?
- Does it fail in specific environment only?
- Is it related to database, cache, or queue?

**Step 3: Common Fixes**

- Refresh autoloader: `composer dump-autoload`
- Clear caches: `php artisan cache:clear`, `config:clear`, `view:clear`
- Run migrations: `php artisan migrate`
- Re-seed database: `php artisan db:seed`

**Step 4: Deep Dive**

- Add `dd()` or `Log::debug()` at key points
- Use Laravel Telescope for request tracing
- Check database queries with Query Log
- Review authorization policies if 403 errors

---

### Next.js Debugging Strategy

**Step 1: Gather Context**

- Check browser console for client-side errors
- Check terminal for server-side errors
- Review Network tab for failed requests
- Check React DevTools for component tree

**Step 2: Isolate the Issue**

- Is it client-side or server-side?
- Does it happen during build or runtime?
- Is it related to data fetching or rendering?

**Step 3: Common Fixes**

- Clear `.next` directory: `rm -rf .next`
- Restart dev server
- Check if data fetching is working (server actions, API routes)
- Verify environment variables are loaded
- Check for hydration mismatches (server vs client state)

**Step 4: Deep Dive**

- Add `console.log` in server/client components appropriately
- Use React DevTools Profiler for render issues
- Check Network tab for API failures
- Use Next.js built-in error overlay for diagnostics

---

### React Vite/Tailwind Debugging Strategy

**Step 1: Gather Context**

- Check browser console for errors
- Check terminal for Vite build errors
- Review Tailwind class generation (is the class in the output CSS?)
- Check Vite dev server HMR status

**Step 2: Isolate the Issue**

- Is it a build error or runtime error?
- Is Tailwind generating the expected classes?
- Is Vite HMR working or stale?
- Is the issue in a specific component or global?

**Step 3: Common Fixes**

- Restart Vite dev server
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check `tailwind.config.ts` content paths
- Verify PostCSS config is correct
- Check Vite aliases match tsconfig paths

**Step 4: Deep Dive**

- Use browser DevTools to inspect computed styles
- Check Vite bundle with `vite-plugin-inspect`
- Verify tree-shaking is working correctly
- Profile with React DevTools for render issues

---

### Express/NestJS Debugging Strategy

**Step 1: Gather Context**

- Check terminal for console errors
- Review middleware stack order
- Check request/response logs
- Verify route registration

**Step 2: Isolate the Issue**

- Does middleware pass control correctly (`next()`)?
- Is route handler registered before wildcard routes?
- Is request body parsed (body-parser)?
- Are CORS headers set correctly?
- For NestJS: Is provider in module's `providers` array?

**Step 3: Common Fixes**

- Add `console.log` in middleware chain
- Verify middleware order (auth before protected routes)
- Check body-parser is configured
- Verify error handling middleware is last
- For NestJS: Check module imports and circular dependencies

**Step 4: Deep Dive**

- Use `morgan` for HTTP request logging
- Add debug logs in each middleware
- Test with curl/Postman to isolate client issues
- Check async/await error handling (use try-catch or `.catch()`)
- For NestJS: Use NestJS Logger and REPL mode

---

### Python/Django Debugging Strategy

**Step 1: Gather Context**

- Check terminal for traceback
- Review Django settings and URL configuration
- Check database migrations status
- Review logs

**Step 2: Isolate the Issue**

- Can you reproduce in Django shell (`python manage.py shell`)?
- Is it a model/database issue or view/template issue?
- Does it fail in specific environment only?

**Step 3: Common Fixes**

- Run migrations: `python manage.py migrate`
- Check virtual environment is activated
- Verify `INSTALLED_APPS` includes your app
- Clear Django cache
- Check `ALLOWED_HOSTS` for deployment issues

**Step 4: Deep Dive**

- Add `import pdb; pdb.set_trace()` or use `breakpoint()`
- Use Django Debug Toolbar for request profiling
- Check ORM queries with `django.db.connection.queries`
- Review middleware order in settings

---

### FastAPI Debugging Strategy

**Step 1: Gather Context**

- Check terminal for Uvicorn/Gunicorn errors
- Review Pydantic validation errors (422 responses)
- Check OpenAPI docs at `/docs` for schema correctness
- Review async function signatures

**Step 2: Isolate the Issue**

- Is it a validation error (Pydantic) or logic error?
- Is it sync vs async confusion?
- Is the database connection working?
- Is the dependency injection chain correct?

**Step 3: Common Fixes**

- Check Pydantic model matches request body
- Ensure `async def` for async operations, `def` for sync
- Verify database URL and connection pool settings
- Check `Depends()` chain resolves correctly

**Step 4: Deep Dive**

- Add `print()` or `logging.debug()` in route handlers
- Use `/docs` (Swagger UI) to test endpoints directly
- Profile with `cProfile` or `py-spy`
- Check for `await` on all async calls

---

### Go Debugging Strategy

**Step 1: Gather Context**

- Check terminal for panic/error messages
- Review goroutine stack traces
- Check `go vet` and `golangci-lint` output
- Review recent changes to interfaces/structs

**Step 2: Isolate the Issue**

- Is it a compile error or runtime panic?
- Is it a concurrency issue (race condition)?
- Is it a nil pointer or type assertion issue?
- Is an external dependency failing?

**Step 3: Common Fixes**

- Run `go vet ./...` for static analysis
- Run `go test -race ./...` to detect races
- Check nil pointers before dereferencing
- Verify interface implementations are complete
- Check error returns (don't ignore `err`)

**Step 4: Deep Dive**

- Use `dlv` (Delve) debugger
- Add `log.Printf` at key points
- Use `go tool pprof` for CPU/memory profiling
- Run with `-race` flag to detect data races
- Check goroutine leaks with `runtime.NumGoroutine()`

---

### iOS/macOS Debugging Strategy

**Step 1: Gather Context**

- Check Xcode console for errors and logs
- Review crash logs and stack traces
- Check build errors in Xcode Issue Navigator
- Review recent changes to SwiftUI views or models

**Step 2: Isolate the Issue**

- Is it a build error or runtime crash?
- Is it a SwiftUI layout issue or data issue?
- Is it related to a specific iOS version or device?
- Is it a threading issue (main thread violation)?

**Step 3: Common Fixes**

- Clean build folder: Product > Clean Build Folder (Cmd+Shift+K)
- Reset package caches: File > Packages > Reset Package Caches
- Check `@MainActor` annotations for UI updates
- Verify optional unwrapping (use `guard let` or `if let`)
- Check SPM dependency versions in Package.swift

**Step 4: Deep Dive**

- Use Xcode Instruments (Leaks, Time Profiler, Allocations)
- Add `#if DEBUG` logging
- Use Xcode breakpoints with conditions
- Check View hierarchy with Xcode Debug View Hierarchy
- Use `os_log` for structured logging

---

### Expo/React Native Debugging Strategy

**Step 1: Gather Context**

- Check Metro bundler terminal for errors
- Check device/simulator logs
- Review Expo Go or development build console
- Check for native module compatibility

**Step 2: Isolate the Issue**

- Is it a JavaScript error or native crash?
- Does it happen on iOS only, Android only, or both?
- Is it related to navigation, state, or native modules?
- Does it work in Expo Go but fail in dev build?

**Step 3: Common Fixes**

- Clear Metro cache: `npx expo start --clear`
- Reinstall node_modules and pods: `rm -rf node_modules && npm install && cd ios && pod install`
- Check Expo SDK version compatibility
- Verify native module is in `app.json` plugins
- Check for missing Expo config plugins

**Step 4: Deep Dive**

- Use React Native Debugger or Flipper
- Add `console.log` with React Native LogBox
- Check bridge calls with React Native Perf Monitor
- Profile with Xcode Instruments (iOS) or Android Profiler
- Check for memory leaks with heap snapshots

---

### Docker Debugging Strategy

**Step 1: Gather Context**

- Check `docker logs <container>` for errors
- Review Dockerfile for build issues
- Check `docker-compose logs` for multi-service issues
- Verify volume mounts and network configuration

**Step 2: Isolate the Issue**

- Is it a build error or runtime error?
- Is it a networking issue (containers can't communicate)?
- Is it a volume/permission issue?
- Is it an architecture mismatch (ARM vs x86)?

**Step 3: Common Fixes**

- Rebuild without cache: `docker build --no-cache`
- Check port mappings in docker-compose.yml
- Verify environment variables are passed correctly
- Check file permissions on mounted volumes
- Prune unused resources: `docker system prune`

**Step 4: Deep Dive**

- Shell into container: `docker exec -it <container> sh`
- Inspect network: `docker network inspect <network>`
- Check resource usage: `docker stats`
- Multi-stage build debugging: build specific stage
- Check image layers: `docker history <image>`

---

### AWS/Infrastructure Debugging Strategy

**Step 1: Gather Context**

- Check CloudWatch logs for errors
- Review CDK/Terraform output for deployment failures
- Check IAM permissions and policies
- Review CloudFormation events for stack failures

**Step 2: Isolate the Issue**

- Is it a deployment error or runtime error?
- Is it an IAM/permissions issue?
- Is it a networking issue (VPC, security groups)?
- Is it a resource limit or quota issue?

**Step 3: Common Fixes**

- Check IAM policy allows required actions
- Verify security group inbound/outbound rules
- Check CloudFormation stack events for failure reason
- Verify CDK bootstrap is up to date: `cdk bootstrap`
- Check Terraform state: `terraform state list`

**Step 4: Deep Dive**

- Use AWS CloudTrail for API call auditing
- Check VPC flow logs for network issues
- Use AWS X-Ray for distributed tracing
- Review CloudWatch metrics for resource health
- Test IAM policies with IAM Policy Simulator

---

## Root Cause Analysis Techniques

### Single vs Multiple Root Causes

**Indicators of Single Root Cause:**

- All failures started at the same time
- All errors mention the same dependency/module
- All stack traces share common code path
- Recent single change (commit, deploy, dependency update)

**Example:**

```
Scenario: All tests failing after infrastructure change

Error patterns:
- Laravel tests: "Cannot connect to database"
- Next.js tests: "API fetch failed: connection refused"
- Go tests: "dial tcp: connection refused"

Analysis: Single root cause (database service not running)
Decision: DON'T parallelize. Fix database connection first.
```

---

**Indicators of Multiple Independent Root Causes:**

- Failures in unrelated subsystems
- Different error messages/patterns
- Different stack traces with no commonality
- Isolated to specific modules/features

**Example:**

```
Scenario: Multiple test failures across stack

Error patterns:
- Laravel tests: "Missing factory trait in User test"
- Next.js tests: "Mock data has wrong shape for Product"
- Go tests: "TestPaymentHandler: expected 200 got 500"
- FastAPI tests: "422 Unprocessable Entity on /api/orders"

Analysis: Four independent issues in different subsystems
Decision: CAN parallelize. Each has different root cause.
```

---

### Dependency Analysis

**Questions to Ask:**

1. If I fix issue A, will issue B automatically resolve?
2. Does issue B require the fix from issue A to work?
3. Do A and B modify the same files/database/state?

**Dependency Matrix:**

| Issue A                  | Issue B                    | Dependent?              | Can Parallelize? |
| ------------------------ | -------------------------- | ----------------------- | ---------------- |
| Laravel DB schema change | Next.js uses old schema    | Yes (B depends on A)    | No               |
| Laravel auth bug         | Next.js UI bug             | No                      | Yes              |
| Shared util function bug | Multiple components use it | Yes (shared root cause) | No               |
| Bug in module X          | Bug in module Y            | No (isolated modules)   | Yes              |
| Go API returns wrong JSON| React frontend parse error | Yes (B depends on A)    | No               |
| iOS StoreKit bug         | Express API bug            | No                      | Yes              |

---

### Clustering Algorithm

**Step 1: Extract Error Metadata**
For each error, extract:

- Framework/tech stack
- Subsystem/module
- Error type (test failure, runtime error, type error, performance)
- Affected files

**Step 2: Group by Similarity**
Create clusters based on:

- Same tech stack AND same subsystem → Likely related, investigate together
- Different tech stack → Likely independent, can parallelize
- Same file/function → Likely related, investigate together
- Different modules with no overlap → Likely independent

**Step 3: Validate Independence**
For each cluster pair, verify:

- [ ] No shared files being modified
- [ ] No data dependencies
- [ ] No sequential ordering required
- [ ] No common root cause

**Step 4: Decision**

- If 3+ independent clusters → Proceed with parallel debugging
- If < 3 clusters OR clusters are related → Sequential debugging

---

## Common Pitfalls in Parallel Debugging

### Pitfall 1: Missing Shared Root Cause

**Scenario:**

```
Error 1: Laravel API returns 500
Error 2: Next.js fetch fails
Error 3: Go service returns 503
Error 4: FastAPI returns 500
```

**Assumption:** Four independent issues (different services)

**Reality:** All four fail because shared Redis cache or database is down

**Lesson:** Always check shared dependencies (database, cache, external APIs) before parallelizing

---

### Pitfall 2: Cascading Failures

**Scenario:**

```
Error 1: Database migration failed
Error 2: API tests fail (missing table)
Error 3: Frontend tests fail (API returns 500)
```

**Assumption:** Three separate issues

**Reality:** All stem from migration failure (Error 1)

**Lesson:** Fix foundational issues (DB, infrastructure) before debugging application logic

---

### Pitfall 3: Overlapping File Changes

**Scenario:**

```
Bug 1: Cart total calculation wrong (CartService.php)
Bug 2: Discount logic broken (CartService.php)
```

**Assumption:** Two separate bugs

**Reality:** Both agents modify CartService.php → merge conflict

**Lesson:** Check file overlap before parallelizing. If same file, consider sequential or manual coordination

---

### Pitfall 4: Ignoring Integration

**Scenario:**

```
Fix 1: Go API returns new response format
Fix 2: Next.js expects old API response format
```

**Result:** Both fixes work independently but break when integrated

**Lesson:** After parallel fixes, always run integration tests to verify fixes work together

---

### Pitfall 5: Infrastructure Fixes Masking App Bugs

**Scenario:**

```
Fix 1: devops-docker-senior-engineer fixes container networking
Fix 2: express-senior-engineer fixes API logic
```

**Result:** After Docker fix, the Express bug manifests differently

**Lesson:** Re-validate application-level fixes after infrastructure changes

---

## Validation Checklist Template

Use this checklist after parallel debugging to ensure quality:

### Per-Fix Validation

For each fix:

- [ ] Original error no longer reproduces
- [ ] Unit tests pass
- [ ] No new errors introduced
- [ ] Code follows project patterns
- [ ] Performance not degraded

### Integration Validation

For all fixes together:

- [ ] No file conflicts
- [ ] No contradictory changes
- [ ] Full test suite passes (not just fixed tests)
- [ ] Integration tests pass
- [ ] Manual smoke testing complete

### Documentation

- [ ] Fix documented (what was wrong, why, how fixed)
- [ ] If pattern issue, document prevention strategy
- [ ] Update relevant documentation if needed

---

## Advanced Debugging Patterns

### Pattern 1: Bisecting Parallel Failures

When facing many failures (e.g., 20+ test failures):

1. **Quick triage:** Group into categories by agent type
2. **Fix easy wins first:** Obvious issues (missing imports, typos)
3. **Identify patterns:** Are 10 failures all in auth? Might be shared root cause
4. **Parallelize remainder:** After pattern analysis, parallelize truly independent issues

---

### Pattern 2: Progressive Parallelization

Start sequential, then parallelize:

1. **Fix first issue** (understand the codebase)
2. **Assess impact** (did it fix multiple issues?)
3. **Identify remaining independent issues**
4. **Parallelize remaining** (now with context from first fix)

Useful when initial error state is unclear.

---

### Pattern 3: Parallel Investigation, Sequential Fix

Use parallel agents for investigation, then apply fixes sequentially:

1. **Launch parallel diagnostic agents** (gather information only)
2. **Aggregate findings** (identify root causes)
3. **Plan fix order** (based on dependencies discovered)
4. **Apply fixes sequentially or in parallel** (as appropriate)

Useful for complex, interconnected issues where you need full picture first.

---

### Pattern 4: Infrastructure-First Debugging

When errors span application and infrastructure:

1. **Fix infrastructure first** (`devops-docker-senior-engineer`, `devops-aws-senior-engineer`)
2. **Re-run tests** to see which app errors resolve
3. **Then parallelize remaining** app-level fixes across framework agents

Useful when Docker/AWS issues cause cascading failures in application code.

---

## Framework-Specific Error Codes Quick Reference

### Laravel HTTP Status Codes

- `419` → CSRF token mismatch
- `403` → Authorization failed (policy/gate)
- `500` → Server error (check logs)
- `404` → Route not found or model not found

### Next.js Build Errors

- `ENOENT` → File not found
- `Module not found` → Import path wrong or missing dependency
- `Hydration error` → Server/client mismatch
- `Error: Minified React error` → Check React error decoder

### Express/NestJS Errors

- `EADDRINUSE` → Port already in use
- `Cannot GET /path` → Route not registered
- `UnauthorizedException` → Auth guard blocked (NestJS)
- `BadRequestException` → Validation failed (NestJS)

### FastAPI Status Codes

- `422` → Pydantic validation error
- `401` → JWT token missing or invalid
- `500` → Unhandled exception in route handler

### Go Errors

- `panic: runtime error` → Nil pointer, index out of range, etc.
- `fatal error: concurrent map writes` → Missing mutex
- `context deadline exceeded` → Timeout on external call

### Swift/Xcode Errors

- `SIGABRT` → Assertion failure or unhandled exception
- `EXC_BAD_ACCESS` → Memory access violation
- `Build failed` → Check Issue Navigator for details

### Docker Errors

- `ENOSPC` → No space left on device
- `exec format error` → Architecture mismatch
- `OCI runtime error` → Container configuration issue

### AWS/CloudFormation Errors

- `CREATE_FAILED` → Resource creation failed (check events)
- `AccessDeniedException` → IAM permissions missing
- `LimitExceededException` → Service quota reached

---

## Recommended Debugging Tools by Framework

### Laravel

- **Laravel Telescope:** Request tracing, query monitoring
- **Debugbar:** In-browser debugging info
- **Tinker:** REPL for testing code
- **dd() / dump():** Quick variable inspection
- **Log::debug():** Logging
- **EXPLAIN:** Database query analysis

### Next.js

- **React DevTools:** Component tree inspection
- **Next.js Error Overlay:** Build-time errors
- **Network Tab:** API request debugging
- **Lighthouse:** Performance audit
- **console.log:** Still effective for server components (check terminal)

### React Vite/Tailwind

- **React DevTools:** Component tree and profiler
- **Vite Inspector:** `vite-plugin-inspect` for build analysis
- **Browser DevTools:** Computed styles for Tailwind debugging
- **Tailwind CSS IntelliSense:** IDE extension for class validation
- **Bundle Analyzer:** `rollup-plugin-visualizer` for bundle size

### Express/NestJS

- **Morgan:** HTTP request logger
- **Debug module:** Namespaced debugging
- **Postman/curl:** API testing
- **Node inspector:** Debugger
- **NestJS Logger:** Built-in NestJS logging
- **Swagger:** API endpoint testing (NestJS)

### Python/Django

- **Django Debug Toolbar:** Request profiling
- **pdb / breakpoint():** Interactive debugger
- **Django shell:** REPL for testing
- **pytest -v:** Verbose test output
- **logging module:** Structured logging

### FastAPI

- **Swagger UI (/docs):** Interactive API testing
- **py-spy:** Sampling profiler
- **logging module:** Debug logging
- **pdb / breakpoint():** Interactive debugger
- **httpx:** Async HTTP testing

### Go

- **Delve (dlv):** Go debugger
- **go tool pprof:** CPU and memory profiling
- **go test -race:** Race condition detection
- **golangci-lint:** Comprehensive linting
- **log.Printf:** Simple but effective

### iOS/macOS

- **Xcode Instruments:** Leaks, Time Profiler, Allocations
- **Xcode Debug View Hierarchy:** UI layout debugging
- **os_log:** Structured logging
- **LLDB:** Command-line debugger in Xcode
- **SwiftUI Preview:** Rapid UI iteration

### Expo/React Native

- **React Native Debugger:** All-in-one debugging
- **Flipper:** React Native plugin ecosystem
- **Expo Dev Tools:** Expo-specific debugging
- **Metro Bundler logs:** Build and module resolution issues
- **Xcode Instruments / Android Profiler:** Native performance

### Docker

- **docker logs:** Container log inspection
- **docker exec -it:** Shell into running container
- **docker stats:** Resource usage monitoring
- **docker inspect:** Container/network/volume details
- **dive:** Docker image layer analysis

### AWS

- **CloudWatch Logs:** Centralized logging
- **CloudTrail:** API call auditing
- **X-Ray:** Distributed tracing
- **IAM Policy Simulator:** Permission testing
- **CDK diff / Terraform plan:** Preview infrastructure changes

---

## Summary

This reference guide provides:

1. **Error pattern recognition** for quick agent matching across all 14 agent types
2. **Framework-specific debugging strategies** for effective troubleshooting
3. **Root cause analysis techniques** to determine parallelization viability
4. **Common pitfalls** to avoid when debugging in parallel
5. **Validation checklists** to ensure quality fixes
6. **Advanced patterns** for complex scenarios
7. **Debugging tool recommendations** for every supported framework

Use this guide in conjunction with the main `SKILL.md` workflow to orchestrate effective parallel debugging sessions.
