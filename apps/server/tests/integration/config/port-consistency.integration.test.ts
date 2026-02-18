import { describe, it, expect, afterEach } from 'vitest';

/**
 * Integration tests for port configuration consistency across the application
 *
 * These tests verify that port constants are correctly exported and usable
 * across different modules, ensuring the single source of truth pattern
 * is properly implemented.
 */
describe('Port Configuration Integration', () => {
  describe('Cross-module consistency', () => {
    it('should have consistent port values between @automaker/types exports', async () => {
      const types = await import('@automaker/types');

      // Verify all port-related exports exist
      expect(types.STATIC_PORT).toBeDefined();
      expect(types.SERVER_PORT).toBeDefined();
      expect(types.RESERVED_PORTS).toBeDefined();

      // Verify values are correct
      expect(types.STATIC_PORT).toBe(7007);
      expect(types.SERVER_PORT).toBe(7008);
    });

    it('should have RESERVED_PORTS match individual port constants', async () => {
      const { STATIC_PORT, SERVER_PORT, RESERVED_PORTS } = await import('@automaker/types');

      // RESERVED_PORTS should contain exactly the two port constants
      expect(RESERVED_PORTS[0]).toBe(STATIC_PORT);
      expect(RESERVED_PORTS[1]).toBe(SERVER_PORT);
      expect(RESERVED_PORTS.length).toBe(2);
    });

    it('should be importable via default package export', async () => {
      // Import the main package which re-exports ports
      const types = await import('@automaker/types');

      // Ports should be accessible from the main export
      expect(typeof types.STATIC_PORT).toBe('number');
      expect(typeof types.SERVER_PORT).toBe('number');
    });
  });

  describe('Port parsing utilities', () => {
    it('should correctly parse PORT environment variable with fallback', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      // Test the pattern used in server/index.ts
      const testCases = [
        { env: undefined, expected: SERVER_PORT },
        { env: '', expected: SERVER_PORT },
        { env: '9000', expected: 9000 },
        { env: '3000', expected: 3000 },
      ];

      for (const { env, expected } of testCases) {
        const result = parseInt(env || String(SERVER_PORT), 10);
        expect(result).toBe(expected);
      }
    });

    it('should support template literal URL construction', async () => {
      const { SERVER_PORT, STATIC_PORT } = await import('@automaker/types');

      // Test the pattern used in http-api-client.ts and vite.config.mts
      const serverUrl = `http://localhost:${SERVER_PORT}`;
      const staticUrl = `http://localhost:${STATIC_PORT}`;

      expect(serverUrl).toBe('http://localhost:7008');
      expect(staticUrl).toBe('http://localhost:7007');
    });
  });

  describe('Port protection scenarios', () => {
    it('should identify reserved ports correctly', async () => {
      const { RESERVED_PORTS, STATIC_PORT, SERVER_PORT } = await import('@automaker/types');

      // Simulate port protection check used by AI agents
      // Use Array.prototype.some for type-safe port checking
      const isPortReserved = (port: number): boolean => {
        return RESERVED_PORTS.some((reservedPort) => reservedPort === port);
      };

      // Automaker ports should be protected
      expect(isPortReserved(STATIC_PORT)).toBe(true);
      expect(isPortReserved(SERVER_PORT)).toBe(true);
      expect(isPortReserved(7007)).toBe(true);
      expect(isPortReserved(7008)).toBe(true);

      // Other ports should not be protected
      expect(isPortReserved(3000)).toBe(false);
      expect(isPortReserved(8080)).toBe(false);
      expect(isPortReserved(5173)).toBe(false);
    });

    it('should allow iteration over reserved ports', async () => {
      const { RESERVED_PORTS } = await import('@automaker/types');

      // Should be iterable
      const ports: number[] = [];
      for (const port of RESERVED_PORTS) {
        ports.push(port);
      }

      expect(ports).toEqual([7007, 7008]);
    });
  });

  describe('Environment variable override pattern', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      // Restore original env
      process.env = { ...originalEnv };
    });

    it('should support PORT override for server', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      // Without override
      expect(parseInt(process.env.PORT || String(SERVER_PORT), 10)).toBe(SERVER_PORT);

      // With override
      process.env.PORT = '9999';
      expect(parseInt(process.env.PORT || String(SERVER_PORT), 10)).toBe(9999);
    });

    it('should support TEST_PORT override for static server', async () => {
      const { STATIC_PORT } = await import('@automaker/types');

      // Without override
      expect(parseInt(process.env.TEST_PORT || String(STATIC_PORT), 10)).toBe(STATIC_PORT);

      // With override
      process.env.TEST_PORT = '8888';
      expect(parseInt(process.env.TEST_PORT || String(STATIC_PORT), 10)).toBe(8888);
    });
  });
});
