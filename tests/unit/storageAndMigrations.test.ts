import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import {
  getAvailableMigrations,
  validateMigrations,
  inspectMigrationStatus,
  getConsolidatedMigrationSql,
} from '../../server/db/migrationRunner.ts';
import { computeContentIntegrityHash } from '../../src/domain/farmRules.ts';
import { apiRouter } from '../../server/api/index.ts';
import { db } from '../../server/db/store.ts';

const TEST_ADMIN_EMAIL = 'belloaliyu808@gmail.com';
const TEST_ADMIN_PASSWORD = 'TestAdmin!Secure99';
const TEST_ADMIN_PASSWORD_HASH = createHash('sha256').update(TEST_ADMIN_PASSWORD).digest('hex');

function seedTestAdminPassword() {
  const admin = db.users.find((u) => u.email.toLowerCase() === TEST_ADMIN_EMAIL);
  if (admin) {
    admin.password = TEST_ADMIN_PASSWORD_HASH;
  }
}

function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', apiRouter);
  return app;
}

test('Migration Runner discovers, parses, and validates all SQL migrations', () => {
  const migrations = getAvailableMigrations();
  assert.ok(migrations.length >= 3, `Expected at least 3 migrations, found ${migrations.length}`);

  // Migration 001, 002, 003 checks
  const m1 = migrations.find((m) => m.version === '20261024000001');
  const m2 = migrations.find((m) => m.version === '20261024000002');
  const m3 = migrations.find((m) => m.version === '20261024000003');

  assert.ok(m1, 'Migration 20261024000001 must exist');
  assert.ok(m2, 'Migration 20261024000002 must exist');
  assert.ok(m3, 'Migration 20261024000003 must exist');

  assert.ok(m1.sql.includes('CREATE TABLE IF NOT EXISTS public.animals'));
  assert.ok(m3.sql.includes('CREATE TABLE IF NOT EXISTS public.attachments'));
  assert.ok(m3.sql.includes('animal-photos'));
  assert.ok(m3.sql.includes('receipt-documents'));

  const validation = validateMigrations(migrations);
  assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join(', ')}`);
  assert.equal(validation.errors.length, 0);

  const status = inspectMigrationStatus();
  assert.equal(status.totalMigrations, migrations.length);
  assert.equal(status.migrations.length, migrations.length);

  const consolidated = getConsolidatedMigrationSql();
  assert.ok(consolidated.includes('CONSOLIDATED DATABASE MIGRATION SCRIPT'));
  assert.ok(consolidated.includes('20261024000003: storage_and_attachments'));
});

test('Attachment SHA-256 integrity hash is deterministic and tamper-detecting', () => {
  const payload1 = 'cow_photo.jpg|Animal|ANM-1001|250|base64samplecontent';
  const payload2 = 'cow_photo.jpg|Animal|ANM-1001|250|base64samplecontent';
  const payloadTampered = 'cow_photo.jpg|Animal|ANM-1001|250|tamperedcontent';

  const hash1 = computeContentIntegrityHash(payload1);
  const hash2 = computeContentIntegrityHash(payload2);
  const hashTampered = computeContentIntegrityHash(payloadTampered);

  assert.equal(hash1, hash2, 'Identical payload must produce identical hash');
  assert.notEqual(hash1, hashTampered, 'Modified payload must produce different hash');
  assert.ok(hash1.startsWith('SHA256-'), 'Hash must start with SHA256- prefix');
  assert.equal(hash1.length, 39, 'Content integrity signature has standard format');
});

test('API enforces RBAC and validation on /api/attachments', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // 1. Unauthenticated request rejected
    const unauthRes = await fetch(`http://127.0.0.1:${port}/api/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'test.pdf' }),
    });
    assert.equal(unauthRes.status, 401);

    // 2. Login as Admin
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    assert.equal(loginRes.status, 200);
    const { token } = await loginRes.json();

    // 3. Reject missing fileName
    const missingNameRes = await fetch(`http://127.0.0.1:${port}/api/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        animalId: 'ANM-1001',
      }),
    });
    assert.equal(missingNameRes.status, 400);

    // 4. Ensure test animal exists
    let targetAnimal = db.animals[0];
    if (!targetAnimal) {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/animals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tagNumber: 'TEST-TAG-01',
          name: 'Test Cow',
          type: 'Cow',
          sex: 'Female',
          breed: 'Holstein',
          dateOfBirth: '2023-01-01',
          acquisitionType: 'Purchased',
          acquisitionDate: '2025-01-01',
          herdGroup: 'Milking Herd',
          location: 'Barn 1',
        }),
      });
      assert.equal(createRes.status, 201);
      const created = await createRes.json();
      targetAnimal = created.animal;
    }
    assert.ok(targetAnimal, 'Must have at least one test animal');

    const uploadRes = await fetch(`http://127.0.0.1:${port}/api/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        animalId: targetAnimal.id,
        entityType: 'Animal',
        entityId: targetAnimal.id,
        fileName: 'registration_photo.png',
        fileType: 'Photo',
        fileSizeKb: 450,
        notes: 'Photo taken at intake pen',
        mimeType: 'image/png',
      }),
    });
    assert.equal(uploadRes.status, 201);
    const uploadBody = await uploadRes.json();
    assert.ok(uploadBody.attachment);
    assert.equal(uploadBody.attachment.animalId, targetAnimal.id);
    assert.equal(uploadBody.attachment.fileName, 'registration_photo.png');
    assert.ok(uploadBody.attachment.sha256Hash);

    // 5. Query signed-url endpoint
    const signedUrlRes = await fetch(
      `http://127.0.0.1:${port}/api/attachments/${uploadBody.attachment.id}/signed-url`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert.equal(signedUrlRes.status, 200);
    const signedUrlBody = await signedUrlRes.json();
    assert.ok(signedUrlBody.fileName);
    assert.ok(signedUrlBody.sha256Hash);
  } finally {
    server.close();
  }
});
