import crypto from 'node:crypto';
import zlib from 'node:zlib';

const MAGIC_HEADER = Buffer.from('MAISENC1', 'ascii'); // 8 bytes
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function isEncryptionKeyConfigured(): boolean {
  return Boolean(
    process.env.BACKUP_ENCRYPTION_KEY &&
      process.env.BACKUP_ENCRYPTION_KEY.trim().length >= 16
  );
}

function getEffectivePassphrase(overrideKey?: string): string {
  if (overrideKey && overrideKey.trim().length > 0) {
    return overrideKey.trim();
  }
  if (process.env.BACKUP_ENCRYPTION_KEY && process.env.BACKUP_ENCRYPTION_KEY.trim()) {
    return process.env.BACKUP_ENCRYPTION_KEY.trim();
  }
  // Fallback server-side vault key when BACKUP_ENCRYPTION_KEY env var is not yet provisioned
  return 'mais-ltd-default-local-vault-key-change-in-production-env';
}

export function computeSha256Hex(input: Buffer | string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export interface EncryptedBackupArtifact {
  encryptedBuffer: Buffer;
  uncompressedSizeBytes: number;
  compressedSizeBytes: number;
  encryptedSizeBytes: number;
  sha256Checksum: string;
  cipher: 'AES-256-GCM';
}

/**
 * Compresses a UTF-8 backup payload with Gzip and encrypts it at rest using AES-256-GCM
 * with a scrypt-derived 256-bit key, random 16-byte salt, and random 12-byte IV.
 */
export function compressAndEncryptBackup(
  plaintextUtf8: string,
  passphraseOverride?: string
): EncryptedBackupArtifact {
  const rawBuffer = Buffer.from(plaintextUtf8, 'utf-8');
  const compressed = zlib.gzipSync(rawBuffer, { level: zlib.constants.Z_BEST_COMPRESSION });

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(getEffectivePassphrase(passphraseOverride), salt, 32);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encryptedBuffer = Buffer.concat([
    MAGIC_HEADER,
    salt,
    iv,
    authTag,
    ciphertext,
  ]);

  const sha256Checksum = computeSha256Hex(encryptedBuffer);

  return {
    encryptedBuffer,
    uncompressedSizeBytes: rawBuffer.length,
    compressedSizeBytes: compressed.length,
    encryptedSizeBytes: encryptedBuffer.length,
    sha256Checksum,
    cipher: 'AES-256-GCM',
  };
}

/**
 * Decrypts and decompresses an AES-256-GCM encrypted `.sql.gz.enc` backup artifact,
 * verifying the authentication tag and magic header.
 */
export function decryptAndDecompressBackup(
  encryptedBuffer: Buffer,
  passphraseOverride?: string
): string {
  const minLength = MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (encryptedBuffer.length < minLength) {
    throw new Error('Encrypted backup buffer is truncated or invalid.');
  }

  const header = encryptedBuffer.subarray(0, MAGIC_HEADER.length);
  if (!header.equals(MAGIC_HEADER)) {
    throw new Error('Invalid backup magic header; expected MAISENC1.');
  }

  let offset = MAGIC_HEADER.length;
  const salt = encryptedBuffer.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;

  const ciphertext = encryptedBuffer.subarray(offset);
  const key = crypto.scryptSync(getEffectivePassphrase(passphraseOverride), salt, 32);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const decompressed = zlib.gunzipSync(compressed);
  return decompressed.toString('utf-8');
}
