/**
 * Type declarations for passport-atlassian-oauth2
 *
 * This package provides a Passport strategy for authenticating with Atlassian
 * products (including Jira) using OAuth 2.0 (3LO - 3-legged OAuth).
 *
 * @see https://github.com/jsarafajr/passport-atlassian-oauth2
 */

declare module 'passport-atlassian-oauth2' {
  import { Strategy as OAuth2Strategy } from 'passport-oauth2';
  import type { Request } from 'express';
  import type { Strategy as PassportStrategy } from 'passport';

  /**
   * Atlassian accessible resource - represents a cloud site the user has access to
   */
  export interface AtlassianAccessibleResource {
    /** Cloud ID for the resource */
    id: string;
    /** Resource URL (e.g., "https://your-domain.atlassian.net") */
    url: string;
    /** Site name */
    name: string;
    /** Scopes available for this resource */
    scopes: string[];
    /** Avatar URL */
    avatarUrl?: string;
  }

  /**
   * Atlassian user profile returned after authentication
   */
  export interface AtlassianProfile {
    /** Atlassian account ID */
    id: string;
    /** User's display name */
    displayName: string;
    /** Email objects array */
    emails?: Array<{ value: string; type?: string }>;
    /** User's avatar/photo URL */
    photos?: Array<{ value: string }>;
    /** Accessible cloud resources */
    accessibleResources?: AtlassianAccessibleResource[];
    /** Provider name (always 'atlassian') */
    provider: string;
    /** Raw profile response */
    _raw?: string;
    /** Parsed JSON profile */
    _json?: Record<string, unknown>;
  }

  /**
   * Strategy options for Atlassian OAuth2
   */
  export interface StrategyOptions {
    /** Atlassian application client ID */
    clientID: string;
    /** Atlassian application client secret */
    clientSecret: string;
    /** Callback URL after authorization */
    callbackURL: string;
    /** Space-separated OAuth2 scopes */
    scope: string;
    /** Authorization URL (defaults to Atlassian's) */
    authorizationURL?: string;
    /** Token URL (defaults to Atlassian's) */
    tokenURL?: string;
    /** Pass request to verify callback */
    passReqToCallback?: boolean;
    /** State parameter handling */
    state?: boolean;
    /** Custom state store */
    store?: unknown;
  }

  /**
   * Strategy options with request passed to callback
   */
  export interface StrategyOptionsWithRequest extends StrategyOptions {
    passReqToCallback: true;
  }

  /**
   * Verify callback without request
   */
  export type VerifyCallback = (
    accessToken: string,
    refreshToken: string,
    profile: AtlassianProfile,
    done: (error: Error | null, user?: unknown, info?: unknown) => void
  ) => void;

  /**
   * Verify callback with request
   */
  export type VerifyCallbackWithRequest = (
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: AtlassianProfile,
    done: (error: Error | null, user?: unknown, info?: unknown) => void
  ) => void;

  /**
   * Atlassian OAuth2 Strategy for Passport
   *
   * Authenticates users using Atlassian's OAuth 2.0 (3LO) protocol.
   * After authentication, provides access to the user's profile and
   * accessible Atlassian cloud resources.
   */
  class Strategy extends OAuth2Strategy {
    /** Strategy name (always 'atlassian') */
    name: string;

    /**
     * Create a new Atlassian OAuth2 strategy
     *
     * @param options - Strategy configuration options
     * @param verify - Verify callback function
     */
    constructor(options: StrategyOptions, verify: VerifyCallback);
    constructor(options: StrategyOptionsWithRequest, verify: VerifyCallbackWithRequest);

    /**
     * Authenticate request
     *
     * @param req - Express request
     * @param options - Authentication options
     */
    authenticate(req: Request, options?: Record<string, unknown>): void;

    /**
     * Retrieve user profile from Atlassian
     *
     * @param accessToken - OAuth2 access token
     * @param done - Callback function
     */
    userProfile(
      accessToken: string,
      done: (error: Error | null, profile?: AtlassianProfile) => void
    ): void;

    /**
     * Return authorization parameters for Atlassian
     *
     * @param options - Options from authenticate call
     * @returns Authorization parameters object
     */
    authorizationParams(options: Record<string, unknown>): Record<string, string>;
  }

  export default Strategy;
  export { Strategy };
}
