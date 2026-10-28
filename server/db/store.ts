import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { INITIAL_MAIS_DB } from '../../src/data/seedData.ts';
import { computeAuditEntryHash } from '../../src/domain/farmRules.ts';
import {
  AnimalEvent,
  AuditLog,
  MaisDatabaseState,
  StaffUser,
} from '../../src/types/mais.ts';

const DATA_DIR = process.env.VERCEL
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

export const supabaseKey = cleanEnv(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY
);

export const supabaseClient =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

if (supabaseUrl && supabaseClient) {
  const isServiceRole = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY
  );
  console.log(
    `✔ [MAIS SUPABASE] Connected to ${supabaseUrl} (${isServiceRole ? 'service_role key' : 'anon key'}).`
  );
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
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
  recordedBy: string
): AnimalEvent {
  const evt: AnimalEvent = {
    id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
  return evt;
}
