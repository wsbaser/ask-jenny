# Migrate Automaker Name References

**Date**: 2026-03-07
**Status**: Draft

---

## Overview

Remove all remaining references to the old project name "Automaker" from the codebase and replace them with "ask-jenny" (code identifiers) or "Ask Jenny" (display text). This includes removing the entire legacy migration layer that was bridging the old and new app name, and updating OS-level filesystem paths used for Electron data storage.

---

## Requirements

### Functional Requirements

1. All `LEGACY_STORAGE_KEYS`, `LEGACY_SESSION_KEYS`, and `LEGACY_EVENT_NAMES` constants in `storage-keys.ts` are removed.
2. All code that references or uses legacy `automaker:` / `automaker-` storage keys is removed, including migration hooks, server migration routes, and service migration functions.
3. The server-side settings migration route (`apps/server/src/routes/settings/routes/migrate.ts`) is deleted.
4. The UI migration hook (`apps/ui/src/hooks/use-settings-migration.ts`) is deleted, and all call sites removed.
5. The migration function in `settings-service.ts` that reads from `automaker-storage` / `automaker-setup` localStorage keys is removed.
6. The migration startup call in `apps/server/src/index.ts` is removed along with its associated comments.
7. OS-level filesystem paths in `settings-service.ts` are updated from `Automaker` to `Ask-Jenny`:
   - macOS: `~/Library/Application Support/Ask-Jenny`
   - Windows: `%APPDATA%\Ask-Jenny`
   - Linux: `~/.config/Ask-Jenny`
8. The `http-api-client.ts` type definition referencing `automaker-storage` and `automaker-setup` keys is updated or removed.
9. The `LEGACY_SPLASH_KEY = 'automaker-splash-shown'` constant in `app.tsx` is removed.
10. `apps/ui/src/store/app-store.ts` migration code reading from legacy `automaker:` keys is removed.
11. `apps/ui/src/routes/__root.tsx` event listeners use `EVENT_NAMES` constants (already `ask-jenny:` prefixed) instead of hardcoded `automaker:` strings.
12. All comments and documentation strings referencing "Automaker" are updated to "Ask Jenny".
13. All tests are updated to reflect removed migration code and updated constants.
14. The stale worktree file at `worktrees/automode-api/` is left untouched.

### Non-Functional Requirements

1. Existing users who had data stored under old `automaker:` localStorage keys will not have their data automatically migrated (migration removal is intentional).
2. No new backwards-compatibility shims are introduced.

---

## Design Decisions

### Remove Legacy Migration Entirely

**Decision:** Delete all migration infrastructure (constants, hooks, routes, service methods) rather than keeping it for backwards compatibility.

**Rationale:** The project has been renamed and the migration layer has served its purpose. Removing it simplifies the codebase and eliminates the last "automaker" references.

**Alternatives rejected:**

- Keep legacy constants as-is — rejected because the goal is a clean rename with no old name remaining.
- Remove constants only — rejected because it leaves orphaned migration logic spread across the codebase.

### Update OS Filesystem Paths

**Decision:** Update the Electron app data directory name from `Automaker` to `Ask-Jenny` in all OS paths.

**Rationale:** Electron uses these paths to determine where to store user data. The directory name should match the current app name. Uses `Ask-Jenny` (hyphenated) to match the npm package naming convention already used throughout the project.

**Alternatives rejected:**

- Keep `Automaker` paths — rejected because they contradict the rename goal and would confuse users inspecting their filesystem.

### Use EVENT_NAMES Constants in \_\_root.tsx

**Decision:** Replace hardcoded `'automaker:logged-out'` and `'automaker:server-offline'` strings with `EVENT_NAMES.LOGGED_OUT` and `EVENT_NAMES.SERVER_OFFLINE` imports.

**Rationale:** `EVENT_NAMES` in `storage-keys.ts` already has the correct `ask-jenny:` prefixed values. The hardcoded strings in `__root.tsx` were an oversight.

---

## Acceptance Criteria

- [ ] `grep -ri "automaker" apps/` returns zero results (excluding the stale `worktrees/automode-api/` directory)
- [ ] All tests pass: `npm run test:all`
- [ ] Linting passes: `npm run lint`
- [ ] `LEGACY_STORAGE_KEYS`, `LEGACY_SESSION_KEYS`, `LEGACY_EVENT_NAMES` are no longer exported from `storage-keys.ts`
- [ ] `apps/server/src/routes/settings/routes/migrate.ts` no longer exists
- [ ] `apps/ui/src/hooks/use-settings-migration.ts` no longer exists
- [ ] OS filesystem paths in `settings-service.ts` read `Ask-Jenny`, not `Automaker`
- [ ] `apps/ui/src/routes/__root.tsx` imports and uses `EVENT_NAMES` constants instead of hardcoded strings

---

## Open Questions

- None
