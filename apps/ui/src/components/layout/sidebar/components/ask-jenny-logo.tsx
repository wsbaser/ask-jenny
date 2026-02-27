import type { NavigateOptions } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useOSDetection } from '@/hooks/use-os-detection';

interface AskJennyLogoProps {
  sidebarOpen: boolean;
  navigate: (opts: NavigateOptions) => void;
}

interface LogoIconProps {
  /** Unique suffix for SVG element IDs to avoid conflicts when multiple instances exist */
  idSuffix: string;
  className?: string;
}

function getOSAbbreviation(os: string): string {
  switch (os) {
    case 'mac':
      return 'M';
    case 'windows':
      return 'W';
    case 'linux':
      return 'L';
    default:
      return '?';
  }
}

/**
 * Reusable SVG logo icon component
 * Extracted to avoid duplication between collapsed and expanded states
 */
function LogoIcon({ idSuffix, className }: LogoIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      role="img"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient
          id={`bg-${idSuffix}`}
          x1="0"
          y1="0"
          x2="256"
          y2="256"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
        </linearGradient>
        <filter id={`iconShadow-${idSuffix}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="4"
            stdDeviation="4"
            floodColor="#000000"
            floodOpacity="0.25"
          />
        </filter>
      </defs>
      <rect x="16" y="16" width="224" height="224" rx="56" fill={`url(#bg-${idSuffix})`} />
      <g
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#iconShadow-${idSuffix})`}
      >
        <path d="M92 92 L52 128 L92 164" />
        <path d="M144 72 L116 184" />
        <path d="M164 92 L204 128 L164 164" />
      </g>
    </svg>
  );
}

export function AskJennyLogo({ sidebarOpen, navigate }: AskJennyLogoProps) {
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const { os } = useOSDetection();
  const appMode = import.meta.env.VITE_APP_MODE || '?';
  const versionSuffix = `${getOSAbbreviation(os)}${appMode}`;

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-3 titlebar-no-drag cursor-pointer group',
        'rounded-lg transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'hover:opacity-90 active:scale-[0.98]',
        !sidebarOpen && 'flex-col gap-1'
      )}
      onClick={() => navigate({ to: '/dashboard' })}
      aria-label="Go to Ask Jenny dashboard"
      data-testid="logo-button"
    >
      {/* Collapsed logo - only shown when sidebar is closed */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg gap-0.5',
          sidebarOpen ? 'hidden' : 'flex'
        )}
      >
        <LogoIcon
          idSuffix="collapsed"
          className="size-8 group-hover:rotate-12 transition-transform duration-300 ease-out"
        />
        <span className="text-[0.625rem] text-muted-foreground leading-none font-medium">
          v{appVersion} {versionSuffix}
        </span>
      </div>

      {/* Expanded logo - shown when sidebar is open */}
      {sidebarOpen && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <LogoIcon
              idSuffix="expanded"
              className="h-8 w-8 lg:h-[36.8px] lg:w-[36.8px] shrink-0 group-hover:rotate-12 transition-transform duration-300 ease-out"
            />
            <span className="font-bold text-foreground text-xl lg:text-[1.7rem] tracking-tight leading-none translate-y-[-2px]">
              Ask Jenny<span className="text-brand-500">.</span>
            </span>
          </div>
          <span className="text-[0.625rem] text-muted-foreground leading-none font-medium ml-9 lg:ml-[38.8px]">
            v{appVersion} {versionSuffix}
          </span>
        </div>
      )}
    </button>
  );
}

/**
 * @deprecated Use AskJennyLogo instead
 */
export const AutomakerLogo = AskJennyLogo;
