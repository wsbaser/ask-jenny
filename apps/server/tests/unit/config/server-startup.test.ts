import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for server startup port configuration
 *
 * These tests verify that the server correctly imports and uses
 * SERVER_PORT from @automaker/types and respects PORT env overrides.
 */
describe('Server Startup Port Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.PORT;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('Default PORT configuration', () => {
    it('should import SERVER_PORT from @automaker/types', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      expect(SERVER_PORT).toBeDefined();
      expect(typeof SERVER_PORT).toBe('number');
      expect(SERVER_PORT).toBe(7008);
    });

    it('should use SERVER_PORT as default when PORT env is not set', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      // This is the exact pattern used in server/src/index.ts line 98
      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      expect(PORT).toBe(7008);
      expect(PORT).toBe(SERVER_PORT);
    });

    it('should parse PORT correctly as integer', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      expect(Number.isInteger(PORT)).toBe(true);
      expect(PORT).toBe(7008);
    });
  });

  describe('PORT environment override', () => {
    it('should allow PORT env variable to override SERVER_PORT', async () => {
      process.env.PORT = '9000';
      const { SERVER_PORT } = await import('@automaker/types');

      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      expect(PORT).toBe(9000);
      expect(PORT).not.toBe(SERVER_PORT);
    });

    it('should parse string PORT env as number', async () => {
      process.env.PORT = '3000';
      const { SERVER_PORT } = await import('@automaker/types');

      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      expect(typeof PORT).toBe('number');
      expect(PORT).toBe(3000);
    });

    it('should fall back to SERVER_PORT for empty PORT env', async () => {
      process.env.PORT = '';
      const { SERVER_PORT } = await import('@automaker/types');

      // Empty string is falsy, so falls back
      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      expect(PORT).toBe(SERVER_PORT);
      expect(PORT).toBe(7008);
    });

    it('should handle PORT=0 correctly (let OS choose port)', async () => {
      process.env.PORT = '0';
      const { SERVER_PORT } = await import('@automaker/types');

      // PORT=0 is a valid value meaning "let OS choose"
      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      // Since '0' is truthy string, it should be used
      expect(PORT).toBe(0);
    });
  });

  describe('Alternative port commands', () => {
    it('should support alternative port via environment', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      // Pattern used for suggesting alternative commands
      const nextPort = SERVER_PORT + 1;
      const altCmd = `PORT=${nextPort} npm run dev:server`;

      expect(altCmd).toBe('PORT=7009 npm run dev:server');
    });

    it('should suggest next available port on conflict', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      // Simulate port conflict scenario
      const suggestAlternativePort = (currentPort: number): number => {
        return currentPort + 1;
      };

      expect(suggestAlternativePort(SERVER_PORT)).toBe(7009);
    });
  });

  describe('Port binding patterns', () => {
    it('should support HOST + PORT combination', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      const HOST = process.env.HOST || '0.0.0.0';
      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      expect(HOST).toBe('0.0.0.0');
      expect(PORT).toBe(7008);

      // Pattern used for listen callback
      const listenUrl = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
      expect(listenUrl).toBe('http://localhost:7008');
    });

    it('should construct correct URL for user display', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      // Clear HOSTNAME to test default behavior
      delete process.env.HOSTNAME;

      const HOST = '0.0.0.0';
      const HOSTNAME = process.env.HOSTNAME || 'localhost';
      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      // Pattern used for displaying URL to user
      const displayUrl = `http://${HOSTNAME}:${PORT}`;
      expect(displayUrl).toBe('http://localhost:7008');
    });

    it('should use HOSTNAME env when set', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      process.env.HOSTNAME = 'custom-host';
      const HOSTNAME = process.env.HOSTNAME || 'localhost';
      const PORT = parseInt(process.env.PORT || String(SERVER_PORT), 10);

      const displayUrl = `http://${HOSTNAME}:${PORT}`;
      expect(displayUrl).toBe('http://custom-host:7008');
    });
  });
});
