/**
 * Unit tests for storage-keys.ts module
 *
 * Tests the centralized storage key definitions and type exports
 * for the Ask Jenny project rename feature.
 */

import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEYS,
  SESSION_KEYS,
  EVENT_NAMES,
  LEGACY_STORAGE_KEYS,
  LEGACY_SESSION_KEYS,
  LEGACY_EVENT_NAMES,
  type StorageKey,
  type SessionKey,
  type EventName,
} from '../../lib/storage-keys';

describe('storage-keys.ts', () => {
  describe('STORAGE_KEYS', () => {
    it('should have correct theme key with ask-jenny prefix', () => {
      expect(STORAGE_KEYS.THEME).toBe('ask-jenny:theme');
    });

    it('should have correct font-sans key with ask-jenny prefix', () => {
      expect(STORAGE_KEYS.FONT_SANS).toBe('ask-jenny:font-sans');
    });

    it('should have correct font-mono key with ask-jenny prefix', () => {
      expect(STORAGE_KEYS.FONT_MONO).toBe('ask-jenny:font-mono');
    });

    it('should have correct app storage key with ask-jenny prefix', () => {
      expect(STORAGE_KEYS.APP_STORAGE).toBe('ask-jenny-storage');
    });

    it('should have correct ideation storage key with ask-jenny prefix', () => {
      expect(STORAGE_KEYS.IDEATION_STORAGE).toBe('ask-jenny-ideation-store');
    });

    it('should be a frozen/readonly object', () => {
      // TypeScript enforces readonly, but we verify the keys exist
      const keys = Object.keys(STORAGE_KEYS);
      expect(keys).toContain('THEME');
      expect(keys).toContain('FONT_SANS');
      expect(keys).toContain('FONT_MONO');
      expect(keys).toContain('APP_STORAGE');
      expect(keys).toContain('IDEATION_STORAGE');
      expect(keys.length).toBe(5);
    });
  });

  describe('SESSION_KEYS', () => {
    it('should have correct auto mode key with ask-jenny prefix', () => {
      expect(SESSION_KEYS.AUTO_MODE).toBe('ask-jenny:autoModeRunningByWorktreeKey');
    });

    it('should have correct splash shown key with ask-jenny prefix', () => {
      expect(SESSION_KEYS.SPLASH_SHOWN).toBe('ask-jenny-splash-shown');
    });

    it('should have exactly 2 session keys', () => {
      const keys = Object.keys(SESSION_KEYS);
      expect(keys.length).toBe(2);
    });
  });

  describe('EVENT_NAMES', () => {
    it('should have correct logged-out event name with ask-jenny prefix', () => {
      expect(EVENT_NAMES.LOGGED_OUT).toBe('ask-jenny:logged-out');
    });

    it('should have correct server-offline event name with ask-jenny prefix', () => {
      expect(EVENT_NAMES.SERVER_OFFLINE).toBe('ask-jenny:server-offline');
    });

    it('should have exactly 2 event names', () => {
      const keys = Object.keys(EVENT_NAMES);
      expect(keys.length).toBe(2);
    });
  });

  describe('LEGACY_STORAGE_KEYS', () => {
    it('should have correct legacy theme key with automaker prefix', () => {
      expect(LEGACY_STORAGE_KEYS.THEME).toBe('automaker:theme');
    });

    it('should have correct legacy font-sans key with automaker prefix', () => {
      expect(LEGACY_STORAGE_KEYS.FONT_SANS).toBe('automaker:font-sans');
    });

    it('should have correct legacy font-mono key with automaker prefix', () => {
      expect(LEGACY_STORAGE_KEYS.FONT_MONO).toBe('automaker:font-mono');
    });

    it('should have correct legacy app storage key with automaker prefix', () => {
      expect(LEGACY_STORAGE_KEYS.APP_STORAGE).toBe('automaker-storage');
    });

    it('should have exactly 4 legacy storage keys', () => {
      const keys = Object.keys(LEGACY_STORAGE_KEYS);
      expect(keys.length).toBe(4);
    });
  });

  describe('LEGACY_SESSION_KEYS', () => {
    it('should have correct legacy auto mode key with automaker prefix', () => {
      expect(LEGACY_SESSION_KEYS.AUTO_MODE).toBe('automaker:autoModeRunningByWorktreeKey');
    });

    it('should have correct legacy splash shown key with automaker prefix', () => {
      expect(LEGACY_SESSION_KEYS.SPLASH_SHOWN).toBe('automaker-splash-shown');
    });
  });

  describe('LEGACY_EVENT_NAMES', () => {
    it('should have correct legacy logged-out event name with automaker prefix', () => {
      expect(LEGACY_EVENT_NAMES.LOGGED_OUT).toBe('automaker:logged-out');
    });

    it('should have correct legacy server-offline event name with automaker prefix', () => {
      expect(LEGACY_EVENT_NAMES.SERVER_OFFLINE).toBe('automaker:server-offline');
    });
  });

  describe('Key naming conventions', () => {
    it('should have new keys with ask-jenny prefix', () => {
      // All new keys should start with 'ask-jenny'
      Object.values(STORAGE_KEYS).forEach((key) => {
        expect(key.startsWith('ask-jenny')).toBe(true);
      });
      Object.values(SESSION_KEYS).forEach((key) => {
        expect(key.startsWith('ask-jenny')).toBe(true);
      });
      Object.values(EVENT_NAMES).forEach((key) => {
        expect(key.startsWith('ask-jenny')).toBe(true);
      });
    });

    it('should have legacy keys with automaker prefix', () => {
      // All legacy keys should start with 'automaker'
      Object.values(LEGACY_STORAGE_KEYS).forEach((key) => {
        expect(key.startsWith('automaker')).toBe(true);
      });
      Object.values(LEGACY_SESSION_KEYS).forEach((key) => {
        expect(key.startsWith('automaker')).toBe(true);
      });
      Object.values(LEGACY_EVENT_NAMES).forEach((key) => {
        expect(key.startsWith('automaker')).toBe(true);
      });
    });

    it('should have corresponding keys between new and legacy (for migration)', () => {
      // Verify key pairs exist for migration
      expect(STORAGE_KEYS.THEME).toBeDefined();
      expect(LEGACY_STORAGE_KEYS.THEME).toBeDefined();

      expect(STORAGE_KEYS.FONT_SANS).toBeDefined();
      expect(LEGACY_STORAGE_KEYS.FONT_SANS).toBeDefined();

      expect(STORAGE_KEYS.FONT_MONO).toBeDefined();
      expect(LEGACY_STORAGE_KEYS.FONT_MONO).toBeDefined();

      expect(SESSION_KEYS.AUTO_MODE).toBeDefined();
      expect(LEGACY_SESSION_KEYS.AUTO_MODE).toBeDefined();

      expect(SESSION_KEYS.SPLASH_SHOWN).toBeDefined();
      expect(LEGACY_SESSION_KEYS.SPLASH_SHOWN).toBeDefined();

      expect(EVENT_NAMES.LOGGED_OUT).toBeDefined();
      expect(LEGACY_EVENT_NAMES.LOGGED_OUT).toBeDefined();

      expect(EVENT_NAMES.SERVER_OFFLINE).toBeDefined();
      expect(LEGACY_EVENT_NAMES.SERVER_OFFLINE).toBeDefined();
    });
  });

  describe('Type exports', () => {
    it('should allow StorageKey type assignment', () => {
      // This is a compile-time check - if types are wrong, test won't compile
      const key: StorageKey = STORAGE_KEYS.THEME;
      expect(typeof key).toBe('string');
    });

    it('should allow SessionKey type assignment', () => {
      const key: SessionKey = SESSION_KEYS.AUTO_MODE;
      expect(typeof key).toBe('string');
    });

    it('should allow EventName type assignment', () => {
      const key: EventName = EVENT_NAMES.LOGGED_OUT;
      expect(typeof key).toBe('string');
    });
  });
});
