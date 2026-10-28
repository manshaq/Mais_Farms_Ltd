import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { INITIAL_MAIS_DB } from '../../src/data/seedData.ts';
import { computeAuditEntryHash } from '../../src/domain/farmRules.ts';
import {
  AnimalEvent,
  AuditLog,
  MaisDatabaseState,
  StaffUser,
} from '../../src/types/mais.ts';
import { insertAnimalEvent, insertAuditLog, syncDatabaseToSupabase } from './supabaseService.ts';

const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.npm_lifecycle_event?.startsWith('test') ||
  process.argv.some((arg) => arg.includes('test')) ||
  process.execArgv.some((arg) => arg.includes('test'));

const DATA_DIR = isTestEnv
  ? path.join(os.tmpdir(), `mais_test_${process.pid}`)
  : process.env.VERCEL
  ? path.join('/tmp', 'data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'mais_db.json');

function cleanEnv(val: string | undefined): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '');
}

export const supabaseUrl = cleanEnv(
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL
);

// Strict service-role key for backend PostgreSQL writes (bypasses RLS)
export const supabaseServiceRoleKey = cleanEnv(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY
);

// Anon key for client-facing auth actions (sign in with password)
export const supabaseAnonKey = cleanEnv(
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Server-side database client (STRICTLY service_role key to prevent anon write attempts)
export const supabaseClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

// Isolated auth client for verifying user credentials without contaminating the service-role client
export const supabaseAuthClient =
  supabaseUrl && (supabaseAnonKey || supabaseServiceRoleKey)
    ? createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

// Refuse to boot in production without valid Supabase service role credentials (C1 & H8)
if (process.env.NODE_ENV === 'production' && (!supabaseUrl || !supabaseServiceRoleKey)) {
  console.error('FATAL [MAIS]: Production deployment requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Refusing to boot in production with insecure in-memory or fallback storage.');
  process.exit(1);
}

if (supabaseUrl && supabaseClient) {
  console.log(`✔ [MAIS SUPABASE] Connected to ${supabaseUrl} with verified service_role key.`);
}

export function loadDatabase(): MaisDatabaseState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as MaisDatabaseState;
      if (parsed && Array.isArray(parsed.animals) && Array.isArray(parsed.users)) {
        if (!Array.isArray(parsed.emailLogs)) {
          parsed.emailLogs = [];
        }
        if (!parsed.notificationSettings) {
          parsed.notificationSettings = structuredClone(
            INITIAL_MAIS_DB.notificationSettings!
          );
        }
        if (!parsed.backupSettings) {
          parsed.backupSettings = structuredClone(INITIAL_MAIS_DB.backupSettings!);
        }
        if (!Array.isArray(parsed.backupRuns)) {
          parsed.backupRuns = [];
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading persisted MAIS DB, initializing clean database:', err);
  }
  const initial = structuredClone(INITIAL_MAIS_DB);
  if (process.env.INITIAL_ADMIN_EMAIL?.trim() && initial.users.length > 0) {
    initial.users[0].email = process.env.INITIAL_ADMIN_EMAIL.trim();
  }
  if (process.env.INITIAL_ADMIN_NAME?.trim() && initial.users.length > 0) {
    initial.users[0].fullName = process.env.INITIAL_ADMIN_NAME.trim();
  }
  // Apply INITIAL_ADMIN_PASSWORD from env so the default admin account is never passwordless.
  const initAdminPass = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  if (initAdminPass && initial.users.length > 0) {
    initial.users[0].password = createHash('sha256').update(initAdminPass).digest('hex');
  }
  saveDatabase(initial);
  return initial;
}

export function saveDatabase(state: MaisDatabaseState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${DB_FILE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_FILE_PATH);
  } catch (err) {
    console.error('Failed to persist MAIS DB:', err);
  }
}

export const db: MaisDatabaseState = loadDatabase();

export function resetDatabaseToClean(): MaisDatabaseState {
  const clean = structuredClone(INITIAL_MAIS_DB);
  if (process.env.INITIAL_ADMIN_EMAIL?.trim() && clean.users.length > 0) {
    clean.users[0].email = process.env.INITIAL_ADMIN_EMAIL.trim();
  }
  if (process.env.INITIAL_ADMIN_NAME?.trim() && clean.users.length > 0) {
    clean.users[0].fullName = process.env.INITIAL_ADMIN_NAME.trim();
  }
  const initAdminPass = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  if (initAdminPass && clean.users.length > 0) {
    clean.users[0].password = createHash('sha256').update(initAdminPass).digest('hex');
  }
  for (const key of Object.keys(db)) {
    delete (db as any)[key];
  }
  Object.assign(db, clean);
  saveDatabase(db);
  return db;
}

export function restoreDatabaseFromSnapshot(newState: MaisDatabaseState): {
  rollbackSnapshotFile: string;
} {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackSnapshotFile = `mais_db_pre_restore_${stamp}.json`;
  const rollbackFullPath = path.join(DATA_DIR, rollbackSnapshotFile);
  try {
    fs.writeFileSync(rollbackFullPath, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Warning: could not write pre-restore rollback file:', err);
  }

  const existingBackupRuns = Array.isArray(db.backupRuns) ? [...db.backupRuns] : [];
  const sanitized = structuredClone(newState);
  if (!Array.isArray(sanitized.emailLogs)) {
    sanitized.emailLogs = [];
  }
  if (!sanitized.notificationSettings) {
    sanitized.notificationSettings = structuredClone(INITIAL_MAIS_DB.notificationSettings!);
  }
  if (!sanitized.backupSettings) {
    sanitized.backupSettings = structuredClone(INITIAL_MAIS_DB.backupSettings!);
  }
  if (!Array.isArray(sanitized.backupRuns) || sanitized.backupRuns.length === 0) {
    sanitized.backupRuns = existingBackupRuns;
  }
  Object.assign(db, sanitized);
  saveDatabase(db);
  syncDatabaseToSupabase(db).catch((err) => {
    console.warn('⚠️ [MAIS DB] Supabase re-sync after restore warning:', err?.message || err);
  });
  return { rollbackSnapshotFile };
}

export function appendAudit(
  user: StaffUser,
  action: string,
  entityType: string,
  entityId: string,
  animalTag: string | null,
  summary: string,
  previousValue: string | null = null,
  newValue: string | null = null
): AuditLog {
  const previousEntry = db.auditLogs[0];
  const previousHash = previousEntry?.integrityHash || null;
  const baseEntry = {
    id: `AUD-${Date.now()}-${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    action,
    entityType,
    entityId,
    animalTag,
    summary,
    previousValue,
    newValue,
  };
  const integrityHash = computeAuditEntryHash(baseEntry, previousHash);
  const entry: AuditLog = {
    ...baseEntry,
    previousHash,
    integrityHash,
  };
  db.auditLogs.unshift(entry);
  insertAuditLog(entry).catch((err) => {
    console.warn('⚠️ [MAIS DB] Supabase audit log persistence warning:', err?.message || err);
  });
  return entry;
}

export function appendAnimalEvent(
  animalId: string,
  eventDate: string,
  eventType: AnimalEvent['eventType'],
  title: string,
  summary: string,
  referenceId: string,
  costNgn: number | null,
  recordedBy: string,
  // Optional: when the referenced animal was itself just created in this same
  // request (its own Supabase insert still in flight), pass that pending
  // promise so this event's FK-constrained insert waits for it instead of
  // racing it.
  afterAnimalPersisted?: Promise<unknown>
): AnimalEvent {
  const evt: AnimalEvent = {
    id: `EVT-${Date.now()}-${randomUUID().slice(0, 8)}`,
    animalId,
    eventDate,
    eventType,
    title,
    summary,
    referenceId,
    costNgn,
    recordedBy,
  };
  db.animalEvents.push(evt);
  (afterAnimalPersisted || Promise.resolve())
    .catch(() => {})
    .then(() => insertAnimalEvent(evt))
    .catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase animal event persistence warning:', err?.message || err);
    });
  return evt;
}

/**
 * Generates an collision-free, year-dynamic monotonic expense transaction code (M3).
 */
export function generateExpenseTransactionCode(existingExpenses: { transactionCode?: string }[]): string {
  const currentYear = new Date().getFullYear();
  let maxSeq = 100;
  const regex = new RegExp(`^MAIS-EXP-${currentYear}-(\\d+)$`);
  for (const exp of existingExpenses) {
    if (!exp.transactionCode) continue;
    const match = exp.transactionCode.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  return `MAIS-EXP-${currentYear}-${maxSeq + 1}`;
}

/**
 * Generates a monotonic Staff User ID that never collides after deletions (M3).
 */
export function generateStaffUserId(existingUsers: { id: string }[]): string {
  let maxSeq = 0;
  for (const u of existingUsers) {
    const match = u.id.match(/^USR-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  const next = maxSeq + 1;
  return `USR-${next.toString().padStart(2, '0')}`;
}

/**
 * Generates a monotonic Supplier ID that never collides after deletions (M3).
 */
export function generateSupplierId(existingSuppliers: { id: string }[]): string {
  let maxSeq = 0;
  for (const s of existingSuppliers) {
    const match = s.id.match(/^SUP-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  return `SUP-${maxSeq + 1}`;
}
