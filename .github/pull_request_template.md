## What & why

<!-- What does this change and why? Link any issue. -->

## Checklist

- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] **Engine-agnostic boundary kept**: nothing in `src/core/**`, `src/cli/commands/**`, or `src/server/**` imports `src/adapters/**` (only `src/cli/index.ts` may)
- [ ] New writes are confirm-gated + auto-snapshot first; secrets never reach argv
- [ ] Added/updated tests (and gated PG/e2e suites still skip without `BW_TEST_PG_URL`)
- [ ] Docs updated if the API surface changed (`.claude/claude-md-refs/*`)
