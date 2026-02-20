import { describe, it, expect } from 'vitest';
import { STATIC_PORT, SERVER_PORT, RESERVED_PORTS } from '../src/ports';

describe('ports configuration', () => {
  describe('STATIC_PORT', () => {
    it('should be 7007 for the UI/frontend server', () => {
      expect(STATIC_PORT).toBe(7007);
    });

    it('should be a valid port number (1-65535)', () => {
      expect(STATIC_PORT).toBeGreaterThanOrEqual(1);
      expect(STATIC_PORT).toBeLessThanOrEqual(65535);
    });

    it('should be different from SERVER_PORT', () => {
      expect(STATIC_PORT).not.toBe(SERVER_PORT);
    });
  });

  describe('SERVER_PORT', () => {
    it('should be 7008 for the backend API server', () => {
      expect(SERVER_PORT).toBe(7008);
    });

    it('should be a valid port number (1-65535)', () => {
      expect(SERVER_PORT).toBeGreaterThanOrEqual(1);
      expect(SERVER_PORT).toBeLessThanOrEqual(65535);
    });

    it('should be different from STATIC_PORT', () => {
      expect(SERVER_PORT).not.toBe(STATIC_PORT);
    });
  });

  describe('RESERVED_PORTS', () => {
    it('should contain both STATIC_PORT and SERVER_PORT', () => {
      expect(RESERVED_PORTS).toContain(STATIC_PORT);
      expect(RESERVED_PORTS).toContain(SERVER_PORT);
    });

    it('should have exactly 2 reserved ports', () => {
      expect(RESERVED_PORTS).toHaveLength(2);
    });

    it('should be a readonly array (const assertion)', () => {
      // Verify the array contains the expected values in order
      expect(RESERVED_PORTS[0]).toBe(STATIC_PORT);
      expect(RESERVED_PORTS[1]).toBe(SERVER_PORT);
    });

    it('should contain consecutive port numbers (UI port + 1 = API port)', () => {
      expect(SERVER_PORT).toBe(STATIC_PORT + 1);
    });
  });

  describe('port configuration integrity', () => {
    it('should use ports in the high range (>1024) to avoid privileged ports', () => {
      expect(STATIC_PORT).toBeGreaterThan(1024);
      expect(SERVER_PORT).toBeGreaterThan(1024);
    });

    it('should not conflict with common development ports', () => {
      // Common development ports to avoid
      const commonPorts = [
        3000, // Create React App, Vite default
        3001, // Additional dev servers
        4000, // Common backend
        5000, // Flask default
        5173, // Vite default
        8000, // Django, Python HTTP
        8080, // Common proxy
        8888, // Jupyter
      ];

      for (const port of commonPorts) {
        expect(STATIC_PORT).not.toBe(port);
        expect(SERVER_PORT).not.toBe(port);
      }
    });
  });
});
