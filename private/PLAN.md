# PLAN.md

## Notes

- Vision: Modern, high-signal hooks library for Figma Variables—React 19+, ergonomic, pro OSS quality.
- Philosophy: Keep it fast, modular, type-safe, and job-winning. "If it's not viral, it's not done."

## Task List

- [x] Audit usage of `constants/index.ts`—centralize repeatable values/config where possible.
- [x] Decide if all API/fetch logic should live in `api/fetcher.ts` or `utils/api.ts` for clarity/maintenance.
- [x] Refactor mutations to call fetchers/utilities instead of handling fetch inline.
- [ ] Research TanStack/React Query and similar libraries for code structure, API separation, docs.
- [ ] Consider exposing all fetch logic as custom hooks (`useFetch`), to match hooks-library best practices.
- [ ] Standardize constants usage—minimize duplication, enforce DRY patterns.
- [ ] Add/expand JSDoc for API docs generation.
- [ ] Review for "pro" OSS architecture: modular, testable, well-documented, with future docs-site support.

## Open Questions

- Mandate: Should all network logic go in a hook (e.g. `useFetch`), or are there valid exceptions?
- Is putting all constants in `constants/index.ts` ever problematic for tree-shaking or bundle size?

## Done

- Audit usage of `constants/index.ts`—centralize repeatable values/config where possible.
- Decide if all API/fetch logic should live in `api/fetcher.ts` or `utils/api.ts` for clarity/maintenance.
- Refactor mutations to call fetchers/utilities instead of handling fetch inline.
