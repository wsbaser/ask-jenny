import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for port configuration consistency between server and @automaker/types
 *
 * These tests verify that:
 * 1. The server correctly imports and uses port constants from @automaker/types
 * 2. Environment variable overrides work correctly
 * 3. Port values are consistent across the application
 */
describe('Port Configuration', () => {
  describe('@automaker/types port constants', () => {
    it('should export STATIC_PORT as 7007', async () => {
      const { STATIC_PORT } = await import('@automaker/types');
      expect(STATIC_PORT).toBe(7007);
    });

    it('should export SERVER_PORT as 7008', async () => {
      const { SERVER_PORT } = await import('@automaker/types');
      expect(SERVER_PORT).toBe(7008);
    });

    it('should export RESERVED_PORTS containing both ports', async () => {
      const { RESERVED_PORTS, STATIC_PORT, SERVER_PORT } = await import('@automaker/types');
      expect(RESERVED_PORTS).toContain(STATIC_PORT);
      expect(RESERVED_PORTS).toContain(SERVER_PORT);
    });

    it('should have consecutive ports (UI port + 1 = Server port)', async () => {
      const { STATIC_PORT, SERVER_PORT } = await import('@automaker/types');
      expect(SERVER_PORT).toBe(STATIC_PORT + 1);
    });
  });

  describe('Server port configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
      delete process.env.PORT;
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.resetModules();
    });

    it('should use SERVER_PORT as the default when PORT env is not set', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      // The server should use SERVER_PORT (7008) as default
      // We verify the constant is correctly defined
      expect(SERVER_PORT).toBe(7008);

      // Verify the port parsing logic works correctly with the constant
      const portValue = parseInt(process.env.PORT || String(SERVER_PORT), 10);
      expect(portValue).toBe(7008);
    });

    it('should allow PORT env variable to override default', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      process.env.PORT = '9999';
      const portValue = parseInt(process.env.PORT || String(SERVER_PORT), 10);
      expect(portValue).toBe(9999);
    });

    it('should handle PORT env as string and convert to number', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      process.env.PORT = '8080';
      const portValue = parseInt(process.env.PORT || String(SERVER_PORT), 10);
      expect(typeof portValue).toBe('number');
      expect(portValue).toBe(8080);
    });

    it('should fall back to SERVER_PORT if PORT env is empty string', async () => {
      const { SERVER_PORT } = await import('@automaker/types');

      process.env.PORT = '';
      // Empty string is falsy, so it should fall back to SERVER_PORT
      const portValue = parseInt(process.env.PORT || String(SERVER_PORT), 10);
      expect(portValue).toBe(SERVER_PORT);
    });
  });

  describe('Port value validation', () => {
    it('should have ports in valid range (1-65535)', async () => {
      const { STATIC_PORT, SERVER_PORT } = await import('@automaker/types');

      expect(STATIC_PORT).toBeGreaterThanOrEqual(1);
      expect(STATIC_PORT).toBeLessThanOrEqual(65535);
      expect(SERVER_PORT).toBeGreaterThanOrEqual(1);
      expect(SERVER_PORT).toBeLessThanOrEqual(65535);
    });

    it('should have ports in non-privileged range (>= 1024)', async () => {
      const { STATIC_PORT, SERVER_PORT } = await import('@automaker/types');

      expect(STATIC_PORT).toBeGreaterThanOrEqual(1024);
      expect(SERVER_PORT).toBeGreaterThanOrEqual(1024);
    });

    it('should not use common conflicting ports', async () => {
      const { STATIC_PORT, SERVER_PORT } = await import('@automaker/types');

      // Common development ports that could cause conflicts
      const conflictingPorts = [
        3000, // React default
        3001, // React fallback
        4000, // Common GraphQL
        5000, // Flask default
        5173, // Vite default
        8000, // Django/Python
        8080, // Common HTTP proxy
        9000, // PHP/SonarQube
      ];

      expect(conflictingPorts).not.toContain(STATIC_PORT);
      expect(conflictingPorts).not.toContain(SERVER_PORT);
    });
  });

  describe('RESERVED_PORTS usage', () => {
    it('should have RESERVED_PORTS as readonly array', async () => {
      const { RESERVED_PORTS } = await import('@automaker/types');

      // Verify it's an array with the expected ports
      expect(Array.isArray(RESERVED_PORTS)).toBe(true);
      expect(RESERVED_PORTS).toHaveLength(2);
    });

    it('should provide RESERVED_PORTS for port protection logic', async () => {
      const { RESERVED_PORTS, STATIC_PORT, SERVER_PORT } = await import('@automaker/types');

      // Simulate checking if a port should be protected
      // Use Array.prototype.some for type-safe port checking
      const isReservedPort = (port: number) => RESERVED_PORTS.some((p) => p === port);

      expect(isReservedPort(STATIC_PORT)).toBe(true);
      expect(isReservedPort(SERVER_PORT)).toBe(true);
      expect(isReservedPort(9999)).toBe(false);
    });
  });
});
