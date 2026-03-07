# Implementation Workflow Architecture

**Date**: 2026-03-08
**Status**: Draft

---

## Overview

This document describes the end-to-end feature implementation workflow in Ask Jenny - from feature creation to verified completion. It focuses on the agentic prompts, planning modes, and configuration options that control how features are implemented.

The workflow is designed to be autonomous: once a feature is started, the agent executes without user intervention until completion. This document maps the current architecture to help identify opportunities for more control and configurability.

---

## Requirements

### Functional Requirements

1. **Feature Creation**: Users create features with title, description, optional spec, and configuration options (model, planning mode, etc.)
2. **Planning Phase**: Agent generates a structured specification based on the selected planning mode (skip/lite/spec/full)
3. **Plan Approval**: When `requirePlanApproval=true`, user reviews and approves/rejects the generated spec
4. **Task Execution**: Agent implements the feature by executing tasks sequentially from the approved spec
5. **Pipeline Steps**: Optional post-implementation steps (code review, testing) run sequentially
6. **Status Progression**: Feature moves through statuses: pending → in*progress → pipeline*\* → verified/waiting_approval
7. **Event Streaming**: All progress streams to frontend via WebSocket for real-time visibility

### Non-Functional Requirements

1. **Isolation**: Each feature executes in an isolated git worktree to protect the main branch
2. **Concurrency**: Multiple features can execute concurrently (configurable max per worktree)
3. **Context Loading**: Project context files (CLAUDE.md, CODE_QUALITY.md) are automatically loaded
4. **Memory Persistence**: Agent output is saved for resume/continuation capability

---

## Design Decisions

### Planning Mode Selection

**Decision**: Four planning modes control pre-implementation behavior

| Mode   | Behavior                                                | Use Case                                   |
| ------ | ------------------------------------------------------- | ------------------------------------------ |
| `skip` | No planning phase, direct implementation                | Simple, well-defined tasks                 |
| `lite` | Brief outline (goal, approach, files, tasks, risks)     | Quick features with light structure        |
| `spec` | Structured spec with `tasks` block, acceptance criteria | Standard features requiring clear scope    |
| `full` | Comprehensive spec with phases, user stories, risks     | Complex features needing detailed planning |

**Rationale**: Different features need different levels of planning overhead. Simple fixes don't need full specs, while complex features benefit from phased task breakdown.

**Alternatives rejected:**

- Single planning mode for all features - too rigid
- No planning (always skip) - leads to scope creep and rework
- Always full planning - too slow for simple tasks

### Plan Approval Flow

**Decision**: When `requirePlanApproval=true`, agent pauses after generating spec and waits for user approval

**Rationale**: Gives user control to review, modify, or reject the plan before any code changes are made.

**Current Limitation**: Once approved, no further user interaction is possible during implementation.

### Task Execution Format

**Decision**: Spec mode uses a `tasks` code block format that the system can parse:

````
```tasks
- [ ] T001: [Description] | File: [path/to/file]
- [ ] T002: [Description] | File: [path/to/file]
````

```

**Rationale**: Enables progress tracking via `[TASK_START]` and `[TASK_COMPLETE]` markers during implementation.

---

## End-to-End Flow

### Phase 1: Feature Creation

```

User → Board View → Feature Routes → FeatureLoader.create()
↓
.ask-jenny/features/{id}/feature.json

```

**Configuration Options:**
- `planningMode`: skip | lite | spec | full
- `requirePlanApproval`: boolean
- `model`: Model alias or ID
- `thinkingLevel`: none | low | medium | high | ultrathink
- `skipTests`: boolean (auto-verify vs manual review)
- `branchName`: Optional worktree branch

### Phase 2: Auto Mode Activation

```

AutoModeService.startAutoLoopForProject()
↓
Load pending features (status=pending, dependencies satisfied)
↓
Check capacity (running < maxConcurrency)
↓
executeFeature() for each available feature

```

**Capacity Management:**
- Global `maxConcurrency` setting
- Per-worktree limits via `autoModeByWorktree` settings
- Consecutive failure tracking pauses auto mode on API errors

### Phase 3: Planning Phase

```

getPlanningPromptPrefix(feature)
↓
planningMode = 'skip' → return ''
planningMode = 'lite' → DEFAULT_AUTO_MODE_PLANNING_LITE
planningMode = 'spec' → DEFAULT_AUTO_MODE_PLANNING_SPEC
planningMode = 'full' → DEFAULT_AUTO_MODE_PLANNING_FULL
↓
prompt = planningPrefix + featurePrompt

```

**Planning Prompt Structure (Spec Mode):**
1. Problem statement
2. Solution approach
3. Acceptance criteria (GIVEN-WHEN-THEN)
4. Files to modify table
5. Implementation tasks (`tasks` block)
6. Verification approach
7. `[SPEC_GENERATED]` marker for approval flow

### Phase 4: Plan Approval (if required)

```

Agent outputs [SPEC_GENERATED]
↓
Frontend shows approval dialog
↓
User approves → feature.planSpec.status = 'approved'
User rejects → feature.planSpec.status = 'rejected', provide feedback
↓
If approved: continuationPrompt built, execution resumes

```

### Phase 5: Task Execution

```

For each task in spec:
Output: [TASK_START] T###: Description
↓
Implement task (Read, Write, Edit, Bash tools)
↓
Output: [TASK_COMPLETE] T###: Summary

```

**Agent Tool Access:**
- File: Read, Write, Edit, Glob, Grep
- Execution: Bash
- Research: WebSearch, WebFetch
- Optional: Skill, Task (if configured)

### Phase 6: Pipeline Steps

```

PipelineService.getPipelineConfig(projectPath)
↓
For each step in order:
Update status to 'pipeline\_{stepId}'
Execute step with custom instructions
Save output to agent-output.md
↓
All steps complete → move to final status

```

**Pipeline Configuration:**
- Stored in `.ask-jenny/pipeline.json`
- Each step has: id, name, instructions, order
- Steps run sequentially, not in parallel

### Phase 7: Completion

```

Determine final status:
skipTests = true → 'waiting_approval' (manual review needed)
skipTests = false → 'verified' (auto-verified)
↓
Update feature status
↓
Record learnings to memory
↓
Emit 'auto_mode_feature_complete' event

```

---

## Configuration Points

### Feature-Level Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `planningMode` | string | 'skip' | Pre-implementation planning level |
| `requirePlanApproval` | boolean | false | Pause for user approval after spec generation |
| `model` | string | null | Model alias or ID (null = use default) |
| `thinkingLevel` | string | null | Extended thinking level for Claude |
| `skipTests` | boolean | false | Skip automated verification |
| `branchName` | string | null | Git branch for worktree isolation |
| `dependencies` | string[] | [] | Feature IDs that must complete first |

### Global Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `maxConcurrency` | number | 3 | Max concurrent features per worktree |
| `autoLoadClaudeMd` | boolean | true | Auto-load CLAUDE.md via SDK |
| `phaseModels` | object | {} | Model overrides for planning/implementation phases |

### Prompt Customization

All prompts can be customized via settings:
- `autoMode.planningLite` - Lite mode planning prompt
- `autoMode.planningSpec` - Spec mode planning prompt
- `autoMode.planningFull` - Full mode planning prompt
- `taskExecution.implementationInstructions` - Task execution guidance
- `taskExecution.playwrightVerificationInstructions` - E2E testing guidance

---

## Event System

### Feature Events

| Event | When | Payload |
|-------|------|---------|
| `feature:created` | Feature created | featureId, projectPath |
| `feature:started` | Execution begins | featureId, branchName |
| `feature:progress` | Output streaming | featureId, content |
| `feature:tool-use` | Agent uses tool | featureId, tool name/input |
| `feature:completed` | Execution finished | featureId, passes, message |
| `feature:error` | Execution failed | featureId, error, errorType |

### Auto Mode Events

| Event | When | Payload |
|-------|------|---------|
| `auto-mode:started` | Loop started | projectPath, maxConcurrency |
| `auto-mode:idle` | No pending features | projectPath, branchName |
| `auto-mode:stopped` | Loop stopped | projectPath |
| `auto-mode:error` | Loop error | projectPath, error, errorType |

### Planning Events

| Event | When | Payload |
|-------|------|---------|
| `planning_started` | Planning phase begins | featureId, mode |
| `spec_generated` | Spec ready for review | featureId, specContent |
| `spec_approved` | User approved spec | featureId |
| `spec_rejected` | User rejected spec | featureId, feedback |

---

## Key Files

### Server Services

| File | Purpose |
|------|---------|
| `apps/server/src/services/auto-mode-service.ts` | Main execution loop, planning, task execution |
| `apps/server/src/services/feature-loader.ts` | Feature CRUD operations |
| `apps/server/src/services/pipeline-service.ts` | Pipeline step management |
| `apps/server/src/services/agent-service.ts` | Chat sessions, prompt queue |

### Prompts

| File | Purpose |
|------|---------|
| `libs/prompts/src/defaults.ts` | All default prompt templates |
| `libs/prompts/src/enhancement.ts` | Feature description enhancement |
| `libs/prompts/src/enhancement-modes/*.ts` | Enhancement mode prompts |

### Types

| File | Purpose |
|------|---------|
| `libs/types/src/feature.ts` | Feature type definition |
| `libs/types/src/settings.ts` | PlanningMode, ThinkingLevel types |
| `libs/types/src/event.ts` | Event types |

---

## Current Limitations

### 1. No Mid-Execution Control

Once implementation starts, there's no mechanism to:
- Pause and ask clarifying questions
- Adjust approach based on partial results
- Guide the agent around unexpected obstacles
- Provide feedback on work-in-progress

**Impact**: User can only react after completion, leading to rework cycles.

### 2. Spec-Task Disconnect

The spec tasks are generated once and executed linearly:
- No adaptation if initial assumptions prove wrong
- No way to reprioritize mid-execution
- Tasks can't be split or merged dynamically

### 3. Limited Visibility

While events stream to the frontend:
- No way to inspect worktree state during execution
- Tool outputs are captured but not easily queryable
- Hard to debug why agent made certain decisions

### 4. Context Quality Dependency

Results depend heavily on context quality:
- CLAUDE.md must be comprehensive and up-to-date
- No automated validation that agent follows patterns
- Learning extraction exists but may not capture all conventions

---

## Acceptance Criteria

- [ ] Documentation accurately describes current implementation workflow
- [ ] All four planning modes are documented with use cases
- [ ] Event system is mapped with all event types
- [ ] Configuration options are listed with defaults
- [ ] Key files are identified with their purposes
- [ ] Current limitations are clearly stated

---

## Open Questions

1. **Interview Phase**: How should an interview phase be integrated before implementation? Should it be a separate workflow step or integrated into planning?

2. **Checkpoint System**: Should there be execution checkpoints where agent pauses for user input?

3. **Multi-Agent Coordination**: How should multiple specialized agents coordinate on complex features?

4. **Rollback Strategy**: When implementation goes wrong, what's the best way to roll back and restart?
```
