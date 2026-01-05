import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { CodexCliStatus } from '../cli-status/codex-cli-status';
import { CodexSettings } from '../codex/codex-settings';
import { CodexUsageSection } from '../codex/codex-usage-section';
import { Info } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('CodexSettings');

export function CodexSettingsTab() {
  const {
    codexAutoLoadAgents,
    setCodexAutoLoadAgents,
    codexSandboxMode,
    setCodexSandboxMode,
    codexApprovalPolicy,
    setCodexApprovalPolicy,
  } = useAppStore();
  const { codexAuthStatus, codexCliStatus, setCodexCliStatus, setCodexAuthStatus } =
    useSetupStore();

  const [isCheckingCodexCli, setIsCheckingCodexCli] = useState(false);

  const handleRefreshCodexCli = useCallback(async () => {
    setIsCheckingCodexCli(true);
    try {
      const api = getElectronAPI();
      if (api?.setup?.getCodexStatus) {
        const result = await api.setup.getCodexStatus();
        if (result.success) {
          setCodexCliStatus({
            installed: result.installed,
            version: result.version,
            path: result.path,
            method: result.method,
          });
          if (result.auth) {
            setCodexAuthStatus({
              authenticated: result.auth.authenticated,
              method: result.auth.method,
              hasAuthFile: result.auth.hasAuthFile,
              hasOAuthToken: result.auth.hasOAuthToken,
              hasApiKey: result.auth.hasApiKey,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to refresh Codex CLI status:', error);
    } finally {
      setIsCheckingCodexCli(false);
    }
  }, [setCodexCliStatus, setCodexAuthStatus]);

  // Show usage tracking when CLI is authenticated
  const showUsageTracking = codexAuthStatus?.authenticated ?? false;

  return (
    <div className="space-y-6">
      {/* Usage Info */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-sm text-emerald-400/90">
          <span className="font-medium">OpenAI via Codex CLI</span>
          <p className="text-xs text-emerald-400/70 mt-1">
            Access GPT models with tool support for advanced coding workflows.
          </p>
        </div>
      </div>

      <CodexCliStatus
        status={codexCliStatus}
        isChecking={isCheckingCodexCli}
        onRefresh={handleRefreshCodexCli}
      />
      <CodexSettings
        autoLoadCodexAgents={codexAutoLoadAgents}
        codexSandboxMode={codexSandboxMode}
        codexApprovalPolicy={codexApprovalPolicy}
        onAutoLoadCodexAgentsChange={setCodexAutoLoadAgents}
        onCodexSandboxModeChange={setCodexSandboxMode}
        onCodexApprovalPolicyChange={setCodexApprovalPolicy}
      />
      {showUsageTracking && <CodexUsageSection />}
    </div>
  );
}

export default CodexSettingsTab;
