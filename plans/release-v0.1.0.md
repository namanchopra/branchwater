# Branchwater v0.1.0 — Release Plan

> Target: first public open-source release on GitHub + first publish to npm as `branchwater`.
> Status as of this plan: security review done (2 fixes landed), npm name `branchwater` is available,
> `gh` authenticated as `namanchopra`, git initialized locally on `main` (not yet pushed).

## 0. Pre-flight gates (all currently GREEN)
- `npx tsc --noEmit` · `npx eslint .` · `npx jest` (205 passed, 14 gated-skipped) · web typecheck/build/test (21) · `npm run build`
- Engine-agnostic boundary clean (only `src/cli/index.ts` imports an adapter)
- `npm pack --dry-run` → 82 files, `dist` + `README` + `LICENSE` only, no source/test/secret leak

## 1. Security fixes (DONE — landed this session)
- **[Med] DNS-rebinding**: `Host`-header allowlist (`127.0.0.1`/`localhost`/`::1`) on every request → 403 otherwise (`src/server/security.ts`). + regression test.
- **[Low] Credential leak**: lift libpq `?password=` query-param into `PGPASSWORD`, strip from `--dbname` argv (`src/adapters/postgres/config.ts`). + regression test.

## 2. Repo finalize (DONE / pending decisions)
- [x] `LICENSE` (MIT) added; `package.json` metadata (repository, homepage, bugs, engines `>=18`, keywords, author, `types`, `type:commonjs`, `prepublishOnly`).
- [x] README: `your-org` → `namanchopra`; added `npm i -g branchwater` / `npx` install.
- [ ] **Decision**: include `.claude/` (agent tooling, 79 files) + `plans/` in the PUBLIC repo? (Recommendation: exclude both via `.gitignore` for a clean product repo — they contain no secrets, purely editorial.)
- [ ] CI hardening: pin `actions/*` to commit SHAs, add `permissions: { contents: read }` to `ci.yml`.

## 3. GitHub (pending decision)
- `gh repo create namanchopra/branchwater --public --source=. --remote=origin --description "git for your local databases"`
- Commit (`feat: Branchwater v0.1.0 — engine-agnostic local DB version control + web UI`), `git push -u origin main`.
- Add repo topics: `database`, `postgres`, `cli`, `developer-tools`, `version-control`.

## 4. npm publish (pending decision — needs npm auth)
Two options:
- **(A) GitHub Actions release workflow (recommended)** — add `.github/workflows/release.yml` that, on a `v*` tag (or GitHub Release), runs build+test then `npm publish --provenance --access public` using an `NPM_TOKEN` repo secret (+ OIDC provenance). Reproducible, auditable, signed.
- **(B) Manual** — `npm login` then `npm publish --access public` locally. `prepublishOnly` re-runs build+test as a guard.

## 5. Tag + release
- `git tag v0.1.0 && git push --tags` → triggers release workflow (option A) → GitHub Release notes from this plan's highlights.

## 6. Post-release (backlog)
- Fix the pre-existing `diffBranches` row-level delta (materialize both `from` and `to` instead of trusting the live DB as `from`).
- Optional hardening: require `x-bw-token` header (not `?token=`) for `/api/*` mutations; restrictive perms on `.bw` dump artifacts.
- Marketing site (separate task).
