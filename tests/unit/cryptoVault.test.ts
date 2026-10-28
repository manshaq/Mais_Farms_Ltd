import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compressAndEncryptBackup,
  computeSha256Hex,
  decryptAndDecompressBackup,
  isEncryptionKeyConfigured,
} from '../../server/backup/cryptoVault';

test('computeSha256Hex produces consistent deterministic hash', () => {
  const hash1 = computeSha256Hex('MAIS LTD LIVESTOCK DATA');
  const hash2 = computeSha256Hex('MAIS LTD LIVESTOCK DATA');
  const hash3 = computeSha256Hex('DIFFERENT DATA');

  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});

test('compressAndEncryptBackup & decryptAndDecompressBackup round-trip successfully', () => {
  const samplePayload = JSON.stringify({
    farm: 'MAIS LTD',
    currency: 'NGN',
    timestamp: '2026-10-24T12:00:00Z',
    records: [
      { id: 'ANM-1001', tag: 'MAIS-014', breed: 'Holstein Friesian' },
      { id: 'ANM-1002', tag: 'MAIS-022', breed: 'White Fulani' },
    ],
  });

  const testPassphrase = 'TestSecurePassphraseForMaisLtdVault2026!';
  const artifact = compressAndEncryptBackup(samplePayload, testPassphrase);

  assert.ok(Buffer.isBuffer(artifact.encryptedBuffer));
  assert.equal(artifact.cipher, 'AES-256-GCM');
  assert.ok(artifact.encryptedSizeBytes > 50);
  assert.equal(artifact.sha256Checksum.length, 64);

  const decryptedPlaintext = decryptAndDecompressBackup(artifact.encryptedBuffer, testPassphrase);
  assert.equal(decryptedPlaintext, samplePayload);

  const parsed = JSON.parse(decryptedPlaintext);
  assert.equal(parsed.farm, 'MAIS LTD');
  assert.equal(parsed.records.length, 2);
});

test('decryptAndDecompressBackup rejects wrong passphrase', () => {
  const samplePayload = JSON.stringify({ secret: 'livestock-confidential' });
  const correctKey = 'CorrectVaultKey32CharactersLongHere!';
  const wrongKey = 'WrongKeyThatShouldFailDecryptionHere!';

  const artifact = compressAndEncryptBackup(samplePayload, correctKey);

  assert.throws(
    () => {
      decryptAndDecompressBackup(artifact.encryptedBuffer, wrongKey);
    },
    (err: any) => {
      return (
        err instanceof Error &&
        (err.message.includes('authentication') ||
          err.message.includes('failed') ||
          err.message.includes('Unsupported state') ||
          err.message.includes('bad decrypt'))
      );
    }
  );
});

test('decryptAndDecompressBackup detects tampered ciphertext payload', () => {
  const samplePayload = JSON.stringify({ integrity: 'critical' });
  const passphrase = 'TamperProofKeyForTestingCryptoVault2026!';

  const artifact = compressAndEncryptBackup(samplePayload, passphrase);
  const tamperedBuffer = Buffer.from(artifact.encryptedBuffer);

  // Flip a byte in the encrypted ciphertext region
  if (tamperedBuffer.length > 50) {
    tamperedBuffer[45] ^= 0xff;
  }

  assert.throws(() => {
    decryptAndDecompressBackup(tamperedBuffer, passphrase);
  });
});

test('isEncryptionKeyConfigured reports status based on environment variable', () => {
  const originalKey = process.env.BACKUP_ENCRYPTION_KEY;
  try {
    process.env.BACKUP_ENCRYPTION_KEY = 'SecretKeyForMaisLivestockVault2026';
    assert.equal(isEncryptionKeyConfigured(), true);

    process.env.BACKUP_ENCRYPTION_KEY = '';
    assert.equal(isEncryptionKeyConfigured(), false);
  } finally {
    process.env.BACKUP_ENCRYPTION_KEY = originalKey;
  }
});
