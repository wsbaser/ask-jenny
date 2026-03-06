/**
 * Shared types for AI model providers
 *
 * Re-exports types from @ask-jenny/types for consistency across the codebase.
 * All provider types are defined in @ask-jenny/types to avoid duplication.
 */

// Re-export all provider types from @ask-jenny/types
export type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
} from '@ask-jenny/types';
