# Context Loading Flow

**Date**: 2026-03-07
**Status**: Reference Documentation

---

This document describes how Ask Jenny loads and combines multiple context sources when executing features.

---

## Overview

Ask Jenny uses a layered context system that combines:

1. **CLAUDE.md files** - Loaded by Claude Agent SDK's built-in mechanism
2. **Context files** - Project-specific rules (always loaded)
3. **Memory files** - Learnings (smart-selected based on task relevance)
4. **Skills** - Agent-invoked workflows (available during execution)

---

## Full Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ASK JENNY EXECUTION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

1. FEATURE CREATED (User)
   │
   ▼
2. AUTO-MODE SERVICE STARTS
   │
   ├─► loadContextFiles({ projectPath, taskContext: { title, description } })
   │   │
   │   ├─► Load ALL files from .ask-jenny/context/ (always loaded)
   │   │
   │   └─► Smart-select from .ask-jenny/memory/:
   │       • Score by tag/filename/summary matching task
   │       • Always include gotchas.md
   │       • Include high-importance files (≥0.9)
   │       • Top 5 by score
   │
   │   Returns: { formattedPrompt, files, memoryFiles }
   │
   ▼
3. BUILD SDK OPTIONS
   │
   │   createAutoModeOptions({
   │     cwd: worktree,
   │     model: feature.model,
   │     autoLoadClaudeMd: true,  ← KEY SETTING
   │     mcpServers: {...},
   │     thinkingLevel: feature.thinkingLevel
   │   })
   │
   │   This creates:
   │   {
   │     systemPrompt: {
   │       type: 'preset',
   │       preset: 'claude_code',  ← SDK loads CLAUDE.md automatically
   │       append: contextResult.formattedPrompt  ← Ask Jenny's context/memory
   │     },
   │     settingSources: ['user', 'project'],  ← Loads ~/.claude/ + ./.claude/
   │     ...
   │   }
   │
   ▼
4. SDK EXECUTES WITH LAYERED CONTEXT:
   │
   │   ┌─────────────────────────────────────────────────────────────┐
   │   │ Agent Context (loaded BEFORE agent starts)                  │
   │   ├─────────────────────────────────────────────────────────────┤
   │   │ 1. CLAUDE.md files (via SDK settingSources)                 │
   │   │    • ~/.claude/CLAUDE.md (user global)                      │
   │   │    • .claude/CLAUDE.md (project local)                      │
   │   │    • .ask-jenny/context/CLAUDE.md (if exists)               │
   │   │                                                              │
   │   │ 2. Ask Jenny context files (via systemPrompt.append)        │
   │   │    • .ask-jenny/context/*.md (ALL files)                    │
   │   │    • .ask-jenny/memory/*.md (smart-selected)                │
   │   └─────────────────────────────────────────────────────────────┘
   │
   ▼
5. AGENT EXECUTES (autonomous loop)
   │
   │   During execution, agent has ACCESS TO:
   │   ├─► Tools: Read, Write, Edit, Bash, WebSearch, etc.
   │   ├─► MCP Servers: Configured integrations
   │   │
   │   └─► Skills (agent DECIDES when to invoke):
   │       • ~/.claude/commands/*.md
   │       • Agent reads skill descriptions and invokes via Skill tool
   │
   ▼
6. COMPLETION
   │
   └─► Learnings extracted → appended to memory files
```

---

## Context Sources Comparison

| Source            | Location                   | Loading            | Purpose                      |
| ----------------- | -------------------------- | ------------------ | ---------------------------- |
| **CLAUDE.md**     | Project root, `~/.claude/` | Always (via SDK)   | Coding conventions, commands |
| **Context files** | `.ask-jenny/context/`      | Always (all files) | Project-specific rules       |
| **Memory files**  | `.ask-jenny/memory/`       | Smart selection    | Relevant learnings           |
| **Skills**        | `~/.claude/commands/`      | Agent-invoked      | How-to workflows             |

---

## Memory Selection Algorithm

Memory files are scored and selected based on task relevance:

### Scoring Formula

```typescript
score = (tagScore + relevantToScore + summaryScore + categoryScore)
        × importance
        × usageScore
```

| Component         | Weight     | What it matches              |
| ----------------- | ---------- | ---------------------------- |
| `categoryScore`   | ×4         | Filename split on `-` or `_` |
| `tagScore`        | ×3         | `tags:` in frontmatter       |
| `relevantToScore` | ×2         | `relevantTo:` in frontmatter |
| `summaryScore`    | ×1         | `summary:` text              |
| `importance`      | multiplier | `importance:` (0.0-1.0)      |
| `usageScore`      | multiplier | How often it helped before   |

### Selection Order

1. **Always include** `gotchas.md` (if exists)
2. **Add high-importance files** (importance ≥ 0.9) until limit
3. **Add top-scoring files** until limit (default: 5 files max)

### Example

```
Task: "Fix authentication bug"

File: authentication-decisions.md
---
tags: [auth, security, login]
relevantTo: [authentication, session, token]
summary: Decisions about auth flow
importance: 0.9
---

categoryScore: "authentication" matches → 4 × 4 = 16
tagScore: "auth", "login" match 2 terms → 2 × 3 = 6
relevantToScore: "authentication" matches → 1 × 2 = 2
summaryScore: "auth" matches → 1 × 1 = 1

baseScore = 16 + 6 + 2 + 1 = 25
finalScore = 25 × 0.9 × usageScore
```

---

## Context vs Memory

|              | **Context** (`.ask-jenny/context/`) | **Memory** (`.ask-jenny/memory/`)            |
| ------------ | ----------------------------------- | -------------------------------------------- |
| **Loading**  | Always loaded (all files)           | Smart selection (up to 5 files max)          |
| **Metadata** | Optional                            | Required (frontmatter with tags, importance) |
| **Purpose**  | Static rules, conventions           | Learnings that _might_ be relevant           |
| **Best for** | "Always follow these rules"         | "This _may_ help depending on the task"      |

### Recommendation

- **Use Context** for rules that should ALWAYS be followed (coding conventions, commands, patterns)
- **Use Memory** for learnings that are conditionally relevant (decisions, gotchas, domain knowledge)

---

## Skills vs Memory

|               | **Skills**                              | **Memory Files**                      |
| ------------- | --------------------------------------- | ------------------------------------- |
| **Scope**     | Global (all projects)                   | Project-specific                      |
| **Selection** | Agent decides based on task description | System scores by tag/keyword matching |
| **Content**   | "Here's _how_ to do X"                  | "Here's what we _learned_ about X"    |
| **Location**  | `~/.claude/commands/`                   | `.ask-jenny/memory/`                  |

### Example

```
Skill (global):
  "When debugging, first reproduce, then isolate, then fix..."

Memory (project-specific):
  "We use Zod for validation, not Yup. Switching caused issues in PR #42."
```

---

## Key Functions

| Function                  | Purpose                              | Location                             |
| ------------------------- | ------------------------------------ | ------------------------------------ |
| `loadContextFiles()`      | Load context + smart-select memory   | `libs/utils/src/context-loader.ts`   |
| `buildClaudeMdOptions()`  | Configure SDK to auto-load CLAUDE.md | `apps/server/src/lib/sdk-options.ts` |
| `createAutoModeOptions()` | Build full SDK options for execution | `apps/server/src/lib/sdk-options.ts` |

---

## SDK Options Structure

The final options passed to Claude Agent SDK:

```typescript
{
  systemPrompt: {
    type: 'preset',
    preset: 'claude_code',      // ← SDK handles CLAUDE.md loading
    append: combinedSystemPrompt // ← Ask Jenny's context + memory
  },
  settingSources: ['user', 'project'],  // ← Where to look for CLAUDE.md
  allowedTools: ['Read', 'Write', 'Edit', 'Bash', ...],
  maxTurns: 1000,
  mcpServers: {...}
}
```

---

## UI Access

Both Context and Memory files can be managed via the Ask Jenny UI:

- **Memory View** - Create, edit, delete memory files
- **Context View** - Create, edit, delete context files, upload images

---

## Related Files

- `specs/implementation-workflow-architecture.md` - Full workflow documentation
- `docs/context-files-pattern.md` - Context file patterns
