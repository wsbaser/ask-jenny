/**
 * @automaker/types
 * Shared type definitions for AutoMaker
 */

// Provider types
export type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
} from './provider';

// Feature types
export type {
  Feature,
  FeatureImagePath,
  FeatureStatus,
  PlanningMode,
} from './feature';

// Session types
export type {
  AgentSession,
  SessionListItem,
  CreateSessionParams,
  UpdateSessionParams,
} from './session';

// Error types
export type {
  ErrorType,
  ErrorInfo,
} from './error';

// Image types
export type {
  ImageData,
  ImageContentBlock,
} from './image';

// Model types and constants
export {
  CLAUDE_MODEL_MAP,
  DEFAULT_MODELS,
  type ModelAlias,
} from './model';
