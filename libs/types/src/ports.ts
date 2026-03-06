/**
 * Centralized port configuration for Ask Jenny
 *
 * These ports are reserved for the Ask Jenny application and should never be
 * killed or terminated by AI agents during feature implementation.
 */

/** Port for the static/UI server (Vite dev server) */
export const STATIC_PORT = 7007;

/** Port for the backend API server (Express + WebSocket) */
export const SERVER_PORT = 7008;

/** Array of all reserved Ask Jenny ports */
export const RESERVED_PORTS = [STATIC_PORT, SERVER_PORT] as const;
