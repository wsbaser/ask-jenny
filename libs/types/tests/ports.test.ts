import { describe, it, expect } from 'vitest';
import { STATIC_PORT, SERVER_PORT, RESERVED_PORTS } from '../src/ports';

describe('ports.ts', () => {
  describe('STATIC_PORT', () => {
    it('should be a number', () => {
      expect(typeof STATIC_PORT).toBe('number');
    });

    it('should be 7007 for the UI server', () => {
      expect(STATIC_PORT).toBe(7007);
    });

    it('should be a valid port number (1-65535)', () => {
      expect(STATIC_PORT).toBeGreaterThanOrEqual(1);
      expect(STATIC_PORT).toBeLessThanOrEqual(65535);
    });

    it('should be in the non-privileged port range (>= 1024)', () => {
      expect(STATIC_PORT).toBeGreaterThanOrEqual(1024);
    });
  });

  describe('SERVER_PORT', () => {
    it('should be a number', () => {
      expect(typeof SERVER_PORT).toBe('number');
    });

    it('should be 7008 for the API server', () => {
      expect(SERVER_PORT).toBe(7008);
    });

    it('should be a valid port number (1-65535)', () => {
      expect(SERVER_PORT).toBeGreaterThanOrEqual(1);
      expect(SERVER_PORT).toBeLessThanOrEqual(65535);
    });

    it('should be in the non-privileged port range (>= 1024)', () => {
      expect(SERVER_PORT).toBeGreaterThanOrEqual(1024);
    });

    it('should be different from STATIC_PORT', () => {
      expect(SERVER_PORT).not.toBe(STATIC_PORT);
    });

    it('should be exactly one more than STATIC_PORT (consecutive ports)', () => {
      expect(SERVER_PORT).toBe(STATIC_PORT + 1);
    });
  });

  describe('RESERVED_PORTS', () => {
    it('should be an array', () => {
      expect(Array.isArray(RESERVED_PORTS)).toBe(true);
    });

    it('should contain exactly 2 ports', () => {
      expect(RESERVED_PORTS).toHaveLength(2);
    });

    it('should contain STATIC_PORT', () => {
      expect(RESERVED_PORTS).toContain(STATIC_PORT);
    });

    it('should contain SERVER_PORT', () => {
      expect(RESERVED_PORTS).toContain(SERVER_PORT);
    });

    it('should contain ports in the correct order [STATIC_PORT, SERVER_PORT]', () => {
      expect(RESERVED_PORTS[0]).toBe(STATIC_PORT);
      expect(RESERVED_PORTS[1]).toBe(SERVER_PORT);
    });

    it('should be a readonly tuple (immutable)', () => {
      // TypeScript enforces this at compile time with 'as const'
      // At runtime, we verify the values are correct
      const expectedPorts = [7007, 7008];
      expect([...RESERVED_PORTS]).toEqual(expectedPorts);
    });
  });

  describe('port configuration consistency', () => {
    it('should have UI port (STATIC_PORT) less than server port (SERVER_PORT)', () => {
      // UI runs on lower port, server on higher - consistent convention
      expect(STATIC_PORT).toBeLessThan(SERVER_PORT);
    });

    it('should not conflict with common development ports', () => {
      const commonPorts = [
        3000, // Common React dev server
        3001, // Common secondary dev server
        4000, // Common GraphQL
        5000, // Common Flask/Python
        5173, // Vite default
        8000, // Common HTTP server
        8080, // Common HTTP proxy
        9000, // Common app port
      ];

      expect(commonPorts).not.toContain(STATIC_PORT);
      expect(commonPorts).not.toContain(SERVER_PORT);
    });

    it('should be in the 7000-7999 port range', () => {
      // Both ports should be in the same range for consistency
      expect(STATIC_PORT).toBeGreaterThanOrEqual(7000);
      expect(STATIC_PORT).toBeLessThan(8000);
      expect(SERVER_PORT).toBeGreaterThanOrEqual(7000);
      expect(SERVER_PORT).toBeLessThan(8000);
    });
  });
});
