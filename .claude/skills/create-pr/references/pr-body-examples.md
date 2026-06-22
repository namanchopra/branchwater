# PR Body Examples

Complete examples of PR bodies for different types and sizes.

## Example 1: Small Feature PR (S size, 2 files)

```bash
gh pr create --base main --title "feat(search): add brand filter to product search" --body "$(cat <<'EOF'
## Summary
- Add brand filtering capability to product search endpoint
- Users can now filter search results by one or more brand names
- Leverages existing Typesense facet infrastructure

## Test Plan
- [ ] Search with single brand filter returns only matching products
- [ ] Search with multiple brand filters returns union of results
- [ ] Search without brand filter works unchanged (backward compatible)
- [ ] Empty brand filter array is treated as no filter
EOF
)"
```

## Example 2: Large Feature PR (L size, 15 files)

```bash
gh pr create --base main --title "feat(auth): add JWT authentication system" --body "$(cat <<'EOF'
## Summary
- Implement JWT-based authentication for API endpoints
- Add login, refresh, and logout flows with secure token handling
- Protect account and cart endpoints behind auth middleware
- Support guest-to-authenticated user session migration

## Changes

### Authentication Core
- Add `src/server/middleware/auth.middleware.ts` — JWT validation middleware
- Add `src/services/auth/token.service.ts` — Token generation, refresh, and blacklisting
- Add `src/services/auth/auth.service.ts` — Login, logout, session management

### API Endpoints
- Add `src/server/routes/auth.routes.ts` — POST /auth/login, POST /auth/refresh, POST /auth/logout
- Update `src/server/index.ts` — Register auth routes and middleware

### Agent Integration
- Update `src/mastra/tools/customer/` — Pass auth token to GraphQL API calls
- Update `src/server/middleware/user.middleware.ts` — Extract JWT claims into RequestContext

### Configuration
- Update `src/config/server.config.ts` — Add JWT secret, expiry, refresh settings
- Add `src/config/auth.schema.ts` — Zod schema for auth environment variables

## Test Plan
- [ ] Login with valid credentials returns access + refresh tokens
- [ ] Login with invalid credentials returns 401
- [ ] Protected endpoints reject requests without token
- [ ] Protected endpoints accept requests with valid token
- [ ] Expired tokens are rejected with 401
- [ ] Refresh token generates new access token
- [ ] Logout blacklists the refresh token
- [ ] Guest session migrates to authenticated on login

## Notes
- New env vars required: `JWT_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`
- Refresh token blacklist stored in PostgreSQL (new migration included)
- Rate limiting applied to login endpoint (5 attempts per minute)
EOF
)"
```

## Example 3: Bugfix PR (M size, 6 files)

```bash
gh pr create --base main --title "fix(cart): correct total calculation with percentage discounts" --body "$(cat <<'EOF'
## Summary
- Fix cart total miscalculation when percentage discounts applied to items with quantity > 1
- Discount was applied per-unit instead of per-line, causing inflated totals
- Root cause: `applyDiscount()` in cart service multiplied discount by quantity twice

## Changes

### Cart Service
- Fix `src/services/cart/calculator.ts` — Remove double quantity multiplication in `applyDiscount()`
- Update `src/services/cart/formatter.ts` — Ensure consistent decimal rounding (2 places)

### Tools
- Update `src/mastra/tools/cart/get-cart-summary.tool.ts` — Pass raw totals without re-calculation

### Tests
- Add `src/services/cart/__tests__/calculator.test.ts` — Unit tests for discount scenarios
- Add `src/services/cart/__tests__/formatter.test.ts` — Rounding edge cases

## Test Plan
- [ ] Cart with 3x item at 100 AED with 10% discount shows 270 AED (not 240 AED)
- [ ] Cart with mixed discount types (percentage + fixed) calculates correctly
- [ ] Cart with quantity 1 is unaffected by the fix
- [ ] All existing cart tests pass
- [ ] Currency-specific rounding works (KWD 3 decimals, AED 2 decimals)
EOF
)"
```

## Example 4: Breaking Change PR (feat!, any size)

```bash
gh pr create --base main --title "feat(api)!: migrate search endpoint to v2 with pagination" --body "$(cat <<'EOF'
## Summary
- Migrate product search from v1 (offset-based) to v2 (cursor-based pagination)
- Reduce payload size by 60% with field selection and lazy image loading
- Remove deprecated filter parameters in favor of structured filter object
- Improve search relevance scoring with new boost pipeline

## Changes

### API Layer
- Update `src/server/routes/` — Replace GET /api/v1/search with POST /api/v2/search
- Update `src/mastra/tools/search/product-search.tool.ts` — New input/output schema

### Search Service
- Rewrite `src/services/product/search.ts` — Cursor-based pagination, field projection
- Update `src/services/product/boost/service.ts` — New boost pipeline with configurable strategies

### Models
- Update `src/models/search.ts` — New SearchParams, SearchResult, CursorPage types
- Remove `src/models/search-v1.ts` — Deleted legacy types

## Breaking Changes
- **Endpoint changed**: `GET /api/v1/search?q=...` → `POST /api/v2/search` with JSON body
- **Pagination**: `offset`/`limit` replaced by `cursor`/`pageSize` — clients must update
- **Filters**: `?brand=X&category=Y` replaced by `{ filters: { brand: ["X"], category: ["Y"] } }`
- **Response shape**: `results[]` renamed to `products[]`, `total` renamed to `totalCount`
- **Removed fields**: `thumbnail_url` removed from default response (use `fields` parameter to include)

**Migration steps:**
1. Update API clients to use POST /api/v2/search
2. Replace offset/limit with cursor/pageSize in pagination logic
3. Move query string filters to JSON body `filters` object
4. Update response parsing: `results` → `products`, `total` → `totalCount`

## Test Plan
- [ ] POST /api/v2/search returns results with cursor pagination
- [ ] Cursor-based next page returns correct subsequent results
- [ ] Structured filters work for brand, category, price range
- [ ] Field selection reduces response payload
- [ ] GET /api/v1/search returns 410 Gone with migration guidance
- [ ] Boost pipeline applies delivery and new-arrival boosts correctly
- [ ] Empty search returns sensible defaults

## Notes
- v1 endpoint returns 410 Gone with message pointing to v2 docs
- New env var: `SEARCH_DEFAULT_PAGE_SIZE` (default: 20)
- Typesense collection schema unchanged — this is API-layer only
EOF
)"
```
