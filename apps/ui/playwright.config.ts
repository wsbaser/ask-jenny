import { defineConfig, devices } from '@playwright/test';
import { STATIC_PORT, SERVER_PORT } from '@automaker/types';

/** UI port - uses STATIC_PORT constant as default, can be overridden via TEST_PORT env var */
const port = process.env.TEST_PORT || STATIC_PORT;
/** API server port - uses SERVER_PORT constant as default, can be overridden via TEST_SERVER_PORT env var */
const serverPort = process.env.TEST_SERVER_PORT || SERVER_PORT;
const reuseServer = process.env.TEST_REUSE_SERVER === 'true';
const useExternalBackend = !!process.env.VITE_SERVER_URL;
// Always use mock agent for tests (disables rate limiting, uses mock Claude responses)
const mockAgent = true;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Run sequentially to avoid auth conflicts with shared server
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-failure',
    screenshot: 'only-on-failure',
  },
  // Global setup - authenticate before each test
  globalSetup: require.resolve('./tests/global-setup.ts'),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(reuseServer
    ? {}
    : {
        webServer: [
          // Backend server - runs with mock agent enabled in CI
          // Uses dev:test (no file watching) to avoid port conflicts from server restarts
          ...(useExternalBackend
            ? []
            : [
                {
                  command: `cd ../server && npm run dev:test`,
                  url: `http://localhost:${serverPort}/api/health`,
                  // Don't reuse existing server to ensure we use the test API key
                  reuseExistingServer: false,
                  timeout: 60000,
                  env: {
                    ...process.env,
                    PORT: String(serverPort),
                    // Enable mock agent in CI to avoid real API calls
                    AUTOMAKER_MOCK_AGENT: mockAgent ? 'true' : 'false',
                    // Set a test API key for web mode authentication
                    AUTOMAKER_API_KEY:
                      process.env.AUTOMAKER_API_KEY || 'test-api-key-for-e2e-tests',
                    // Hide the API key banner to reduce log noise
                    AUTOMAKER_HIDE_API_KEY: 'true',
                    // Explicitly unset ALLOWED_ROOT_DIRECTORY to allow all paths for testing
                    // (prevents inheriting /projects from Docker or other environments)
                    ALLOWED_ROOT_DIRECTORY: '',
                    // Simulate containerized environment to skip sandbox confirmation dialogs
                    IS_CONTAINERIZED: 'true',
                  },
                },
              ]),
          // Frontend Vite dev server
          {
            command: `npm run dev`,
            url: `http://localhost:${port}`,
            reuseExistingServer: false,
            timeout: 120000,
            env: {
              ...process.env,
              VITE_SKIP_SETUP: 'true',
              // Always skip electron plugin during tests - prevents duplicate server spawning
              VITE_SKIP_ELECTRON: 'true',
            },
          },
        ],
      }),
});
