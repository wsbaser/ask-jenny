import { useState, useCallback, useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { createLogger } from '@automaker/utils/logger';
import { router } from './utils/router';
import { SplashScreen } from './components/splash-screen';
import { useSettingsSync } from './hooks/use-settings-sync';
import { useCursorStatusInit } from './hooks/use-cursor-status-init';
import { useProviderAuthInit } from './hooks/use-provider-auth-init';
import './styles/global.css';
import './styles/theme-imports';
import './styles/font-imports';

const logger = createLogger('App');

const SPLASH_SESSION_KEY = 'ask-jenny-splash-shown';
const LEGACY_SPLASH_KEY = 'automaker-splash-shown';

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash once per session
    // Check both new and legacy keys for backwards compatibility
    if (sessionStorage.getItem(SPLASH_SESSION_KEY) || sessionStorage.getItem(LEGACY_SPLASH_KEY)) {
      return false;
    }
    return true;
  });

  // Clear accumulated PerformanceMeasure entries to prevent memory leak in dev mode
  // React's internal scheduler creates performance marks/measures that accumulate without cleanup
  useEffect(() => {
    if (import.meta.env.DEV) {
      const clearPerfEntries = () => {
        // Check if window.performance is available before calling its methods
        if (window.performance) {
          window.performance.clearMarks();
          window.performance.clearMeasures();
        }
      };
      const interval = setInterval(clearPerfEntries, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  // Settings are now loaded in __root.tsx after successful session verification
  // This ensures a unified flow: verify session → load settings → redirect
  // We no longer block router rendering here - settings loading happens in __root.tsx

  // Sync settings changes back to server (API-first persistence)
  const settingsSyncState = useSettingsSync();
  if (settingsSyncState.error) {
    logger.error('Settings sync error:', settingsSyncState.error);
  }

  // Initialize Cursor CLI status at startup
  useCursorStatusInit();

  // Initialize Provider auth status at startup (for Claude/Codex usage display)
  useProviderAuthInit();

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
    setShowSplash(false);
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    </>
  );
}
