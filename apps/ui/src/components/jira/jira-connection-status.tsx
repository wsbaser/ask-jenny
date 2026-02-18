/**
 * Jira Connection Status Component
 *
 * A compact status indicator showing the current Jira connection state.
 * Can be used in headers, sidebars, or settings panels to provide
 * quick visibility into Jira integration status.
 */

import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Link2,
  Settings,
} from 'lucide-react';

const logger = createLogger('JiraConnectionStatus');

/**
 * Connection status response from the API
 */
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

/**
 * Visual variant for the status display
 */
type StatusVariant = 'badge' | 'indicator' | 'full';

/**
 * Size options for the component
 */
type StatusSize = 'sm' | 'md' | 'lg';

export interface JiraConnectionStatusProps {
  /** Visual variant - badge shows text, indicator is just a dot, full shows detailed info */
  variant?: StatusVariant;
  /** Size of the component */
  size?: StatusSize;
  /** Whether to show a refresh button */
  showRefresh?: boolean;
  /** Whether to show settings/config button */
  showSettings?: boolean;
  /** Callback when settings button is clicked */
  onSettingsClick?: () => void;
  /** Callback when connection status changes */
  onStatusChange?: (connected: boolean) => void;
  /** Auto-refresh interval in milliseconds (0 to disable) */
  autoRefreshInterval?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Jira icon SVG component
 */
function JiraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
        fill="url(#jira-gradient-status-1)"
      />
      <path
        d="M2 11.6c0 2.4 1.96 4.35 4.35 4.35h1.78v1.7c0 2.4 1.96 4.35 4.35 4.35v-9.75a.65.65 0 0 0-.65-.65H2Z"
        fill="url(#jira-gradient-status-2)"
      />
      <defs>
        <linearGradient
          id="jira-gradient-status-1"
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
          id="jira-gradient-status-2"
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
  );
}

/**
 * JiraConnectionStatus Component
 *
 * Displays the current Jira connection status in various visual formats.
 * Automatically fetches and caches the connection status.
 */
export function JiraConnectionStatus({
  variant = 'badge',
  size = 'md',
  showRefresh = false,
  showSettings = false,
  onSettingsClick,
  onStatusChange,
  autoRefreshInterval = 0,
  className,
}: JiraConnectionStatusProps) {
  const [status, setStatus] = useState<ConnectionStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Size-based styling
  const sizeClasses = {
    sm: {
      icon: 'w-3 h-3',
      text: 'text-xs',
      badge: 'px-2 py-0.5',
      button: 'h-6 w-6',
      dot: 'w-2 h-2',
    },
    md: {
      icon: 'w-4 h-4',
      text: 'text-sm',
      badge: 'px-2.5 py-1',
      button: 'h-7 w-7',
      dot: 'w-2.5 h-2.5',
    },
    lg: {
      icon: 'w-5 h-5',
      text: 'text-base',
      badge: 'px-3 py-1.5',
      button: 'h-8 w-8',
      dot: 'w-3 h-3',
    },
  };

  const sizes = sizeClasses[size];

  // Fetch connection status
  const fetchStatus = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch('/api/jira/status', {
        method: 'GET',
        credentials: 'include',
      });

      const data: ConnectionStatusResponse = await response.json();
      setStatus(data);

      return data.connected;
    } catch (err) {
      logger.error('Failed to fetch Jira connection status:', err);
      setStatus({
        success: false,
        connected: false,
        configured: false,
        error: 'Failed to check connection',
      });
      return false;
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus().then((connected) => {
      onStatusChange?.(connected);
    });
  }, [fetchStatus, onStatusChange]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefreshInterval > 0) {
      const interval = setInterval(() => {
        fetchStatus().then((connected) => {
          onStatusChange?.(connected);
        });
      }, autoRefreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefreshInterval, fetchStatus, onStatusChange]);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    fetchStatus(true).then((connected) => {
      onStatusChange?.(connected);
    });
  }, [fetchStatus, onStatusChange]);

  // Determine status state
  const getStatusState = () => {
    if (isLoading) return 'loading';
    if (!status?.success) return 'error';
    if (status.tokenExpired) return 'expired';
    if (status.connected) return 'connected';
    return 'disconnected';
  };

  const statusState = getStatusState();

  // Status configurations
  const statusConfig = {
    loading: {
      icon: null,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50',
      borderColor: 'border-border',
      dotColor: 'bg-muted-foreground',
      label: 'Checking...',
      badgeVariant: 'muted' as const,
    },
    connected: {
      icon: CheckCircle2,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      dotColor: 'bg-green-500',
      label: 'Connected',
      badgeVariant: 'success' as const,
    },
    disconnected: {
      icon: XCircle,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50',
      borderColor: 'border-border',
      dotColor: 'bg-muted-foreground',
      label: 'Not connected',
      badgeVariant: 'muted' as const,
    },
    expired: {
      icon: AlertCircle,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
      dotColor: 'bg-yellow-500',
      label: 'Token expired',
      badgeVariant: 'warning' as const,
    },
    error: {
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      dotColor: 'bg-red-500',
      label: 'Error',
      badgeVariant: 'error' as const,
    },
  };

  const config = statusConfig[statusState];
  const StatusIcon = config.icon;

  // Tooltip content
  const tooltipContent = (
    <div className="space-y-1">
      <div className="font-medium flex items-center gap-2">
        <JiraIcon className="w-4 h-4" />
        Jira {config.label}
      </div>
      {status?.connected && (
        <>
          {status.userDisplayName && (
            <div className="text-muted-foreground">
              Signed in as {status.userDisplayName}
            </div>
          )}
          {status.host && (
            <div className="text-muted-foreground flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              {status.host}
            </div>
          )}
          {status.tokenExpiresAt && (
            <div className="text-muted-foreground">
              Expires: {new Date(status.tokenExpiresAt).toLocaleDateString()}
            </div>
          )}
        </>
      )}
      {status?.error && (
        <div className="text-red-400">{status.error}</div>
      )}
    </div>
  );

  // Render indicator variant (just a dot)
  if (variant === 'indicator') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'relative inline-flex items-center justify-center',
              className
            )}
          >
            {isLoading ? (
              <Spinner size="xs" />
            ) : (
              <span
                className={cn(
                  'rounded-full',
                  sizes.dot,
                  config.dotColor,
                  statusState === 'connected' && 'animate-pulse'
                )}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Render badge variant
  if (variant === 'badge') {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={config.badgeVariant}
              className={cn(
                'cursor-default gap-1.5',
                sizes.badge,
                sizes.text
              )}
            >
              {isLoading ? (
                <Spinner size="xs" />
              ) : (
                <>
                  <JiraIcon className={sizes.icon} />
                  {config.label}
                </>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>

        {showRefresh && !isLoading && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn('rounded-full', sizes.button)}
          >
            <RefreshCw
              className={cn(
                sizes.icon,
                isRefreshing && 'animate-spin'
              )}
            />
          </Button>
        )}

        {showSettings && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettingsClick}
            className={cn('rounded-full', sizes.button)}
          >
            <Settings className={sizes.icon} />
          </Button>
        )}
      </div>
    );
  }

  // Render full variant (detailed display)
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      {/* Status icon */}
      <div className="flex-shrink-0">
        {isLoading ? (
          <Spinner size={size === 'sm' ? 'sm' : 'md'} />
        ) : StatusIcon ? (
          <StatusIcon className={cn(sizes.icon, config.color)} />
        ) : null}
      </div>

      {/* Status info */}
      <div className="flex-1 min-w-0">
        <div className={cn('font-medium flex items-center gap-2', sizes.text)}>
          <JiraIcon className={sizes.icon} />
          <span className={config.color}>{config.label}</span>
        </div>
        {status?.connected && status.userDisplayName && (
          <p className={cn('text-muted-foreground truncate', sizes.text)}>
            {status.userDisplayName}
          </p>
        )}
        {status?.connected && status.host && (
          <p className={cn('text-muted-foreground truncate text-xs', size === 'lg' && 'text-sm')}>
            {status.host}
          </p>
        )}
        {status?.error && (
          <p className={cn('text-red-500 truncate', sizes.text)}>
            {status.error}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {showRefresh && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className={cn('rounded-full', sizes.button)}
          >
            <RefreshCw
              className={cn(
                sizes.icon,
                isRefreshing && 'animate-spin'
              )}
            />
          </Button>
        )}
        {showSettings && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettingsClick}
            className={cn('rounded-full', sizes.button)}
          >
            <Settings className={sizes.icon} />
          </Button>
        )}
      </div>
    </div>
  );
}

export default JiraConnectionStatus;
