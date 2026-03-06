/**
 * Settings Types - Re-exported from @ask-jenny/types
 *
 * This file now re-exports settings types from the shared @ask-jenny/types package
 * to maintain backward compatibility with existing imports in the server codebase.
 */

export type {
  ThemeMode,
  ModelAlias,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  KeyboardShortcuts,
  ProjectRef,
  TrashedProjectRef,
  ChatSessionRef,
  GlobalSettings,
  Credentials,
  BoardBackgroundSettings,
  WorktreeInfo,
  ProjectSettings,
  PhaseModelConfig,
  PhaseModelKey,
  PhaseModelEntry,
  // Claude-compatible provider types
  ApiKeySource,
  ClaudeCompatibleProviderType,
  ClaudeModelAlias,
  ProviderModel,
  ClaudeCompatibleProvider,
  ClaudeCompatibleProviderTemplate,
  // Legacy profile types (deprecated)
  ClaudeApiProfile,
  ClaudeApiProfileTemplate,
} from '@ask-jenny/types';

export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_PHASE_MODELS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
} from '@ask-jenny/types';
