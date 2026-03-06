# Ask Jenny Shared Packages - LLM Guide

This guide helps AI assistants understand how to use Ask Jenny's shared packages effectively.

## Package Overview

Ask Jenny uses a monorepo structure with shared packages in `libs/`:

```
libs/
├── types/              # Type definitions (no dependencies)
├── utils/              # Utility functions
├── prompts/            # AI prompt templates
├── platform/           # Platform utilities
├── model-resolver/     # Claude model resolution
├── dependency-resolver/# Feature dependency resolution
└── git-utils/          # Git operations
```

## When to Use Each Package

### @ask-jenny/types

**Use when:** You need type definitions for any Ask Jenny concept.

**Import for:**

- `Feature` - Feature interface with all properties
- `ExecuteOptions` - Claude agent execution options
- `ConversationMessage` - Chat message format
- `ErrorType`, `ErrorInfo` - Error handling types
- `CLAUDE_MODEL_MAP` - Model alias to ID mapping
- `DEFAULT_MODELS` - Default model configurations

**Example:**

```typescript
import type { Feature, ExecuteOptions } from '@ask-jenny/types';
```

**Never import from:** `services/feature-loader`, `providers/types`

### @ask-jenny/utils

**Use when:** You need common utilities like logging, error handling, or image processing.

**Import for:**

- `createLogger(context)` - Structured logging
- `isAbortError(error)` - Error type checking
- `classifyError(error)` - Error classification
- `buildPromptWithImages()` - Prompt building with images
- `readImageAsBase64()` - Image handling
- `extractTextFromContent()` - Message parsing

**Example:**

```typescript
import { createLogger, classifyError } from '@ask-jenny/utils';
```

**Never import from:** `lib/logger`, `lib/error-handler`, `lib/prompt-builder`, `lib/image-handler`

### @ask-jenny/prompts

**Use when:** You need AI prompt templates for text enhancement or other AI-powered features.

**Import for:**

- `getEnhancementPrompt(mode)` - Get complete prompt for enhancement mode
- `getSystemPrompt(mode)` - Get system prompt for specific mode
- `getExamples(mode)` - Get few-shot examples for a mode
- `buildUserPrompt(description, mode)` - Build user prompt with examples
- `isValidEnhancementMode(mode)` - Check if mode is valid
- `IMPROVE_SYSTEM_PROMPT` - System prompt for improving vague descriptions
- `TECHNICAL_SYSTEM_PROMPT` - System prompt for adding technical details
- `SIMPLIFY_SYSTEM_PROMPT` - System prompt for simplifying verbose text
- `ACCEPTANCE_SYSTEM_PROMPT` - System prompt for adding acceptance criteria

**Example:**

```typescript
import { getEnhancementPrompt, isValidEnhancementMode } from '@ask-jenny/prompts';

if (isValidEnhancementMode('improve')) {
  const { systemPrompt, userPrompt } = getEnhancementPrompt('improve', description);
  const result = await callClaude(systemPrompt, userPrompt);
}
```

**Never import from:** `lib/enhancement-prompts`

**Enhancement modes:**

- `improve` - Transform vague requests into clear, actionable tasks
- `technical` - Add implementation details and technical specifications
- `simplify` - Make verbose descriptions concise and focused
- `acceptance` - Add testable acceptance criteria

### @ask-jenny/platform

**Use when:** You need to work with Ask Jenny's directory structure or spawn processes.

**Import for:**

- `getAskJennyDir(projectPath)` - Get .ask-jenny directory
- `getFeaturesDir(projectPath)` - Get features directory
- `getFeatureDir(projectPath, featureId)` - Get specific feature directory
- `ensureAskJennyDir(projectPath)` - Create .ask-jenny if needed
- `spawnJSONLProcess()` - Spawn process with JSONL output
- `initAllowedPaths()` - Security path validation

**Example:**

```typescript
import { getFeatureDir, ensureAskJennyDir } from '@ask-jenny/platform';
```

**Never import from:** `lib/ask-jenny-paths`, `lib/subprocess-manager`, `lib/security`

### @ask-jenny/model-resolver

**Use when:** You need to convert model aliases to full model IDs.

**Import for:**

- `resolveModelString(modelOrAlias)` - Convert alias to full ID
- `DEFAULT_MODELS` - Access default models

**Example:**

```typescript
import { resolveModelString, DEFAULT_MODELS } from '@ask-jenny/model-resolver';

// Convert user input to model ID
const modelId = resolveModelString('sonnet'); // → 'claude-sonnet-4-20250514'
```

**Never import from:** `lib/model-resolver`

**Model aliases:**

- `haiku` → `claude-haiku-4-5` (fast, simple tasks)
- `sonnet` → `claude-sonnet-4-20250514` (balanced, recommended)
- `opus` → `claude-opus-4-5-20251101` (maximum capability)

### @ask-jenny/dependency-resolver

**Use when:** You need to order features by dependencies or check if dependencies are satisfied.

**Import for:**

- `resolveDependencies(features)` - Topological sort with priority
- `areDependenciesSatisfied(feature, allFeatures)` - Check if ready to execute
- `getBlockingDependencies(feature, allFeatures)` - Get incomplete dependencies

**Example:**

```typescript
import { resolveDependencies, areDependenciesSatisfied } from '@ask-jenny/dependency-resolver';

const { orderedFeatures, hasCycle } = resolveDependencies(features);
if (!hasCycle) {
  for (const feature of orderedFeatures) {
    if (areDependenciesSatisfied(feature, features)) {
      await execute(feature);
    }
  }
}
```

**Never import from:** `lib/dependency-resolver`

**Used in:**

- Auto-mode feature execution (server)
- Board view feature ordering (UI)

### @ask-jenny/git-utils

**Use when:** You need git operations, status parsing, or diff generation.

**Import for:**

- `isGitRepo(path)` - Check if path is a git repository
- `parseGitStatus(output)` - Parse `git status --porcelain` output
- `getGitRepositoryDiffs(path)` - Get complete diffs (tracked + untracked)
- `generateSyntheticDiffForNewFile()` - Create diff for untracked file
- `listAllFilesInDirectory()` - List files excluding build artifacts

**Example:**

```typescript
import { isGitRepo, getGitRepositoryDiffs } from '@ask-jenny/git-utils';

if (await isGitRepo(projectPath)) {
  const { diff, files, hasChanges } = await getGitRepositoryDiffs(projectPath);
  console.log(`Found ${files.length} changed files`);
}
```

**Never import from:** `routes/common`

**Handles:**

- Binary file detection
- Large file handling (>1MB)
- Untracked file diffs
- Non-git directory support

## Common Patterns

### Creating a Feature Executor

```typescript
import type { Feature, ExecuteOptions } from '@ask-jenny/types';
import { createLogger, classifyError } from '@ask-jenny/utils';
import { resolveModelString, DEFAULT_MODELS } from '@ask-jenny/model-resolver';
import { areDependenciesSatisfied } from '@ask-jenny/dependency-resolver';
import { getFeatureDir } from '@ask-jenny/platform';

const logger = createLogger('FeatureExecutor');

async function executeFeature(feature: Feature, allFeatures: Feature[], projectPath: string) {
  // Check dependencies
  if (!areDependenciesSatisfied(feature, allFeatures)) {
    logger.warn(`Dependencies not satisfied for ${feature.id}`);
    return;
  }

  // Resolve model
  const model = resolveModelString(feature.model, DEFAULT_MODELS.autoMode);

  // Get feature directory
  const featureDir = getFeatureDir(projectPath, feature.id);

  try {
    // Execute with Claude
    const options: ExecuteOptions = {
      model,
      temperature: 0.7,
    };

    await runAgent(featureDir, options);

    logger.info(`Feature ${feature.id} completed`);
  } catch (error) {
    const errorInfo = classifyError(error);
    logger.error(`Feature ${feature.id} failed:`, errorInfo.message);
  }
}
```

### Analyzing Git Changes

```typescript
import { getGitRepositoryDiffs, parseGitStatus } from '@ask-jenny/git-utils';
import { createLogger } from '@ask-jenny/utils';

const logger = createLogger('GitAnalyzer');

async function analyzeChanges(projectPath: string) {
  const { diff, files, hasChanges } = await getGitRepositoryDiffs(projectPath);

  if (!hasChanges) {
    logger.info('No changes detected');
    return;
  }

  // Group by status
  const modified = files.filter((f) => f.status === 'M');
  const added = files.filter((f) => f.status === 'A');
  const deleted = files.filter((f) => f.status === 'D');
  const untracked = files.filter((f) => f.status === '?');

  logger.info(
    `Changes: ${modified.length}M ${added.length}A ${deleted.length}D ${untracked.length}U`
  );

  return diff;
}
```

### Ordering Features for Execution

```typescript
import type { Feature } from '@ask-jenny/types';
import { resolveDependencies, getBlockingDependencies } from '@ask-jenny/dependency-resolver';
import { createLogger } from '@ask-jenny/utils';

const logger = createLogger('FeatureOrdering');

function orderAndFilterFeatures(features: Feature[]): Feature[] {
  const { orderedFeatures, hasCycle, cyclicFeatures } = resolveDependencies(features);

  if (hasCycle) {
    logger.error(`Circular dependency detected: ${cyclicFeatures.join(' → ')}`);
    throw new Error('Cannot execute features with circular dependencies');
  }

  // Filter to only ready features
  const readyFeatures = orderedFeatures.filter((feature) => {
    const blocking = getBlockingDependencies(feature, features);
    if (blocking.length > 0) {
      logger.debug(`${feature.id} blocked by: ${blocking.join(', ')}`);
      return false;
    }
    return true;
  });

  logger.info(`${readyFeatures.length} of ${features.length} features ready`);
  return readyFeatures;
}
```

## Import Rules for LLMs

### ✅ DO

```typescript
// Import types from @ask-jenny/types
import type { Feature, ExecuteOptions } from '@ask-jenny/types';

// Import constants from @ask-jenny/types
import { CLAUDE_MODEL_MAP, DEFAULT_MODELS } from '@ask-jenny/types';

// Import utilities from @ask-jenny/utils
import { createLogger, classifyError } from '@ask-jenny/utils';

// Import prompts from @ask-jenny/prompts
import { getEnhancementPrompt, isValidEnhancementMode } from '@ask-jenny/prompts';

// Import platform utils from @ask-jenny/platform
import { getFeatureDir, ensureAskJennyDir } from '@ask-jenny/platform';

// Import model resolution from @ask-jenny/model-resolver
import { resolveModelString } from '@ask-jenny/model-resolver';

// Import dependency resolution from @ask-jenny/dependency-resolver
import { resolveDependencies } from '@ask-jenny/dependency-resolver';

// Import git utils from @ask-jenny/git-utils
import { getGitRepositoryDiffs } from '@ask-jenny/git-utils';
```

### ❌ DON'T

```typescript
// DON'T import from old paths
import { Feature } from '../services/feature-loader';           // ❌
import { ExecuteOptions } from '../providers/types';            // ❌
import { createLogger } from '../lib/logger';                   // ❌
import { resolveModelString } from '../lib/model-resolver';     // ❌
import { isGitRepo } from '../routes/common';                   // ❌
import { resolveDependencies } from '../lib/dependency-resolver'; // ❌
import { getEnhancementPrompt } from '../lib/enhancement-prompts'; // ❌

// DON'T import from old lib/ paths
import { getFeatureDir } from '../lib/ask-jenny-paths';         // ❌
import { classifyError } from '../lib/error-handler';           // ❌

// DON'T define types that exist in @ask-jenny/types
interface Feature { ... }  // ❌ Use: import type { Feature } from '@ask-jenny/types';
```

## Migration Checklist

When refactoring server code, check:

- [ ] All `Feature` imports use `@ask-jenny/types`
- [ ] All `ExecuteOptions` imports use `@ask-jenny/types`
- [ ] All logger usage uses `@ask-jenny/utils`
- [ ] All prompt templates use `@ask-jenny/prompts`
- [ ] All path operations use `@ask-jenny/platform`
- [ ] All model resolution uses `@ask-jenny/model-resolver`
- [ ] All dependency checks use `@ask-jenny/dependency-resolver`
- [ ] All git operations use `@ask-jenny/git-utils`
- [ ] No imports from old `lib/` paths
- [ ] No imports from `services/feature-loader` for types
- [ ] No imports from `providers/types`

## Package Dependencies

Understanding the dependency chain helps prevent circular dependencies:

```
@ask-jenny/types (no dependencies)
    ↓
@ask-jenny/utils
@ask-jenny/prompts
@ask-jenny/platform
@ask-jenny/model-resolver
@ask-jenny/dependency-resolver
    ↓
@ask-jenny/git-utils
    ↓
@ask-jenny/server
@ask-jenny/ui
```

**Rule:** Packages can only depend on packages above them in the chain.

## Building Packages

All packages must be built before use:

```bash
# Build all packages from workspace
npm run build:packages

# Or from root
npm install  # Installs and links workspace packages
```

## Module Format

All packages use ES modules (`type: "module"`) with NodeNext module resolution:

- Requires explicit `.js` extensions in import statements
- Compatible with both Node.js (server) and Vite (UI)
- Centralized ESM configuration in `libs/tsconfig.base.json`

## Testing

When writing tests:

```typescript
// ✅ Import from packages
import type { Feature } from '@ask-jenny/types';
import { createLogger } from '@ask-jenny/utils';

// ❌ Don't import from src
import { Feature } from '../../../src/services/feature-loader';
```

## Summary for LLMs

**Quick reference:**

- Types → `@ask-jenny/types`
- Logging/Errors/Utils → `@ask-jenny/utils`
- AI Prompts → `@ask-jenny/prompts`
- Paths/Security → `@ask-jenny/platform`
- Model Resolution → `@ask-jenny/model-resolver`
- Dependency Ordering → `@ask-jenny/dependency-resolver`
- Git Operations → `@ask-jenny/git-utils`

**Never import from:** `lib/*`, `services/feature-loader` (for types), `providers/types`, `routes/common`

**Always:** Use the shared packages instead of local implementations.
