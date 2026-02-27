/**
 * Unit tests for theme and font storage key constants in app-store.ts
 *
 * Tests that the storage key constants have the correct values for the
 * Ask Jenny project rename. The actual getStoredTheme, getStoredFontSans,
 * and getStoredFontMono functions are tested implicitly through integration
 * tests and E2E tests since they require proper localStorage mocking.
 */

import { describe, it, expect } from 'vitest';
import {
  THEME_STORAGE_KEY,
  FONT_SANS_STORAGE_KEY,
  FONT_MONO_STORAGE_KEY,
} from '../../store/app-store';

describe('app-store storage key constants', () => {
  describe('Storage key values', () => {
    it('should export correct theme storage key with ask-jenny prefix', () => {
      expect(THEME_STORAGE_KEY).toBe('ask-jenny:theme');
    });

    it('should export correct font-sans storage key with ask-jenny prefix', () => {
      expect(FONT_SANS_STORAGE_KEY).toBe('ask-jenny:font-sans');
    });

    it('should export correct font-mono storage key with ask-jenny prefix', () => {
      expect(FONT_MONO_STORAGE_KEY).toBe('ask-jenny:font-mono');
    });
  });

  describe('Key naming conventions', () => {
    it('all storage keys should use ask-jenny prefix', () => {
      expect(THEME_STORAGE_KEY).toMatch(/^ask-jenny:/);
      expect(FONT_SANS_STORAGE_KEY).toMatch(/^ask-jenny:/);
      expect(FONT_MONO_STORAGE_KEY).toMatch(/^ask-jenny:/);
    });

    it('should not use the old automaker prefix', () => {
      expect(THEME_STORAGE_KEY).not.toMatch(/^automaker:/);
      expect(FONT_SANS_STORAGE_KEY).not.toMatch(/^automaker:/);
      expect(FONT_MONO_STORAGE_KEY).not.toMatch(/^automaker:/);
    });

    it('keys should use colon separator convention', () => {
      expect(THEME_STORAGE_KEY).toContain(':');
      expect(FONT_SANS_STORAGE_KEY).toContain(':');
      expect(FONT_MONO_STORAGE_KEY).toContain(':');
    });
  });

  describe('Key uniqueness', () => {
    it('all storage keys should be unique', () => {
      const keys = [THEME_STORAGE_KEY, FONT_SANS_STORAGE_KEY, FONT_MONO_STORAGE_KEY];
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });
});
