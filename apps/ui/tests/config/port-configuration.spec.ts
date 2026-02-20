/**
 * Port Configuration Consistency Tests
 *
 * These tests verify that port configuration is consistent across the application.
 * They ensure that the centralized port constants from @automaker/types are used
 * correctly throughout the codebase.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { SERVER_PORT, STATIC_PORT, RESERVED_PORTS } from '@automaker/types';

// Root project directory
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

test.describe('Port Configuration - Constants Validation', () => {
  test('STATIC_PORT should be 7007', () => {
    expect(STATIC_PORT).toBe(7007);
  });

  test('SERVER_PORT should be 7008', () => {
    expect(SERVER_PORT).toBe(7008);
  });

  test('RESERVED_PORTS should contain both ports', () => {
    expect(RESERVED_PORTS).toContain(STATIC_PORT);
    expect(RESERVED_PORTS).toContain(SERVER_PORT);
    expect(RESERVED_PORTS.length).toBe(2);
  });

  test('ports should be sequential (STATIC_PORT + 1 = SERVER_PORT)', () => {
    expect(SERVER_PORT).toBe(STATIC_PORT + 1);
  });

  test('ports should be in non-privileged range (>1024)', () => {
    expect(STATIC_PORT).toBeGreaterThan(1024);
    expect(SERVER_PORT).toBeGreaterThan(1024);
  });

  test('ports should not conflict with common development ports', () => {
    const commonPorts = [3000, 3001, 4000, 5000, 5173, 8000, 8080, 8888];
    for (const port of commonPorts) {
      expect(STATIC_PORT).not.toBe(port);
      expect(SERVER_PORT).not.toBe(port);
    }
  });
});

test.describe('Port Configuration - File Consistency', () => {
  test('libs/types/src/ports.ts should export correct values', async () => {
    const portsPath = path.join(PROJECT_ROOT, 'libs/types/src/ports.ts');
    const content = fs.readFileSync(portsPath, 'utf-8');

    // Verify STATIC_PORT is defined with value 7007
    expect(content).toContain('STATIC_PORT = 7007');

    // Verify SERVER_PORT is defined with value 7008
    expect(content).toContain('SERVER_PORT = 7008');

    // Verify RESERVED_PORTS is exported
    expect(content).toContain('RESERVED_PORTS');
  });

  test('.env.example should use correct ports', async () => {
    const envPath = path.join(PROJECT_ROOT, 'apps/server/.env.example');
    const content = fs.readFileSync(envPath, 'utf-8');

    // Verify PORT is set to SERVER_PORT value
    expect(content).toContain(`PORT=${SERVER_PORT}`);

    // Verify CORS_ORIGIN uses STATIC_PORT value
    expect(content).toContain(`localhost:${STATIC_PORT}`);
  });

  test('docker-compose.yml should use correct port mappings', async () => {
    const dockerPath = path.join(PROJECT_ROOT, 'docker-compose.yml');
    const content = fs.readFileSync(dockerPath, 'utf-8');

    // Verify UI port mapping
    expect(content).toContain(`${STATIC_PORT}:80`);

    // Verify server port mapping
    expect(content).toContain(`${SERVER_PORT}:${SERVER_PORT}`);
  });

  test('Dockerfile should use correct port configuration', async () => {
    const dockerfilePath = path.join(PROJECT_ROOT, 'Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf-8');

    // Verify PORT environment variable
    expect(content).toContain(`PORT=${SERVER_PORT}`);

    // Verify EXPOSE directive
    expect(content).toContain(`EXPOSE ${SERVER_PORT}`);
  });

  test('playwright.config.ts should use correct port defaults', async () => {
    const playwrightPath = path.join(PROJECT_ROOT, 'apps/ui/playwright.config.ts');
    const content = fs.readFileSync(playwrightPath, 'utf-8');

    // Verify UI port default
    expect(content).toContain(`${STATIC_PORT}`);

    // Verify server port default
    expect(content).toContain(`${SERVER_PORT}`);
  });
});

test.describe('Port Configuration - API Base URL', () => {
  test('API_BASE_URL in test constants should use SERVER_PORT', async () => {
    const constantsPath = path.join(PROJECT_ROOT, 'apps/ui/tests/utils/core/constants.ts');
    const content = fs.readFileSync(constantsPath, 'utf-8');

    // Verify it imports from @automaker/types
    expect(content).toContain("import { SERVER_PORT, STATIC_PORT } from '@automaker/types'");

    // Verify API_BASE_URL uses SERVER_PORT
    expect(content).toContain('${SERVER_PORT}');
  });

  test('http-api-client.ts should use SERVER_PORT constant', async () => {
    const clientPath = path.join(PROJECT_ROOT, 'apps/ui/src/lib/http-api-client.ts');
    const content = fs.readFileSync(clientPath, 'utf-8');

    // Verify it imports SERVER_PORT
    expect(content).toContain("import { SERVER_PORT } from '@automaker/types'");

    // Verify it uses the constant (not hardcoded)
    expect(content).toContain('${SERVER_PORT}');
  });
});

test.describe('Port Configuration - Documentation', () => {
  test('README.md should reference correct ports', async () => {
    const readmePath = path.join(PROJECT_ROOT, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf-8');

    // Verify UI port is documented
    expect(content).toContain(`localhost:${STATIC_PORT}`);

    // Verify server port is documented
    expect(content).toContain(`localhost:${SERVER_PORT}`);
  });

  test('CLAUDE.md should reference correct ports', async () => {
    const claudePath = path.join(PROJECT_ROOT, 'CLAUDE.md');
    const content = fs.readFileSync(claudePath, 'utf-8');

    // Verify UI port is documented
    expect(content).toContain(`${STATIC_PORT}`);

    // Verify server port default is documented
    expect(content).toContain(`${SERVER_PORT}`);
  });
});
