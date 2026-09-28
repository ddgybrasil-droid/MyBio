const HASH_KEY = 'shader=';

export function shareSupported(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeShader(code: string): Promise<string> {
  const bytes = await pipe(new TextEncoder().encode(code), new CompressionStream('deflate-raw'));
  return toBase64Url(bytes);
}

export async function decodeShader(encoded: string): Promise<string> {
  const bytes = await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(bytes);
}

/** Returns the encoded payload from `#shader=…`, if any. */
export function readShareHash(hash = location.hash): string | null {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith(HASH_KEY)) return null;
  const value = raw.slice(HASH_KEY.length);
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

/** Builds the share URL and writes it into the address bar without scrolling or adding history. */
export async function writeShareHash(code: string): Promise<string> {
  const encoded = await encodeShader(code);
  const url = new URL(location.href);
  url.hash = HASH_KEY + encoded;
  history.replaceState(history.state, '', url);
  return url.href;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
