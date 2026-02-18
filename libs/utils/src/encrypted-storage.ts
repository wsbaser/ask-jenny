/**
 * Encrypted Token Storage Utility
 *
 * Provides secure encryption/decryption for sensitive tokens and credentials
 * using AES-256-GCM (authenticated encryption). This utility is designed to
 * protect API keys, OAuth tokens, and other sensitive data at rest.
 *
 * Security features:
 * - AES-256-GCM authenticated encryption (prevents tampering)
 * - PBKDF2 key derivation with configurable iterations
 * - Unique IV (nonce) per encryption operation
 * - Unique salt per key derivation
 * - Timing-safe comparison for validation
 * - No plaintext secrets in memory longer than necessary
 */

import * as crypto from 'crypto';
import { createLogger } from './logger.js';

const logger = createLogger('EncryptedStorage');

// ============================================================================
// Constants
// ============================================================================

/** Encryption algorithm - AES-256-GCM provides both confidentiality and integrity */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/** Key length in bytes (256 bits for AES-256) */
const KEY_LENGTH = 32;

/** IV length in bytes (96 bits recommended for GCM) */
const IV_LENGTH = 12;

/** Salt length in bytes for key derivation */
const SALT_LENGTH = 32;

/** Authentication tag length in bytes */
const AUTH_TAG_LENGTH = 16;

/** PBKDF2 iterations - balance between security and performance */
const DEFAULT_PBKDF2_ITERATIONS = 100000;

/** Hash algorithm for PBKDF2 */
const PBKDF2_DIGEST = 'sha256';

/** Version byte for encrypted data format (allows future format changes) */
const ENCRYPTED_DATA_VERSION = 1;

// ============================================================================
// Types
// ============================================================================

/**
 * Options for encryption operations
 */
export interface EncryptionOptions {
  /** Number of PBKDF2 iterations (default: 100000) */
  iterations?: number;
}

/**
 * Encrypted data structure containing all information needed for decryption
 */
export interface EncryptedData {
  /** Format version for future compatibility */
  version: number;
  /** Base64-encoded encrypted ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded salt used for key derivation */
  salt: string;
  /** Base64-encoded authentication tag */
  authTag: string;
  /** Number of PBKDF2 iterations used */
  iterations: number;
}

/**
 * Result of a decryption operation
 */
export interface DecryptionResult {
  /** Whether decryption was successful */
  success: boolean;
  /** Decrypted plaintext (only present if success is true) */
  data?: string;
  /** Error message (only present if success is false) */
  error?: string;
}

/**
 * Encrypted credentials structure for storage
 */
export interface EncryptedCredentials {
  /** Whether encryption is enabled */
  encrypted: true;
  /** Encrypted data payload */
  payload: EncryptedData;
}

/**
 * Plaintext credentials structure (for backwards compatibility)
 */
export interface PlaintextCredentials {
  /** Whether encryption is enabled */
  encrypted: false;
  /** Plaintext data */
  data: string;
}

/**
 * Union type for credential storage
 */
export type StoredCredential = EncryptedCredentials | PlaintextCredentials;

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive an encryption key from a password using PBKDF2
 *
 * Uses PBKDF2 with SHA-256 to derive a 256-bit key from the provided
 * password and salt. The number of iterations provides work factor
 * against brute-force attacks.
 *
 * @param password - The password/master key to derive from
 * @param salt - Unique salt for this derivation (should be random per credential)
 * @param iterations - Number of PBKDF2 iterations
 * @returns Promise resolving to derived key buffer
 *
 * @example
 * ```typescript
 * const salt = crypto.randomBytes(32);
 * const key = await deriveKey('master-password', salt, 100000);
 * ```
 */
export async function deriveKey(
  password: string,
  salt: Buffer,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, KEY_LENGTH, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

/**
 * Synchronous version of key derivation (for use in contexts where async is not available)
 *
 * @param password - The password/master key to derive from
 * @param salt - Unique salt for this derivation
 * @param iterations - Number of PBKDF2 iterations
 * @returns Derived key buffer
 */
export function deriveKeySync(
  password: string,
  salt: Buffer,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, PBKDF2_DIGEST);
}

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Encrypt a string value using AES-256-GCM
 *
 * Generates a unique salt and IV for each encryption operation, derives
 * a key using PBKDF2, and encrypts the data with AES-256-GCM which provides
 * both confidentiality and integrity protection.
 *
 * @param plaintext - The string to encrypt
 * @param password - The password/master key to encrypt with
 * @param options - Optional encryption parameters
 * @returns Promise resolving to encrypted data structure
 *
 * @example
 * ```typescript
 * const encrypted = await encrypt('sk-ant-api03-...', 'master-password');
 * // Store encrypted data safely
 * await fs.writeFile('credentials.json', JSON.stringify(encrypted));
 * ```
 */
export async function encrypt(
  plaintext: string,
  password: string,
  options: EncryptionOptions = {}
): Promise<EncryptedData> {
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;

  // Generate unique salt and IV for this encryption
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive encryption key from password
  const key = await deriveKey(password, salt, iterations);

  // Create cipher and encrypt
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Clear sensitive data from memory
  key.fill(0);

  return {
    version: ENCRYPTED_DATA_VERSION,
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    authTag: authTag.toString('base64'),
    iterations,
  };
}

/**
 * Synchronous version of encrypt
 *
 * @param plaintext - The string to encrypt
 * @param password - The password/master key to encrypt with
 * @param options - Optional encryption parameters
 * @returns Encrypted data structure
 */
export function encryptSync(
  plaintext: string,
  password: string,
  options: EncryptionOptions = {}
): EncryptedData {
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKeySync(password, salt, iterations);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  key.fill(0);

  return {
    version: ENCRYPTED_DATA_VERSION,
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    authTag: authTag.toString('base64'),
    iterations,
  };
}

// ============================================================================
// Decryption Functions
// ============================================================================

/**
 * Decrypt an encrypted data structure using AES-256-GCM
 *
 * Validates the encrypted data structure, derives the key using the same
 * parameters, and decrypts the data. The authentication tag is verified
 * to ensure data integrity.
 *
 * @param encryptedData - The encrypted data structure to decrypt
 * @param password - The password/master key used for encryption
 * @returns Promise resolving to decryption result
 *
 * @example
 * ```typescript
 * const encrypted = JSON.parse(await fs.readFile('credentials.json', 'utf8'));
 * const result = await decrypt(encrypted, 'master-password');
 * if (result.success) {
 *   console.log('API Key:', result.data);
 * } else {
 *   console.error('Decryption failed:', result.error);
 * }
 * ```
 */
export async function decrypt(
  encryptedData: EncryptedData,
  password: string
): Promise<DecryptionResult> {
  try {
    // Validate structure
    if (!isValidEncryptedData(encryptedData)) {
      return { success: false, error: 'Invalid encrypted data structure' };
    }

    // Check version compatibility
    if (encryptedData.version > ENCRYPTED_DATA_VERSION) {
      return {
        success: false,
        error: `Unsupported encryption version: ${encryptedData.version}`,
      };
    }

    // Decode components
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');

    // Derive key
    const key = await deriveKey(password, salt, encryptedData.iterations);

    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Clear sensitive data
    key.fill(0);

    return { success: true, data: decrypted.toString('utf8') };
  } catch (error) {
    // Log for debugging but don't expose details to caller
    logger.debug('Decryption failed:', error);

    // Check for common error types
    if (error instanceof Error) {
      if (error.message.includes('Unsupported state') || error.message.includes('auth')) {
        return { success: false, error: 'Authentication failed - incorrect password or corrupted data' };
      }
    }

    return { success: false, error: 'Decryption failed' };
  }
}

/**
 * Synchronous version of decrypt
 *
 * @param encryptedData - The encrypted data structure to decrypt
 * @param password - The password/master key used for encryption
 * @returns Decryption result
 */
export function decryptSync(encryptedData: EncryptedData, password: string): DecryptionResult {
  try {
    if (!isValidEncryptedData(encryptedData)) {
      return { success: false, error: 'Invalid encrypted data structure' };
    }

    if (encryptedData.version > ENCRYPTED_DATA_VERSION) {
      return {
        success: false,
        error: `Unsupported encryption version: ${encryptedData.version}`,
      };
    }

    const salt = Buffer.from(encryptedData.salt, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');

    const key = deriveKeySync(password, salt, encryptedData.iterations);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    key.fill(0);

    return { success: true, data: decrypted.toString('utf8') };
  } catch (error) {
    logger.debug('Decryption failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('Unsupported state') || error.message.includes('auth')) {
        return { success: false, error: 'Authentication failed - incorrect password or corrupted data' };
      }
    }

    return { success: false, error: 'Decryption failed' };
  }
}

// ============================================================================
// Token Storage Helpers
// ============================================================================

/**
 * Encrypt a token for secure storage
 *
 * Convenience wrapper that creates a StoredCredential structure suitable
 * for JSON storage.
 *
 * @param token - The token/secret to encrypt
 * @param masterKey - The master key for encryption
 * @param options - Optional encryption parameters
 * @returns Promise resolving to encrypted credential structure
 *
 * @example
 * ```typescript
 * const credential = await encryptToken('sk-ant-api03-...', masterKey);
 * // Store in credentials.json
 * credentials.apiKeys.anthropic = credential;
 * ```
 */
export async function encryptToken(
  token: string,
  masterKey: string,
  options: EncryptionOptions = {}
): Promise<EncryptedCredentials> {
  const payload = await encrypt(token, masterKey, options);
  return {
    encrypted: true,
    payload,
  };
}

/**
 * Decrypt a stored token
 *
 * Convenience wrapper that handles both encrypted and plaintext credentials.
 * Returns null if decryption fails or credential is invalid.
 *
 * @param credential - The stored credential to decrypt
 * @param masterKey - The master key for decryption
 * @returns Promise resolving to decrypted token or null if failed
 *
 * @example
 * ```typescript
 * const token = await decryptToken(credentials.apiKeys.anthropic, masterKey);
 * if (token) {
 *   // Use the token
 * }
 * ```
 */
export async function decryptToken(
  credential: StoredCredential | string,
  masterKey: string
): Promise<string | null> {
  // Handle plain string (backwards compatibility)
  if (typeof credential === 'string') {
    return credential;
  }

  // Handle plaintext credential
  if (!credential.encrypted) {
    return (credential as PlaintextCredentials).data;
  }

  // Handle encrypted credential
  const result = await decrypt((credential as EncryptedCredentials).payload, masterKey);
  return result.success ? result.data! : null;
}

/**
 * Synchronous version of decryptToken
 *
 * @param credential - The stored credential to decrypt
 * @param masterKey - The master key for decryption
 * @returns Decrypted token or null if failed
 */
export function decryptTokenSync(
  credential: StoredCredential | string,
  masterKey: string
): string | null {
  if (typeof credential === 'string') {
    return credential;
  }

  if (!credential.encrypted) {
    return (credential as PlaintextCredentials).data;
  }

  const result = decryptSync((credential as EncryptedCredentials).payload, masterKey);
  return result.success ? result.data! : null;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a value is a valid EncryptedData structure
 *
 * @param value - The value to check
 * @returns True if the value is a valid EncryptedData structure
 */
export function isValidEncryptedData(value: unknown): value is EncryptedData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    typeof data.version === 'number' &&
    typeof data.ciphertext === 'string' &&
    typeof data.iv === 'string' &&
    typeof data.salt === 'string' &&
    typeof data.authTag === 'string' &&
    typeof data.iterations === 'number' &&
    data.ciphertext.length > 0 &&
    data.iv.length > 0 &&
    data.salt.length > 0 &&
    data.authTag.length > 0 &&
    data.iterations > 0
  );
}

/**
 * Check if a stored credential is encrypted
 *
 * @param credential - The credential to check
 * @returns True if the credential is encrypted
 */
export function isEncryptedCredential(credential: unknown): credential is EncryptedCredentials {
  if (!credential || typeof credential !== 'object') {
    return false;
  }

  const cred = credential as Record<string, unknown>;
  return cred.encrypted === true && isValidEncryptedData(cred.payload);
}

/**
 * Check if a stored credential is plaintext
 *
 * @param credential - The credential to check
 * @returns True if the credential is plaintext
 */
export function isPlaintextCredential(credential: unknown): credential is PlaintextCredentials {
  if (!credential || typeof credential !== 'object') {
    return false;
  }

  const cred = credential as Record<string, unknown>;
  return cred.encrypted === false && typeof cred.data === 'string';
}

// ============================================================================
// Master Key Management
// ============================================================================

/**
 * Generate a cryptographically secure master key
 *
 * Creates a random 256-bit key encoded as hex. This can be used as a
 * master key for encrypting credentials. The key should be stored
 * securely (e.g., in environment variable, secure keychain).
 *
 * @returns 64-character hex string (256 bits)
 *
 * @example
 * ```typescript
 * const masterKey = generateMasterKey();
 * // Store securely: process.env.MASTER_KEY = masterKey
 * ```
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Validate a master key format
 *
 * Checks if the provided string is a valid master key format (64 hex characters).
 *
 * @param key - The key to validate
 * @returns True if the key is valid
 */
export function isValidMasterKey(key: string): boolean {
  return typeof key === 'string' && /^[0-9a-f]{64}$/i.test(key);
}

/**
 * Hash a master key for safe logging/display
 *
 * Creates a truncated hash of the master key that can be used for
 * identification without revealing the actual key.
 *
 * @param key - The master key to hash
 * @returns First 8 characters of SHA-256 hash
 */
export function hashMasterKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 8);
}

// ============================================================================
// Secure Comparison
// ============================================================================

/**
 * Perform timing-safe comparison of two strings
 *
 * Uses Node.js crypto.timingSafeEqual to prevent timing attacks.
 * Returns false if strings have different lengths (without revealing
 * information about the actual content).
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // If lengths differ, compare against self to maintain constant time
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

// ============================================================================
// Credential Migration Helpers
// ============================================================================

/**
 * Migrate a plaintext credential to encrypted format
 *
 * Takes a plaintext string (like a raw API key) and encrypts it.
 * Useful for migrating existing credentials to encrypted storage.
 *
 * @param plaintext - The plaintext credential to encrypt
 * @param masterKey - The master key for encryption
 * @param options - Optional encryption parameters
 * @returns Promise resolving to encrypted credential
 */
export async function migrateToEncrypted(
  plaintext: string,
  masterKey: string,
  options: EncryptionOptions = {}
): Promise<EncryptedCredentials> {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty credential');
  }

  return encryptToken(plaintext, masterKey, options);
}

/**
 * Batch migrate multiple credentials
 *
 * Migrates a record of plaintext credentials to encrypted format.
 *
 * @param credentials - Record of credential name to plaintext value
 * @param masterKey - The master key for encryption
 * @param options - Optional encryption parameters
 * @returns Promise resolving to record of encrypted credentials
 *
 * @example
 * ```typescript
 * const encrypted = await batchMigrateToEncrypted({
 *   anthropic: 'sk-ant-...',
 *   openai: 'sk-...',
 * }, masterKey);
 * ```
 */
export async function batchMigrateToEncrypted(
  credentials: Record<string, string>,
  masterKey: string,
  options: EncryptionOptions = {}
): Promise<Record<string, EncryptedCredentials>> {
  const result: Record<string, EncryptedCredentials> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (value) {
      result[key] = await encryptToken(value, masterKey, options);
    }
  }

  return result;
}

/**
 * Batch decrypt multiple credentials
 *
 * Decrypts a record of stored credentials (handles both encrypted and plaintext).
 *
 * @param credentials - Record of credential name to stored credential
 * @param masterKey - The master key for decryption
 * @returns Promise resolving to record of plaintext credentials
 */
export async function batchDecrypt(
  credentials: Record<string, StoredCredential | string>,
  masterKey: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(credentials)) {
    const decrypted = await decryptToken(value, masterKey);
    if (decrypted !== null) {
      result[key] = decrypted;
    }
  }

  return result;
}
