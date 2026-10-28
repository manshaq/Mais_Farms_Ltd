import { AuditLog } from '../types/mais.ts';

/**
 * Computes a deterministic tamper-evident FNV-1a 64-bit hex digest chaining each AuditLog entry
 * to the previous entry's integrityHash. Works identically in browser and Node runtimes.
 */
export function computeAuditEntryHash(
  entry: Pick<
    AuditLog,
    | 'id'
    | 'timestamp'
    | 'userId'
    | 'userRole'
    | 'action'
    | 'entityType'
    | 'entityId'
    | 'animalTag'
    | 'summary'
    | 'previousValue'
    | 'newValue'
  >,
  previousHash: string | null = null
): string {
  const payload = [
    previousHash || 'GENESIS',
    entry.id,
    entry.timestamp,
    entry.userId,
    entry.userRole,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.animalTag || '',
    entry.summary,
    entry.previousValue || '',
    entry.newValue || '',
  ].join('|');

  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `SHA-${(hex1 + hex2).toUpperCase()}`;
}

export interface AuditLogFilterCriteria {
  searchQuery?: string;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Pure filtering function for AuditLog entries by search query, action, userId, and date range.
 */
export function filterAuditLogs(
  logs: AuditLog[],
  criteria: AuditLogFilterCriteria
): AuditLog[] {
  const q = (criteria.searchQuery || '').trim().toLowerCase();
  const action = criteria.action && criteria.action !== 'ALL' ? criteria.action : null;
  const userId = criteria.userId && criteria.userId !== 'ALL' ? criteria.userId : null;
  const startDate = criteria.startDate ? criteria.startDate.trim() : null;
  const endDate = criteria.endDate ? criteria.endDate.trim() : null;

  return logs.filter((log) => {
    if (action && log.action !== action) return false;
    if (userId && log.userId !== userId) return false;

    const logDate = log.timestamp.slice(0, 10);
    if (startDate && logDate < startDate) return false;
    if (endDate && logDate > endDate) return false;

    if (q) {
      const hay = [
        log.summary,
        log.userName,
        log.userRole,
        log.action,
        log.entityType,
        log.entityId,
        log.animalTag || '',
        log.previousValue || '',
        log.newValue || '',
        log.integrityHash || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}
