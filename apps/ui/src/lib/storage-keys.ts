/**
 * Centralized storage key definitions for Ask Jenny
 *
 * This module provides a single source of truth for all localStorage and sessionStorage keys.
 *
 * Key naming conventions:
 * - Keys use 'ask-jenny:' or 'ask-jenny-' prefix
 */

// Theme and font settings (localStorage)
export const STORAGE_KEYS = {
  /** Theme preference (dark, light, system, etc.) */
  THEME: 'ask-jenny:theme',
  /** Sans-serif font family override */
  FONT_SANS: 'ask-jenny:font-sans',
  /** Monospace font family override */
  FONT_MONO: 'ask-jenny:font-mono',
  /** Zustand persist storage for app state */
  APP_STORAGE: 'ask-jenny-storage',
  /** Zustand persist storage for ideation state */
  IDEATION_STORAGE: 'ask-jenny-ideation-store',
} as const;

// Session storage keys
export const SESSION_KEYS = {
  /** Auto mode running state per worktree */
  AUTO_MODE: 'ask-jenny:autoModeRunningByWorktreeKey',
  /** Splash screen shown flag */
  SPLASH_SHOWN: 'ask-jenny-splash-shown',
} as const;

// Custom event names
export const EVENT_NAMES = {
  /** Fired when user session is invalidated */
  LOGGED_OUT: 'ask-jenny:logged-out',
  /** Fired when server connection is lost */
  SERVER_OFFLINE: 'ask-jenny:server-offline',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type SessionKey = (typeof SESSION_KEYS)[keyof typeof SESSION_KEYS];
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];
