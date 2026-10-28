import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createExpressApp } from '../../server/app';
import { db } from '../../server/db/store';

const TEST_ADMIN_EMAIL = 'belloaliyu808@gmail.com';
const TEST_ADMIN_PASSWORD = 'TestAdmin!Secure99';
const TEST_ADMIN_PASSWORD_HASH = createHash('sha256').update(TEST_ADMIN_PASSWORD).digest('hex');

function createTestApp() {
  return createExpressApp();
}

/**
 * Ensures the test admin user has a hashed password before each auth-dependent test.
 */
function seedTestAdminPassword() {
  const admin = db.users.find((u) => u.email.toLowerCase() === TEST_ADMIN_EMAIL);
  if (admin) {
    admin.password = TEST_ADMIN_PASSWORD_HASH;
  }
}

test('API rejects unauthenticated access to /api/state', async () => {
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.ok(json.error);
  } finally {
    server.close();
  }
});

test('API rejects x-staff-user-id header (auth bypass removed)', async () => {
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // The x-staff-user-id bypass was removed; this must return 401 now
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { 'x-staff-user-id': 'USR-01' },
    });
    assert.equal(res.status, 401, 'x-staff-user-id header must no longer bypass auth');
  } finally {
    server.close();
  }
});

test('API permits valid admin login via /api/auth/login', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.user.role, 'Admin');
    assert.equal(body.user.email, TEST_ADMIN_EMAIL);
    assert.ok(!body.user.password, 'Password must not be returned in the API response');

    // Verify token can now access /api/state
    const stateRes = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    assert.equal(stateRes.status, 200);
    const state = await stateRes.json();
    assert.ok(state.db);
    assert.ok(state.computed);
    assert.ok(Array.isArray(state.computed.productStocks));
  } finally {
    server.close();
  }
});

test('API rejects login with incorrect password', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: 'wrongpassword',
      }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    server.close();
  }
});

test('API returns Supabase schema SQL for authorized users', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // Login to get admin token
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { token } = await loginRes.json();

    const schemaRes = await fetch(`http://127.0.0.1:${port}/api/supabase-schema`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(schemaRes.status, 200);
    const body = await schemaRes.json();
    assert.ok(body.sql);
    assert.ok(body.sql.includes('CREATE TABLE'));
  } finally {
    server.close();
  }
});

test('API permits authorized user to register a new animal', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { token } = await loginRes.json();

    const uniqueTag = `TEST-TAG-${Date.now().toString().slice(-4)}`;
    const createRes = await fetch(`http://127.0.0.1:${port}/api/animals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tagNumber: uniqueTag,
        name: 'Thunderbolt',
        type: 'Bull',
        sex: 'Male',
        breed: 'Simmental',
        dateOfBirth: '2023-01-15',
        acquisitionType: 'Purchased',
        acquisitionDate: '2023-02-01',
        purchasePrice: 450000,
        herdGroup: 'Breeding Bulls',
        location: 'North Pasture',
        initialWeightKg: 380,
      }),
    });

    assert.equal(createRes.status, 201);
    const body = await createRes.json();
    assert.ok(body.animal);
    assert.equal(body.animal.name, 'Thunderbolt');
    assert.equal(body.animal.currentTag, uniqueTag);
    assert.ok(body.identifier);
    assert.equal(body.identifier.tagNumber, uniqueTag);

    // Verify animal is found in animal search
    const getRes = await fetch(`http://127.0.0.1:${port}/api/animals/by-tag/${encodeURIComponent(uniqueTag)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.equal(fetched.animal.name, 'Thunderbolt');
  } finally {
    server.close();
  }
});

test('API permits admin to soft-delete a staff user, revokes active sessions, and blocks login', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // 1. Admin login
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { token: adminToken } = await loginRes.json();

    // 2. Create a temporary staff user
    const tempEmail = `temp.worker.${Date.now()}@mais.com`;
    const tempPassword = 'TempWorkerPass123';
    const createStaffRes = await fetch(`http://127.0.0.1:${port}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        fullName: 'Temporary Worker',
        email: tempEmail,
        password: tempPassword,
        role: 'Read-Only Staff',
        title: 'Assistant Observer',
      }),
    });
    assert.equal(createStaffRes.status, 201);
    const { user: createdUser } = await createStaffRes.json();
    assert.ok(createdUser.id);

    // 3. Log in as the new user to get an active session
    const staffLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: tempEmail,
        password: tempPassword,
      }),
    });
    assert.equal(staffLoginRes.status, 200);
    const { token: staffToken } = await staffLoginRes.json();

    // Verify staff token can access state
    const staffStateRes = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffStateRes.status, 200);

    // 4. Soft-delete the staff user as admin
    const deleteRes = await fetch(`http://127.0.0.1:${port}/api/users/${encodeURIComponent(createdUser.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deleteRes.status, 200);
    const deleteBody = await deleteRes.json();
    assert.equal(deleteBody.success, true);
    assert.equal(deleteBody.user.deleted, true);
    assert.equal(deleteBody.user.status, 'Suspended');

    // 5. Verify the staff user's previous session token is now rejected
    const revokedStateRes = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(revokedStateRes.status, 401, 'Revoked token must return 401');

    // 6. Verify subsequent login attempt by soft-deleted user is blocked with 403
    const blockedLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: tempEmail,
        password: tempPassword,
      }),
    });
    assert.equal(blockedLoginRes.status, 403, 'Deleted user login must be rejected with 403');
  } finally {
    server.close();
  }
});

test('API rejects direct user ID bypass in Bearer header (C1 security fix)', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // Attempt authentication with raw StaffUser ID in Authorization header
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { Authorization: 'Bearer USR-01' },
    });
    assert.equal(res.status, 401, 'Bearer USR-01 must return 401 Unauthorized');
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    server.close();
  }
});

test('API rejects direct user ID bypass in Cookie (C1 security fix)', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // Attempt authentication with raw StaffUser ID in auth_token cookie
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { Cookie: 'auth_token=USR-01' },
    });
    assert.equal(res.status, 401, 'Cookie: auth_token=USR-01 must return 401 Unauthorized');
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    server.close();
  }
});

test('API permits 120+ authenticated requests without triggering 429 rate limit (C4)', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // 1. Login to obtain valid session token
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

    // 2. Perform 120 rapid requests to /api/state
    const requests = Array.from({ length: 120 }, () =>
      fetch(`http://127.0.0.1:${port}/api/state`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);

    assert.ok(
      statuses.every((s) => s === 200),
      `Expected all 120 authenticated requests to return 200, got: ${statuses.filter((s) => s !== 200).join(', ')}`
    );
  } finally {
    server.close();
  }
});

test('API returns JSON error on malformed JSON payload (M4 error contract)', async () => {
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalid": unquoted_value}',
    });
    assert.equal(res.status, 400);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), 'Error response must be application/json');
    const body = await res.json();
    assert.ok(body.error, 'Error object must be returned in JSON format');
  } finally {
    server.close();
  }
});

test('API redacts auditLogs and backupSettings in /api/state for non-Admin users (M5)', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // 1. Login as Admin
    const adminLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { token: adminToken } = await adminLoginRes.json();

    // 2. Create Read-Only Staff user
    const roEmail = `ro_staff_${Date.now()}@example.com`;
    const roPassword = 'StaffReadOnlyPassword!1';
    await fetch(`http://127.0.0.1:${port}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        fullName: 'Read Only Observer',
        email: roEmail,
        password: roPassword,
        role: 'Read-Only Staff',
        title: 'Observer',
      }),
    });

    // 3. Login as Read-Only Staff
    const roLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: roEmail,
        password: roPassword,
      }),
    });
    const { token: roToken } = await roLoginRes.json();

    // 4. Fetch state as Read-Only Staff
    const stateRes = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { Authorization: `Bearer ${roToken}` },
    });
    assert.equal(stateRes.status, 200);
    const body = await stateRes.json();

    // Verify sensitive admin datasets are redacted
    assert.deepEqual(body.db.auditLogs, [], 'Non-admin users must receive empty auditLogs');
    assert.deepEqual(body.db.emailLogs, [], 'Non-admin users must receive empty emailLogs');
    assert.equal(body.db.backupSettings, null, 'Non-admin users must receive null backupSettings');
    assert.deepEqual(body.db.backupRuns, [], 'Non-admin users must receive empty backupRuns');
  } finally {
    server.close();
  }
});

test('API blocks /api/reset-data with 403 when ALLOW_RESET is not enabled', async () => {
  seedTestAdminPassword();
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const adminLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
      }),
    });
    const { token: adminToken } = await adminLoginRes.json();

    delete process.env.ALLOW_RESET;
    const res = await fetch(`http://127.0.0.1:${port}/api/reset-data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 403, 'Reset data must return 403 when ALLOW_RESET is not true');
  } finally {
    server.close();
  }
});

