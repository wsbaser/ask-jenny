/**
 * Jira Connection Modal
 *
 * Modal dialog for connecting to Jira instances.
 * Supports three authentication methods:
 * - OAuth2 (recommended for Jira Cloud)
 * - Basic Auth (email + API token for Jira Cloud)
 * - Personal Access Token (for Jira Server/Data Center)
 *
 * @accessibility
 * - All form fields have proper labels and error announcements
 * - Keyboard navigation supported (Tab, Enter, Escape)
 * - Focus management on modal open/close
 * - Screen reader announcements for status changes
 */

import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  ExternalLink,
  Link2,
  Key,
  Mail,
  Globe,
  CheckCircle2,
  XCircle,
  RefreshCw,
  LogOut,
  Shield,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { JiraAuthMethod, JiraDeploymentType, JiraConnectionStatus } from '@automaker/types';

const logger = createLogger('JiraConnectionModal');

// API endpoints for Jira connection
const JIRA_API_ENDPOINTS = {
  STATUS: '/api/jira/status',
  OAUTH_AUTH: '/api/jira/auth',
  BASIC_AUTH: '/api/jira/auth/basic',
  PAT_AUTH: '/api/jira/auth/pat',
  CONNECTION: '/api/jira/connection',
} as const;

interface JiraConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectionChange?: (connected: boolean) => void;
}

interface ConnectionStatusResponse {
  success: boolean;
  connected: boolean;
  configured: boolean;
  userDisplayName?: string;
  userAccountId?: string;
  connectionName?: string;
  host?: string;
  tokenExpiresAt?: string;
  tokenExpired?: boolean;
  error?: string;
}

interface BasicAuthFormData {
  host: string;
  email: string;
  apiToken: string;
}

interface PATFormData {
  host: string;
  personalAccessToken: string;
  deploymentType: JiraDeploymentType;
}

type AuthTab = 'oauth' | 'basic' | 'pat';

export function JiraConnectionModal({
  open,
  onOpenChange,
  onConnectionChange,
}: JiraConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>('oauth');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Basic auth form state
  const [basicAuthForm, setBasicAuthForm] = useState<BasicAuthFormData>({
    host: '',
    email: '',
    apiToken: '',
  });
  const [basicAuthErrors, setBasicAuthErrors] = useState<Partial<BasicAuthFormData>>({});

  // PAT form state
  const [patForm, setPATForm] = useState<PATFormData>({
    host: '',
    personalAccessToken: '',
    deploymentType: 'server',
  });
  const [patErrors, setPATErrors] = useState<Partial<PATFormData>>({});

  // Password visibility toggles
  const [showApiToken, setShowApiToken] = useState(false);
  const [showPAT, setShowPAT] = useState(false);

  // Screen reader announcements
  const [announcement, setAnnouncement] = useState<string>('');

  // Check connection status when modal opens
  const checkConnectionStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    setError(null);
    setAnnouncement('Checking Jira connection status...');

    try {
      const response = await fetch(JIRA_API_ENDPOINTS.STATUS, {
        method: 'GET',
        credentials: 'include',
      });

      const data: ConnectionStatusResponse = await response.json();
      setConnectionStatus(data);

      if (data.connected) {
        setAnnouncement(`Connected to Jira as ${data.userDisplayName || 'user'}`);
        onConnectionChange?.(true);
      } else {
        setAnnouncement('Not connected to Jira. Choose a connection method to get started.');
      }
    } catch (err) {
      logger.error('Failed to check Jira connection status:', err);
      setError('Failed to check connection status. Please try again.');
      setAnnouncement('Error checking connection status');
    } finally {
      setIsCheckingStatus(false);
    }
  }, [onConnectionChange]);

  useEffect(() => {
    if (open) {
      checkConnectionStatus();
    }
  }, [open, checkConnectionStatus]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setBasicAuthForm({ host: '', email: '', apiToken: '' });
      setPATForm({ host: '', personalAccessToken: '', deploymentType: 'server' });
      setBasicAuthErrors({});
      setPATErrors({});
      setError(null);
      setShowApiToken(false);
      setShowPAT(false);
      setAnnouncement('');
    }
  }, [open]);

  // Handle OAuth flow
  const handleOAuthConnect = useCallback(() => {
    // Get the current URL to use as return URL
    const returnUrl = window.location.href;

    // Redirect to OAuth endpoint
    window.location.href = `${JIRA_API_ENDPOINTS.OAUTH_AUTH}?returnUrl=${encodeURIComponent(returnUrl)}`;
  }, []);

  // Handle basic auth connection
  const handleBasicAuthConnect = useCallback(async () => {
    // Validate form
    const errors: Partial<BasicAuthFormData> = {};

    if (!basicAuthForm.host.trim()) {
      errors.host = 'Host URL is required';
    } else if (!basicAuthForm.host.startsWith('https://')) {
      errors.host = 'Host URL must start with https://';
    }

    if (!basicAuthForm.email.trim()) {
      errors.email = 'Email is required';
    } else if (!basicAuthForm.email.includes('@')) {
      errors.email = 'Please enter a valid email address';
    }

    if (!basicAuthForm.apiToken.trim()) {
      errors.apiToken = 'API token is required';
    }

    if (Object.keys(errors).length > 0) {
      setBasicAuthErrors(errors);
      return;
    }

    setIsLoading(true);
    setError(null);
    setBasicAuthErrors({});
    setAnnouncement('Connecting to Jira with API token...');

    try {
      const response = await fetch(JIRA_API_ENDPOINTS.BASIC_AUTH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          host: basicAuthForm.host.trim(),
          email: basicAuthForm.email.trim(),
          apiToken: basicAuthForm.apiToken.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAnnouncement('Successfully connected to Jira!');
        await checkConnectionStatus();
        onConnectionChange?.(true);
      } else {
        const errorMessage = data.error || 'Failed to connect with basic authentication';
        setError(errorMessage);
        setAnnouncement(`Connection failed: ${errorMessage}`);
      }
    } catch (err) {
      logger.error('Basic auth connection failed:', err);
      const errorMessage = 'Failed to connect. Please check your credentials and try again.';
      setError(errorMessage);
      setAnnouncement(`Connection failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [basicAuthForm, checkConnectionStatus, onConnectionChange]);

  // Handle PAT connection
  const handlePATConnect = useCallback(async () => {
    // Validate form
    const errors: Partial<PATFormData> = {};

    if (!patForm.host.trim()) {
      errors.host = 'Host URL is required';
    } else if (!patForm.host.startsWith('https://') && !patForm.host.startsWith('http://')) {
      errors.host = 'Host URL must start with http:// or https://';
    }

    if (!patForm.personalAccessToken.trim()) {
      errors.personalAccessToken = 'Personal Access Token is required';
    }

    if (Object.keys(errors).length > 0) {
      setPATErrors(errors);
      return;
    }

    setIsLoading(true);
    setError(null);
    setPATErrors({});
    setAnnouncement('Connecting to Jira with Personal Access Token...');

    try {
      const response = await fetch(JIRA_API_ENDPOINTS.PAT_AUTH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          host: patForm.host.trim(),
          personalAccessToken: patForm.personalAccessToken.trim(),
          deploymentType: patForm.deploymentType,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAnnouncement('Successfully connected to Jira!');
        await checkConnectionStatus();
        onConnectionChange?.(true);
      } else {
        const errorMessage = data.error || 'Failed to connect with Personal Access Token';
        setError(errorMessage);
        setAnnouncement(`Connection failed: ${errorMessage}`);
      }
    } catch (err) {
      logger.error('PAT connection failed:', err);
      const errorMessage = 'Failed to connect. Please check your credentials and try again.';
      setError(errorMessage);
      setAnnouncement(`Connection failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [patForm, checkConnectionStatus, onConnectionChange]);

  // Handle disconnect
  const handleDisconnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAnnouncement('Disconnecting from Jira...');

    try {
      const response = await fetch(JIRA_API_ENDPOINTS.CONNECTION, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus(null);
        setAnnouncement('Successfully disconnected from Jira');
        onConnectionChange?.(false);
      } else {
        const errorMessage = data.error || 'Failed to disconnect';
        setError(errorMessage);
        setAnnouncement(`Disconnect failed: ${errorMessage}`);
      }
    } catch (err) {
      logger.error('Failed to disconnect Jira:', err);
      const errorMessage = 'Failed to disconnect. Please try again.';
      setError(errorMessage);
      setAnnouncement(`Disconnect failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [onConnectionChange]);

  // Render connection status section
  const renderConnectionStatus = () => {
    if (isCheckingStatus) {
      return (
        <div
          className="space-y-4 animate-pulse"
          role="status"
          aria-label="Loading connection status"
        >
          {/* Skeleton for status card */}
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border">
            <div className="w-5 h-5 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-48 rounded bg-muted" />
            </div>
            <div className="w-16 h-6 rounded bg-muted" />
          </div>
          {/* Skeleton for details */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-muted" />
              <div className="h-3 w-40 rounded bg-muted" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-muted" />
              <div className="h-3 w-56 rounded bg-muted" />
            </div>
          </div>
          <span className="sr-only">Checking connection status...</span>
        </div>
      );
    }

    if (connectionStatus?.connected) {
      return (
        <div className="space-y-4" role="region" aria-label="Jira connection status">
          {/* Connected status */}
          <div
            className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="w-5 h-5 text-green-500" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium text-green-500">Connected to Jira</p>
              {connectionStatus.userDisplayName && (
                <p className="text-sm text-muted-foreground">
                  Signed in as {connectionStatus.userDisplayName}
                </p>
              )}
            </div>
            <Badge variant="secondary" className="text-xs" aria-label="Connection active">
              Active
            </Badge>
          </div>

          {/* Connection details */}
          <dl className="space-y-2 text-sm">
            {connectionStatus.connectionName && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="w-4 h-4" aria-hidden="true" />
                <dt className="sr-only">Site name</dt>
                <dd>{connectionStatus.connectionName}</dd>
              </div>
            )}
            {connectionStatus.host && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Link2 className="w-4 h-4" aria-hidden="true" />
                <dt className="sr-only">Host URL</dt>
                <dd className="truncate">{connectionStatus.host}</dd>
              </div>
            )}
            {connectionStatus.tokenExpiresAt && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="w-4 h-4" aria-hidden="true" />
                <dt className="sr-only">Token expiration</dt>
                <dd>
                  Token expires: {new Date(connectionStatus.tokenExpiresAt).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>

          {/* Actions */}
          <div className="flex gap-2 pt-2" role="group" aria-label="Connection actions">
            <Button
              variant="outline"
              size="sm"
              onClick={checkConnectionStatus}
              disabled={isCheckingStatus}
              aria-label={isCheckingStatus ? 'Refreshing connection status' : 'Refresh connection status'}
            >
              <RefreshCw
                className={cn('w-4 h-4 mr-2', isCheckingStatus && 'animate-spin')}
                aria-hidden="true"
              />
              {isCheckingStatus ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isLoading}
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10 focus-visible:ring-red-500/50"
              aria-label={isLoading ? 'Disconnecting from Jira' : 'Disconnect from Jira'}
            >
              <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
              {isLoading ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </div>
        </div>
      );
    }

    // Not connected - show connection options
    return (
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AuthTab)} className="flex-1">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="oauth" className="gap-2">
            <ExternalLink className="w-4 h-4" />
            OAuth
          </TabsTrigger>
          <TabsTrigger value="basic" className="gap-2">
            <Mail className="w-4 h-4" />
            API Token
          </TabsTrigger>
          <TabsTrigger value="pat" className="gap-2">
            <Key className="w-4 h-4" />
            PAT
          </TabsTrigger>
        </TabsList>

        {/* OAuth Tab */}
        <TabsContent value="oauth" className="mt-4 space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <ExternalLink className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">OAuth 2.0</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Recommended for Jira Cloud. Securely connect using your Atlassian account.
                  You'll be redirected to Atlassian to authorize access.
                </p>
              </div>
            </div>
          </div>

          {connectionStatus?.configured === false && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
              <p className="text-sm text-yellow-500">
                OAuth is not configured on this server. Please contact your administrator or use
                API Token authentication.
              </p>
            </div>
          )}

          <Button
            onClick={handleOAuthConnect}
            disabled={isLoading || connectionStatus?.configured === false}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            {isLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Connecting...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                Connect with Atlassian
              </>
            )}
          </Button>
        </TabsContent>

        {/* Basic Auth Tab */}
        <TabsContent value="basic" className="mt-4 space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Mail className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">API Token Authentication</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  For Jira Cloud. Use your email and an API token generated from your Atlassian
                  account settings.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="basic-host"
                className={cn(basicAuthErrors.host && 'text-red-500')}
              >
                Jira Cloud URL
              </Label>
              <Input
                id="basic-host"
                placeholder="https://your-domain.atlassian.net"
                value={basicAuthForm.host}
                onChange={(e) =>
                  setBasicAuthForm((prev) => ({ ...prev, host: e.target.value }))
                }
                className={cn(
                  basicAuthErrors.host &&
                    'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                )}
              />
              {basicAuthErrors.host && (
                <p className="text-xs text-red-500">{basicAuthErrors.host}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="basic-email"
                className={cn(basicAuthErrors.email && 'text-red-500')}
              >
                Email Address
              </Label>
              <Input
                id="basic-email"
                type="email"
                placeholder="you@example.com"
                value={basicAuthForm.email}
                onChange={(e) =>
                  setBasicAuthForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className={cn(
                  basicAuthErrors.email &&
                    'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                )}
              />
              {basicAuthErrors.email && (
                <p className="text-xs text-red-500">{basicAuthErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="basic-token"
                  className={cn(basicAuthErrors.apiToken && 'text-red-500')}
                >
                  API Token
                </Label>
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 focus:outline-none focus:underline"
                  aria-label="Get API token from Atlassian (opens in new tab)"
                >
                  Get token <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
              <div className="relative">
                <Input
                  id="basic-token"
                  type={showApiToken ? 'text' : 'password'}
                  placeholder="Enter your API token"
                  value={basicAuthForm.apiToken}
                  onChange={(e) =>
                    setBasicAuthForm((prev) => ({ ...prev, apiToken: e.target.value }))
                  }
                  className={cn(
                    'pr-10',
                    basicAuthErrors.apiToken &&
                      'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  )}
                  aria-invalid={!!basicAuthErrors.apiToken}
                  aria-describedby={basicAuthErrors.apiToken ? 'basic-token-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowApiToken(!showApiToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={showApiToken ? 'Hide API token' : 'Show API token'}
                >
                  {showApiToken ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {basicAuthErrors.apiToken && (
                <p id="basic-token-error" className="text-xs text-red-500" role="alert">
                  {basicAuthErrors.apiToken}
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={handleBasicAuthConnect}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
          >
            {isLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Connecting...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4 mr-2" />
                Connect with API Token
              </>
            )}
          </Button>
        </TabsContent>

        {/* PAT Tab */}
        <TabsContent value="pat" className="mt-4 space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Key className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">Personal Access Token</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  For Jira Server or Data Center. Generate a PAT from your Jira profile settings.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="pat-host"
                className={cn(patErrors.host && 'text-red-500')}
              >
                Jira Server URL
              </Label>
              <Input
                id="pat-host"
                placeholder="https://jira.your-company.com"
                value={patForm.host}
                onChange={(e) =>
                  setPATForm((prev) => ({ ...prev, host: e.target.value }))
                }
                className={cn(
                  patErrors.host &&
                    'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                )}
              />
              {patErrors.host && (
                <p className="text-xs text-red-500">{patErrors.host}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Deployment Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={patForm.deploymentType === 'server' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() =>
                    setPATForm((prev) => ({ ...prev, deploymentType: 'server' }))
                  }
                  className="flex-1"
                >
                  Server
                </Button>
                <Button
                  type="button"
                  variant={patForm.deploymentType === 'datacenter' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() =>
                    setPATForm((prev) => ({ ...prev, deploymentType: 'datacenter' }))
                  }
                  className="flex-1"
                >
                  Data Center
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="pat-token"
                  className={cn(patErrors.personalAccessToken && 'text-red-500')}
                >
                  Personal Access Token
                </Label>
              </div>
              <div className="relative">
                <Input
                  id="pat-token"
                  type={showPAT ? 'text' : 'password'}
                  placeholder="Enter your Personal Access Token"
                  value={patForm.personalAccessToken}
                  onChange={(e) =>
                    setPATForm((prev) => ({ ...prev, personalAccessToken: e.target.value }))
                  }
                  className={cn(
                    'pr-10',
                    patErrors.personalAccessToken &&
                      'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  )}
                  aria-invalid={!!patErrors.personalAccessToken}
                  aria-describedby={patErrors.personalAccessToken ? 'pat-token-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPAT(!showPAT)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={showPAT ? 'Hide token' : 'Show token'}
                >
                  {showPAT ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {patErrors.personalAccessToken && (
                <p id="pat-token-error" className="text-xs text-red-500" role="alert">
                  {patErrors.personalAccessToken}
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={handlePATConnect}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
          >
            {isLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Connecting...
              </>
            ) : (
              <>
                <Key className="w-4 h-4 mr-2" />
                Connect with PAT
              </>
            )}
          </Button>
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="jira-connection-modal"
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.97 4.35 4.35 4.35V2.65A.65.65 0 0 0 21.35 2h-9.82Z"
                fill="#2684FF"
              />
              <path
                d="M6.77 6.8c0 2.4 1.96 4.35 4.35 4.35h1.78v1.7c0 2.4 1.96 4.35 4.34 4.35V7.45a.65.65 0 0 0-.65-.65H6.77Z"
                fill="url(#jira-gradient-1)"
              />
              <path
                d="M2 11.6c0 2.4 1.96 4.35 4.35 4.35h1.78v1.7c0 2.4 1.96 4.35 4.35 4.35v-9.75a.65.65 0 0 0-.65-.65H2Z"
                fill="url(#jira-gradient-2)"
              />
              <defs>
                <linearGradient
                  id="jira-gradient-1"
                  x1="15.05"
                  y1="6.85"
                  x2="10.17"
                  y2="11.93"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset=".18" stopColor="#0052CC" />
                  <stop offset="1" stopColor="#2684FF" />
                </linearGradient>
                <linearGradient
                  id="jira-gradient-2"
                  x1="10.55"
                  y1="11.68"
                  x2="5.44"
                  y2="16.8"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset=".18" stopColor="#0052CC" />
                  <stop offset="1" stopColor="#2684FF" />
                </linearGradient>
              </defs>
            </svg>
            Jira Connection
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {connectionStatus?.connected
              ? 'Manage your Jira integration settings'
              : 'Connect to your Jira instance to import issues and sync tasks'}
          </DialogDescription>
        </DialogHeader>

        {/* Screen reader announcements */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {announcement}
        </div>

        {/* Error message */}
        {error && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
            role="alert"
            aria-live="assertive"
          >
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-500">Connection Error</p>
              <p className="text-sm text-red-500/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto py-4">{renderConnectionStatus()}</div>

        <DialogFooter className="border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            {connectionStatus?.connected ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
