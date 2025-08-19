// utils/jwt-utils.ts
type JwtParts = { header: any; payload: any; signature: string; raw: string };

function b64urlDecode(b64url: string): string {
  const pad = 4 - (b64url.length % 4 || 4);
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return Buffer.from(b64, 'base64').toString('utf8');
}

function b64urlEncode(utf8: string): string {
  return Buffer.from(utf8, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function parseJwt(token: string): JwtParts {
  const [h, p, s = ''] = token.split('.');
  if (!h || !p) throw new Error('Invalid JWT structure');

  const header = JSON.parse(b64urlDecode(h));
  const payload = JSON.parse(b64urlDecode(p));
  return { header, payload, signature: s, raw: token };
}

// Return a token with header.alg forced to "none" and **no signature**
export function withAlgNone(original: string): string {
  const [h, p] = original.split('.');
  const header = JSON.parse(b64urlDecode(h));
  header.alg = 'none';
  const h2 = b64urlEncode(JSON.stringify(header));
  // keep the same payload, drop signature
  return `${h2}.${p}.`;
}

// Return a token where the payload is mutated (signature becomes invalid)
export function withPayloadMutation(original: string, patch: Partial<any>): string {
  const [h, p, s] = original.split('.');
  const payload = JSON.parse(b64urlDecode(p));
  const p2 = b64urlEncode(JSON.stringify({ ...payload, ...patch }));
  // keep header and (stale) signature => server must reject
  return `${h}.${p2}.${s}`;
}

// Intentionally corrupt the signature by flipping a char
export function withBrokenSignature(original: string): string {
  const [h, p, s = ''] = original.split('.');
  const bad = (s || 'x') + 'x';
  return `${h}.${p}.${bad}`;
}