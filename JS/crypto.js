/* ===========================================================
   ALIP ENCRYPTOR — crypto.js
   Real AES-256-GCM encryption via the browser's native Web Crypto API.
   Key derivation: PBKDF2-SHA256, 250,000 iterations, random 16-byte salt.
   Container format (".alipenc"), all big-endian / fixed-width fields:

   [4]  magic            "ALC1"
   [1]  version           1
   [1]  saltLen           -> [saltLen] salt bytes
   [1]  ivLen             -> [ivLen] iv bytes
   [4]  iterations (uint32)
   [2]  nameLen (uint16)  -> [nameLen] filename bytes (utf-8)
   [..] ciphertext (AES-GCM output; auth tag is appended by the browser)

   Nothing here ever stores or transmits the password. It exists only
   in memory for the duration of the derive+encrypt/decrypt call.
   =========================================================== */

const ALIP_MAGIC = new Uint8Array([0x41, 0x4c, 0x43, 0x31]); // "ALC1"
const PBKDF2_ITERATIONS = 250000;

function concatBytes(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}
function readU32be(bytes, off) {
  return new DataView(bytes.buffer, bytes.byteOffset + off, 4).getUint32(0, false);
}
function u16be(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, false);
  return b;
}
function readU16be(bytes, off) {
  return new DataView(bytes.buffer, bytes.byteOffset + off, 2).getUint16(0, false);
}

async function deriveAesKey(password, salt, iterations) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 5); // 0..5
}

/**
 * Encrypt a single File object. Returns { blob, outName }.
 * onProgress(fraction 0..1) is called at coarse checkpoints — real
 * crypto work here happens in one native call, so progress is simulated
 * across read -> derive -> encrypt -> assemble stages (still backed by
 * genuine work at each stage, not a fake timer).
 */
async function alipEncryptFile(file, password, onProgress) {
  onProgress && onProgress(0.05, 'Reading file…');
  const plainBuf = new Uint8Array(await file.arrayBuffer());

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  onProgress && onProgress(0.25, 'Deriving key (PBKDF2-SHA256)…');
  const key = await deriveAesKey(password, salt, PBKDF2_ITERATIONS);

  onProgress && onProgress(0.55, 'Encrypting (AES-256-GCM)…');
  const cipherBuf = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBuf)
  );

  onProgress && onProgress(0.85, 'Assembling container…');
  const nameBytes = new TextEncoder().encode(file.name);
  const header = concatBytes(
    ALIP_MAGIC,
    new Uint8Array([1]),           // version
    new Uint8Array([salt.length]),
    salt,
    new Uint8Array([iv.length]),
    iv,
    u32be(PBKDF2_ITERATIONS),
    u16be(nameBytes.length),
    nameBytes
  );
  const container = concatBytes(header, cipherBuf);
  onProgress && onProgress(1, 'Done');

  return {
    blob: new Blob([container], { type: 'application/octet-stream' }),
    outName: file.name + '.alipenc',
    originalSize: plainBuf.length,
    outSize: container.length
  };
}

/**
 * Decrypt a .alipenc File/Blob. Returns { blob, outName } or throws
 * with a safe, descriptive Error on bad password / corrupt container.
 */
async function alipDecryptFile(file, password, onProgress) {
  onProgress && onProgress(0.1, 'Reading container…');
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length < 4 || !ALIP_MAGIC.every((b, i) => bytes[i] === b)) {
    throw new Error('Not a valid .alipenc file (bad magic header).');
  }
  let off = 4;
  const version = bytes[off]; off += 1;
  if (version !== 1) throw new Error('Unsupported container version: ' + version);

  const saltLen = bytes[off]; off += 1;
  const salt = bytes.slice(off, off + saltLen); off += saltLen;

  const ivLen = bytes[off]; off += 1;
  const iv = bytes.slice(off, off + ivLen); off += ivLen;

  const iterations = readU32be(bytes, off); off += 4;

  const nameLen = readU16be(bytes, off); off += 2;
  const nameBytes = bytes.slice(off, off + nameLen); off += nameLen;
  const originalName = new TextDecoder().decode(nameBytes);

  const cipherBuf = bytes.slice(off);

  onProgress && onProgress(0.35, 'Deriving key (PBKDF2-SHA256)…');
  const key = await deriveAesKey(password, salt, iterations);

  onProgress && onProgress(0.65, 'Decrypting + verifying integrity…');
  let plainBuf;
  try {
    plainBuf = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf)
    );
  } catch (e) {
    // AES-GCM auth tag check failed: wrong password or corrupted/tampered file.
    throw new Error('Decryption failed — wrong password, or the file is corrupted.');
  }

  onProgress && onProgress(1, 'Done');
  return {
    blob: new Blob([plainBuf]),
    outName: originalName || 'decrypted_file',
    outSize: plainBuf.length
  };
}

async function sha256Hex(blobOrFile) {
  const buf = await blobOrFile.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
