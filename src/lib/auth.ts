import { SignJWT, jwtVerify } from 'jose';

const secretKey = process.env.JWT_SECRET;
if (!secretKey && process.env.NODE_ENV === 'production') {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production!');
}

const JWT_SECRET = new TextEncoder().encode(
  secretKey || 'super-secret-waritaku-key-local-dev-only'
);

export interface SessionPayload {
  userId: number;
  role: string;
  name: string;
  email: string;
}

export async function createSessionCookie(payload: SessionPayload): Promise<string> {
  const jwt = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // 24 hours
    .sign(JWT_SECRET);
    
  return jwt;
}

export async function verifySessionCookie(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch (error) {
    return null;
  }
}

// ── Native Web Crypto API PBKDF2 (Waritaku native format) ────────────────────
function buf2hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function hex2buf(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  return buf2hex(salt) + ':' + buf2hex(hashBuffer);
}

/**
 * Verify a password against a stored hash.
 *
 * Supported formats:
 *  - `$wp$2y$...`  WordPress 6.8+ bcrypt  → strips `$wp$`, verifies via bcryptjs
 *  - `$P$...`      Legacy WordPress phpass → always returns false (admin reset required)
 *  - `{hex}:{hex}` Waritaku native PBKDF2  → Web Crypto API verification
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    // ── WordPress bcrypt ($wp$2y$...) ─────────────────────────────────────────
    // WordPress 6.8+ prepends "$wp$" to a standard bcrypt hash.
    // Strip the prefix and verify using the pure-JS bcryptjs library.
    if (storedHash.startsWith('$wp$')) {
      const bcryptHash = storedHash.slice(4); // "$wp$" removed → "$2y$10$..."
      const { compare } = await import('bcryptjs');
      return compare(password, bcryptHash);
    }

    // ── WordPress phpass ($P$ / $H$) ──────────────────────────────────────────
    // MD5-based phpass. Not implementable at the edge without native bindings.
    // These users need an admin-initiated password reset.
    if (storedHash.startsWith('$P$') || storedHash.startsWith('$H$')) {
      return false;
    }

    // ── Waritaku native PBKDF2 (saltHex:hashHex) ─────────────────────────────
    const [saltHex, originalHashHex] = storedHash.split(':');
    if (!saltHex || !originalHashHex) return false;

    const salt = hex2buf(saltHex);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    
    return buf2hex(hashBuffer) === originalHashHex;
  } catch {
    return false;
  }
}

/**
 * Returns true if the stored hash is a legacy WordPress format.
 * The login handler should silently upgrade it to PBKDF2 on the first
 * successful login so future logins are fast.
 */
export function isLegacyWordPressHash(storedHash: string): boolean {
  return storedHash.startsWith('$wp$') || storedHash.startsWith('$P$') || storedHash.startsWith('$H$');
}
