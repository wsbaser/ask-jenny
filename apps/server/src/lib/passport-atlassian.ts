/**
 * Passport Atlassian OAuth2 Strategy Configuration
 *
 * Configures passport.js with the Atlassian OAuth2 strategy for Jira Cloud authentication.
 * This enables users to authenticate with their Atlassian account and obtain tokens
 * for accessing Jira Cloud APIs.
 *
 * OAuth2 Flow:
 * 1. User initiates login via /api/jira/auth/login
 * 2. User is redirected to Atlassian authorization page
 * 3. User grants permissions
 * 4. Atlassian redirects back to /api/jira/auth/callback with authorization code
 * 5. Strategy exchanges code for access/refresh tokens
 * 6. Tokens are stored in credentials.json for API access
 *
 * Required environment variables (or credentials from settings):
 * - ATLASSIAN_CLIENT_ID: OAuth2 client ID from Atlassian Developer Console
 * - ATLASSIAN_CLIENT_SECRET: OAuth2 client secret
 * - ATLASSIAN_CALLBACK_URL: Callback URL (defaults to http://localhost:7008/api/jira/auth/callback)
 *
 * @see https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
 */

import passport from 'passport';
import AtlassianStrategy from 'passport-atlassian-oauth2';
import { createLogger } from '@automaker/utils';

const logger = createLogger('PassportAtlassian');

/**
 * Atlassian user profile returned after successful authentication
 */
export interface AtlassianProfile {
  /** Atlassian account ID */
  id: string;
  /** User's display name */
  displayName: string;
  /** User's email address */
  email?: string;
  /** Array of email objects */
  emails?: Array<{ value: string; type?: string }>;
  /** User's profile photo URL */
  photo?: string;
  /** Accessible resources (Atlassian sites/products the user has access to) */
  accessibleResources?: AtlassianAccessibleResource[];
  /** Raw profile data from Atlassian */
  _raw?: string;
  /** Parsed JSON profile */
  _json?: Record<string, unknown>;
}

/**
 * Atlassian accessible resource (site/product the user has access to)
 */
export interface AtlassianAccessibleResource {
  /** Cloud ID for the resource */
  id: string;
  /** Resource URL */
  url: string;
  /** Resource name (site name) */
  name: string;
  /** Scopes available for this resource */
  scopes: string[];
  /** Avatar URL for the resource */
  avatarUrl?: string;
}

/**
 * OAuth2 tokens returned after authentication
 */
export interface AtlassianTokens {
  /** Access token for API requests */
  accessToken: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken: string;
  /** Token expiry time in seconds (typically 3600 = 1 hour) */
  expiresIn?: number;
  /** Scopes granted to the token */
  scope?: string;
}

/**
 * Result from successful Atlassian authentication
 */
export interface AtlassianAuthResult {
  /** User profile information */
  profile: AtlassianProfile;
  /** OAuth2 tokens */
  tokens: AtlassianTokens;
  /** Accessible Atlassian cloud resources */
  accessibleResources: AtlassianAccessibleResource[];
}

/**
 * Configuration options for Atlassian OAuth2 strategy
 */
export interface AtlassianStrategyConfig {
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** Callback URL after authorization */
  callbackUrl: string;
  /** OAuth2 scopes to request */
  scopes?: string[];
}

/**
 * Default OAuth2 scopes for Jira Cloud access
 *
 * These scopes provide:
 * - read:jira-user: Read user information
 * - read:jira-work: Read issues, projects, boards, etc.
 * - write:jira-work: Create/update issues, comments, etc.
 * - offline_access: Get refresh token for long-term access
 */
export const DEFAULT_ATLASSIAN_SCOPES = [
  'read:jira-user',
  'read:jira-work',
  'write:jira-work',
  'offline_access',
];

/**
 * Callback function type for authentication verification
 */
type VerifyCallback = (error: Error | null, user?: AtlassianAuthResult | false) => void;

/**
 * Store for pending authentication results
 * Maps state parameter to auth result for retrieval after callback
 */
const pendingAuthResults = new Map<
  string,
  {
    result?: AtlassianAuthResult;
    error?: Error;
    timestamp: number;
  }
>();

// Clean up old pending results every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    pendingAuthResults.forEach((value, key) => {
      if (now - value.timestamp > maxAge) {
        pendingAuthResults.delete(key);
      }
    });
  },
  5 * 60 * 1000
);

/**
 * Store an authentication result for later retrieval
 *
 * @param state - State parameter used to identify the auth flow
 * @param result - Authentication result or error
 */
export function storeAuthResult(
  state: string,
  result: { result?: AtlassianAuthResult; error?: Error }
): void {
  pendingAuthResults.set(state, {
    ...result,
    timestamp: Date.now(),
  });
}

/**
 * Retrieve and remove an authentication result
 *
 * @param state - State parameter used to identify the auth flow
 * @returns Authentication result or undefined if not found
 */
export function retrieveAuthResult(state: string):
  | {
      result?: AtlassianAuthResult;
      error?: Error;
    }
  | undefined {
  const stored = pendingAuthResults.get(state);
  if (stored) {
    pendingAuthResults.delete(state);
    return { result: stored.result, error: stored.error };
  }
  return undefined;
}

/**
 * Configure and initialize the Atlassian OAuth2 passport strategy
 *
 * This function sets up passport with the Atlassian strategy using the provided
 * configuration. The strategy handles the OAuth2 flow and returns user profile
 * and tokens upon successful authentication.
 *
 * @param config - Strategy configuration options
 * @returns The configured passport instance
 *
 * @example
 * ```typescript
 * const passport = configureAtlassianStrategy({
 *   clientId: process.env.ATLASSIAN_CLIENT_ID!,
 *   clientSecret: process.env.ATLASSIAN_CLIENT_SECRET!,
 *   callbackUrl: 'http://localhost:7008/api/jira/auth/callback',
 * });
 * ```
 */
export function configureAtlassianStrategy(config: AtlassianStrategyConfig): typeof passport {
  const { clientId, clientSecret, callbackUrl, scopes = DEFAULT_ATLASSIAN_SCOPES } = config;

  if (!clientId || !clientSecret) {
    logger.warn(
      'Atlassian OAuth2 credentials not configured. Jira OAuth authentication will not be available.'
    );
    return passport;
  }

  logger.info('Configuring Atlassian OAuth2 strategy');
  logger.debug(`Callback URL: ${callbackUrl}`);
  logger.debug(`Scopes: ${scopes.join(', ')}`);

  const strategy = new AtlassianStrategy(
    {
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackUrl,
      scope: scopes.join(' '),
    },
    (
      accessToken: string,
      refreshToken: string,
      profile: AtlassianProfile,
      done: VerifyCallback
    ) => {
      // The verify callback is called after successful authentication
      // We package up all the information needed for Jira API access

      logger.info(`Atlassian OAuth2 authentication successful for user: ${profile.displayName}`);
      logger.debug(`User ID: ${profile.id}`);
      logger.debug(
        `Accessible resources: ${profile.accessibleResources?.map((r) => r.name).join(', ') || 'none'}`
      );

      const authResult: AtlassianAuthResult = {
        profile,
        tokens: {
          accessToken,
          refreshToken,
          // Note: passport-atlassian-oauth2 doesn't expose expiresIn directly
          // Atlassian tokens typically expire in 1 hour (3600 seconds)
          expiresIn: 3600,
        },
        accessibleResources: profile.accessibleResources || [],
      };

      // Return the auth result to passport
      done(null, authResult);
    }
  );

  // Register the strategy with passport
  // Cast to any to handle type mismatch between passport-atlassian-oauth2 and @types/passport
  // The strategy is compatible at runtime, but TypeScript definitions don't align
  passport.use('atlassian', strategy as passport.Strategy);

  // Serialize user to session (minimal - just store what we need to identify the user)
  passport.serializeUser((user: Express.User, done) => {
    const authResult = user as AtlassianAuthResult;
    // Only store the profile ID for session management
    // Full tokens should be stored in credentials.json, not session
    done(null, {
      id: authResult.profile.id,
      displayName: authResult.profile.displayName,
    });
  });

  // Deserialize user from session
  passport.deserializeUser(
    (
      serialized: { id: string; displayName: string },
      done: (err: Error | null, user?: Express.User | false) => void
    ) => {
      // For API-based auth, we don't maintain full session state
      // The actual tokens are stored in credentials.json
      done(null, serialized as unknown as Express.User);
    }
  );

  logger.info('Atlassian OAuth2 strategy configured successfully');

  return passport;
}

/**
 * Get the Atlassian OAuth2 strategy configuration from environment variables
 *
 * @param overrides - Optional configuration overrides
 * @returns Strategy configuration or null if credentials are not available
 */
export function getAtlassianConfigFromEnv(
  overrides?: Partial<AtlassianStrategyConfig>
): AtlassianStrategyConfig | null {
  const clientId = overrides?.clientId || process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = overrides?.clientSecret || process.env.ATLASSIAN_CLIENT_SECRET;
  const callbackUrl =
    overrides?.callbackUrl ||
    process.env.ATLASSIAN_CALLBACK_URL ||
    'http://localhost:7008/api/jira/auth/callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    callbackUrl,
    scopes: overrides?.scopes || DEFAULT_ATLASSIAN_SCOPES,
  };
}

/**
 * Check if Atlassian OAuth2 is configured and available
 *
 * @returns True if OAuth2 credentials are available
 */
export function isAtlassianOAuthConfigured(): boolean {
  return !!(process.env.ATLASSIAN_CLIENT_ID && process.env.ATLASSIAN_CLIENT_SECRET);
}

/**
 * Generate the authorization URL for initiating OAuth2 flow
 *
 * This can be used to generate a direct link to the Atlassian authorization page
 * without going through the passport middleware.
 *
 * @param config - Strategy configuration
 * @param state - Optional state parameter for CSRF protection
 * @returns Authorization URL
 */
export function generateAuthorizationUrl(config: AtlassianStrategyConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: (config.scopes || DEFAULT_ATLASSIAN_SCOPES).join(' '),
    audience: 'api.atlassian.com',
    prompt: 'consent',
  });

  if (state) {
    params.set('state', state);
  }

  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

/**
 * Refresh an expired access token using the refresh token
 *
 * Makes a POST request to Atlassian's token endpoint to obtain a new access token.
 * Atlassian access tokens expire after 1 hour, so this function is used to obtain
 * new tokens without requiring the user to re-authenticate.
 *
 * @param refreshToken - The refresh token obtained during initial OAuth flow
 * @param clientId - OAuth2 client ID (optional, uses env var if not provided)
 * @param clientSecret - OAuth2 client secret (optional, uses env var if not provided)
 * @returns New tokens including access_token, refresh_token, and expires_in
 * @throws Error if token refresh fails
 *
 * @see https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#how-do-i-get-a-new-access-token--if-my-access-token-expires-or-is-revoked-
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId?: string,
  clientSecret?: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const tokenUrl = 'https://auth.atlassian.com/oauth/token';

  // Use provided credentials or fall back to environment variables
  const resolvedClientId = clientId || process.env.ATLASSIAN_CLIENT_ID;
  const resolvedClientSecret = clientSecret || process.env.ATLASSIAN_CLIENT_SECRET;

  if (!resolvedClientId || !resolvedClientSecret) {
    throw new Error(
      'OAuth2 credentials not available. Set ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET environment variables.'
    );
  }

  logger.info('Refreshing Atlassian OAuth access token');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: resolvedClientId,
      client_secret: resolvedClientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`Token refresh failed: ${response.status} ${errorText}`);
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }

  const tokens = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  logger.info('Successfully refreshed Atlassian OAuth access token');
  logger.debug(`New token expires in ${tokens.expires_in} seconds`);

  return tokens;
}

/**
 * Check if an access token needs to be refreshed
 *
 * Returns true if:
 * - Token expiry time is not set (assume expired for safety)
 * - Token expires within the specified buffer time (default: 5 minutes)
 *
 * @param tokenExpiresAt - ISO timestamp of when the token expires
 * @param bufferSeconds - Refresh this many seconds before actual expiry (default: 300 = 5 minutes)
 * @returns True if token should be refreshed
 */
export function shouldRefreshToken(tokenExpiresAt?: string, bufferSeconds: number = 300): boolean {
  if (!tokenExpiresAt) {
    // No expiry info - assume token needs refresh to be safe
    return true;
  }

  const expiresAt = new Date(tokenExpiresAt);
  const now = new Date();

  // Add buffer to current time to refresh proactively
  const refreshThreshold = new Date(now.getTime() + bufferSeconds * 1000);

  return expiresAt <= refreshThreshold;
}

/**
 * Calculate token expiry timestamp from expires_in value
 *
 * @param expiresIn - Number of seconds until token expires
 * @returns ISO timestamp string of when the token will expire
 */
export function calculateTokenExpiry(expiresIn: number): string {
  const expiryDate = new Date(Date.now() + expiresIn * 1000);
  return expiryDate.toISOString();
}

// Export passport instance for use in routes
export { passport };
