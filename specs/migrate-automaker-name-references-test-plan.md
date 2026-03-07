# Test Plan: Migrate Automaker Name References

**Date**: 2026-03-07
**Branch**: chore/migrate-project-name-references
**Spec**: specs/migrate-automaker-name-references.md

---

## 1. Automated Checks (run first)

### 1.1 Build

```bash
npm run build:packages
npm run build
```

Expected: zero errors.

### 1.2 Unit & Server Tests

```bash
npm run test:all
```

Expected: no new failures beyond the 11 known pre-existing failures (jira, fs-utils symlinks, provider-factory cursor, dev-server-service, worktree create).

### 1.3 Lint

```bash
npm run lint
npm run format:check
```

Expected: zero errors or warnings.

### 1.4 Zero automaker References

```bash
grep -ri "automaker" apps/ libs/
```

Expected: **zero results**.

Verify the stale worktree is excluded (its references are intentionally untouched):

```bash
grep -ri "automaker" worktrees/automode-api/
```

Expected: results exist here and only here.

---

## 2. File Existence Checks

| Check                                           | Command                                                                    | Expected  |
| ----------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| migrate.ts deleted                              | `test -f apps/server/src/routes/settings/routes/migrate.ts && echo EXISTS` | no output |
| use-settings-migration.ts present (NOT deleted) | `test -f apps/ui/src/hooks/use-settings-migration.ts && echo EXISTS`       | `EXISTS`  |

---

## 3. Source Code Spot Checks

### 3.1 storage-keys.ts — LEGACY\_\* exports removed

```bash
grep -n "LEGACY_" apps/ui/src/lib/storage-keys.ts
```

Expected: zero results.

### 3.2 settings-service.ts — OS paths updated

```bash
grep -n "Ask-Jenny\|Automaker" apps/server/src/services/settings-service.ts
```

Expected: only `Ask-Jenny` results, no `Automaker`.

### 3.3 \_\_root.tsx — EVENT_NAMES constants used

```bash
grep -n "automaker\|EVENT_NAMES" apps/ui/src/routes/__root.tsx
```

Expected: `EVENT_NAMES.LOGGED_OUT` and `EVENT_NAMES.SERVER_OFFLINE` present; no `automaker:` strings.

### 3.4 app-store.ts — legacy key migration removed

```bash
grep -n "LEGACY_\|automaker" apps/ui/src/store/app-store.ts
```

Expected: zero results.

### 3.5 app.tsx — SPLASH_SESSION_KEY replaced

```bash
grep -n "SPLASH_SESSION_KEY\|LEGACY_SPLASH\|SESSION_KEYS" apps/ui/src/app.tsx
```

Expected: `SESSION_KEYS.SPLASH_SHOWN` present; no `LEGACY_SPLASH_KEY` or local `SPLASH_SESSION_KEY`.

### 3.6 use-settings-migration.ts — LOCALSTORAGE_KEYS and automaker entries removed

```bash
grep -n "automaker\|LOCALSTORAGE_KEYS" apps/ui/src/hooks/use-settings-migration.ts
```

Expected: zero results.

### 3.7 http-api-client.ts — automaker type fields removed

```bash
grep -n "automaker" apps/ui/src/lib/http-api-client.ts
```

Expected: zero results.

### 3.8 migrate route unregistered

```bash
grep -n "migrate" apps/server/src/routes/settings/index.ts
```

Expected: no import or route registration for the migrate route.

### 3.9 index.ts startup migration removed

```bash
grep -n "automaker\|migrateFrom\|legacyElectron" apps/server/src/index.ts
```

Expected: zero results.

---

## 4. Test File Spot Checks

Verify test files no longer reference legacy keys:

```bash
grep -n "automaker" \
  apps/server/tests/unit/services/settings-service.test.ts \
  apps/ui/src/__tests__/store/app-store-theme.test.ts \
  apps/ui/src/__tests__/lib/storage-keys.test.ts \
  apps/ui/src/__tests__/hooks/use-auto-mode-migration.test.ts
```

Expected: zero results.

Verify LEGACY\_\* imports removed from storage-keys test:

```bash
grep -n "LEGACY_" apps/ui/src/__tests__/lib/storage-keys.test.ts
```

Expected: zero results.

---

## 5. Manual / Runtime Verification

### 5.1 Settings load correctly

1. Start the server: `npm run dev:web`
2. Navigate to Settings
3. Verify settings load without errors in browser console
4. Check no `automaker:` keys are written to localStorage (DevTools → Application → Local Storage)

### 5.2 Event system works

1. Trigger a logout (or simulate it via DevTools: `window.dispatchEvent(new Event('ask-jenny:logged-out'))`)
2. Verify the app redirects to login / handles the event correctly
3. Repeat for `ask-jenny:server-offline`

### 5.3 Theme/font persistence

1. Change the theme (dark/light) in settings
2. Reload the page
3. Verify the theme is restored from `ask-jenny:theme` (not `automaker:theme`)

### 5.4 New user flow (no legacy data)

1. Open the app in a fresh browser profile (no prior localStorage)
2. Verify setup wizard / onboarding loads without errors
3. Verify no console errors related to missing settings

---

## 6. Known Non-Issues (do not flag)

- `worktrees/automode-api/` contains `@automaker/types` imports — intentionally untouched (stale branch)
- `use-settings-migration.ts` still exists — intentional; the file contains non-migration core logic (`syncSettingsToServer`, `hydrateStoreFromSettings`)
- 11 pre-existing test failures (jira, fs-utils, provider-factory, dev-server-service, worktree create) — unrelated to this change
