/**
 * Google OAuth2 access-token helper for the Firestore REST API.
 *
 * Signs a service-account JWT using the Web Crypto API (RSASSA-PKCS1-v1_5 /
 * SHA-256) and exchanges it for a short-lived Bearer token.  Works in
 * Cloudflare Workers without Node.js crypto — no dynamic code generation.
 *
 * The token is cached at module-level so warm worker invocations skip the
 * two-round-trip overhead until 60 s before expiry.
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface TokenCache {
  token: string;
  expiresAt: number; // ms since epoch
}

let _cache: TokenCache | null = null;
let _sheetsCache: TokenCache | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function arrayBufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64url(str: string): string {
  return arrayBufferToBase64url(
    new TextEncoder().encode(str).buffer as ArrayBuffer,
  );
}

async function createJWT(sa: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const headerB64 = stringToBase64url(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const claimsB64 = stringToBase64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope,
    }),
  );

  const signingInput = `${headerB64}.${claimsB64}`;

  // Strip PEM armour and all whitespace; Google service accounts use PKCS#8.
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${arrayBufferToBase64url(sig)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a valid Google OAuth2 Bearer token scoped to Firestore.
 * Refreshes automatically when the cached token is within 60 s of expiry.
 */
async function exchangeJWT(jwt: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth2 token exchange failed ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

/**
 * Returns a valid Google OAuth2 Bearer token scoped to Firestore.
 * Refreshes automatically when the cached token is within 60 s of expiry.
 */
export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (_cache && _cache.expiresAt > now + 60_000) return _cache.token;

  const jwt = await createJWT(sa, "https://www.googleapis.com/auth/datastore");
  const json = await exchangeJWT(jwt);
  _cache = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return _cache.token;
}

/**
 * Returns a valid Google OAuth2 Bearer token scoped to Google Sheets (read-only).
 * Uses a separate cache from the Firestore token.
 */
export async function getAccessTokenForSheets(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (_sheetsCache && _sheetsCache.expiresAt > now + 60_000) return _sheetsCache.token;

  const jwt = await createJWT(sa, "https://www.googleapis.com/auth/spreadsheets.readonly");
  const json = await exchangeJWT(jwt);
  _sheetsCache = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return _sheetsCache.token;
}
