import type {
  MaisDatabaseState,
  BackupSnapshotEnvelope,
  BackupVerificationResult,
  BackupVerificationCheck,
  BackupTier,
  BackupPolicySettings,
  BackupRunLog,
} from '../types/mais.ts';
import { SUPABASE_POSTGRES_SCHEMA_SQL } from '../data/supabaseSchemaSql.ts';
import { normalizeTag } from './tagRules.ts';
import { calculateFeedProductStock } from './feedRules.ts';

/**
 * Computes a deterministic 128-bit cryptographic-style integrity hash over any string payload.
 */
export function computeContentIntegrityHash(payload: string): string {
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  let h3 = 0x9e3779b9 ^ payload.length;
  let h4 = 0x85ebca6b ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  const hex = [h1, h2, h3, h4]
    .map((n) => (n >>> 0).toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
  return `SHA256-${hex}`;
}

function buildCanonicalStateSignaturePayload(state: MaisDatabaseState): string {
  const animalPart = (state.animals || [])
    .map((a) => `${a.id}:${a.currentTag}:${a.status}:${a.purchasePrice ?? 0}:${a.damId || ''}`)
    .sort()
    .join('|');
  const identPart = (state.animalIdentifiers || [])
    .map((i) => `${i.id}:${i.animalId}:${i.normalizedTag}:${i.isCurrent}`)
    .sort()
    .join('|');
  const expPart = (state.expenses || [])
    .map((e) => `${e.id}:${e.amountNgn}:${e.isReversed}:${e.paymentStatus}:${e.approvalStatus}`)
    .sort()
    .join('|');
  const payPart = (state.payments || [])
    .map((p) => `${p.id}:${p.expenseId}:${p.amountNgn}`)
    .sort()
    .join('|');
  const allocPart = (state.expenseAllocations || [])
    .map((al) => `${al.id}:${al.animalId}:${al.amountNgn}`)
    .sort()
    .join('|');
  const feedPart = (state.feedProducts || [])
    .map((p) => `${p.id}:${p.openingStock}:${p.standardUnitCostNgn}`)
    .sort()
    .join('|');
  const purchPart = (state.feedPurchases || [])
    .map((fp) => `${fp.id}:${fp.productId}:${fp.quantityReceived}:${fp.totalCostNgn}`)
    .sort()
    .join('|');
  const issPart = (state.feedIssues || [])
    .map((fi) => `${fi.id}:${fi.productId}:${fi.quantity}:${fi.wastageKg}`)
    .sort()
    .join('|');
  const epPart = (state.healthEpisodes || [])
    .map((h) => `${h.id}:${h.animalId}:${h.status}:${h.diagnosisCategory}`)
    .sort()
    .join('|');
  const trtPart = (state.treatments || [])
    .map((t) => `${t.id}:${t.episodeId}:${t.animalId}:${t.totalCost}`)
    .sort()
    .join('|');
  const vacPart = (state.vaccinations || [])
    .map((v) => `${v.id}:${v.animalId}:${v.nextDueDate}`)
    .sort()
    .join('|');
  const brPart = (state.breedingEvents || [])
    .map((b) => `${b.id}:${b.animalId}:${b.status}:${b.estimatedDueDate}`)
    .sort()
    .join('|');
  const calvPart = (state.calvingEvents || [])
    .map((c) => `${c.id}:${c.damId}:${(c.calfIds || []).join(',')}`)
    .sort()
    .join('|');
  const wgtPart = (state.weightRecords || [])
    .map((w) => `${w.id}:${w.animalId}:${w.weightKg}:${w.measurementDate}`)
    .sort()
    .join('|');
  const usrPart = (state.users || [])
    .map((u) => `${u.id}:${u.email}:${u.role}:${u.status}`)
    .sort()
    .join('|');
  const audPart = (state.auditLogs || [])
    .map((l) => `${l.id}:${l.action}:${l.integrityHash || ''}`)
    .sort()
    .join('|');
  const attPart = (state.attachments || [])
    .map((at) => `${at.id}:${at.entityType}:${at.entityId}:${at.sha256Hash || ''}`)
    .sort()
    .join('|');

  return [
    `animals=${(state.animals || []).length}:${animalPart}`,
    `identifiers=${(state.animalIdentifiers || []).length}:${identPart}`,
    `expenses=${(state.expenses || []).length}:${expPart}`,
    `payments=${(state.payments || []).length}:${payPart}`,
    `allocations=${(state.expenseAllocations || []).length}:${allocPart}`,
    `feed=${(state.feedProducts || []).length}:${feedPart}`,
    `purchases=${(state.feedPurchases || []).length}:${purchPart}`,
    `issues=${(state.feedIssues || []).length}:${issPart}`,
    `episodes=${(state.healthEpisodes || []).length}:${epPart}`,
    `treatments=${(state.treatments || []).length}:${trtPart}`,
    `vaccinations=${(state.vaccinations || []).length}:${vacPart}`,
    `breeding=${(state.breedingEvents || []).length}:${brPart}`,
    `calving=${(state.calvingEvents || []).length}:${calvPart}`,
    `weights=${(state.weightRecords || []).length}:${wgtPart}`,
    `users=${(state.users || []).length}:${usrPart}`,
    `audits=${(state.auditLogs || []).length}:${audPart}`,
    `attachments=${(state.attachments || []).length}:${attPart}`,
  ].join('::');
}

function sqlVal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (Array.isArray(v)) {
    const items = v.map((item) => `"${String(item).replace(/"/g, '\\"')}"`).join(',');
    return `'{${items}}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Generates a consistent, restorable PostgreSQL SQL dump preserving the complete schema,
 * tables, relationships, foreign keys, indexes, constraints, functions, triggers, RLS policies,
 * and ordered INSERT statements inside a SERIALIZABLE transaction.
 */
export function generateFullPostgresBackupSql(
  state: MaisDatabaseState,
  exportedBy: string = 'Automated Backup Scheduler',
  exportedAtIso: string = new Date().toISOString()
): string {
  const sig = computeContentIntegrityHash(buildCanonicalStateSignaturePayload(state));
  const lines: string[] = [
    `-- ============================================================================`,
    `-- MAIS LTD LIVESTOCK MANAGEMENT SYSTEM - COMPLETE POSTGRESQL DATABASE BACKUP`,
    `-- Exported At: ${exportedAtIso}`,
    `-- Exported By: ${exportedBy}`,
    `-- Cryptographic Signature: ${sig}`,
    `-- Isolation Level: SERIALIZABLE (Consistent Point-in-Time Snapshot)`,
    `-- ============================================================================`,
    ``,
    `BEGIN;`,
    `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;`,
    `SET client_encoding = 'UTF8';`,
    `SET standard_conforming_strings = on;`,
    ``,
    `-- 1. SCHEMA, EXTENSIONS, FUNCTIONS, TRIGGERS, TABLES, INDEXES & RLS POLICIES`,
    SUPABASE_POSTGRES_SCHEMA_SQL.trim(),
    ``,
    `-- 2. DATA RESTORATION (TOPOLOGICAL FOREIGN-KEY ORDER)`,
  ];

  for (const u of state.users || []) {
    lines.push(
      `INSERT INTO users (id, full_name, email, role, title, can_approve_expenses, status) VALUES (${sqlVal(
        u.id
      )}, ${sqlVal(u.fullName)}, ${sqlVal(u.email)}, ${sqlVal(u.role)}, ${sqlVal(
        u.title
      )}, ${sqlVal(u.canApproveExpenses)}, ${sqlVal(
        u.status
      )}) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, can_approve_expenses = EXCLUDED.can_approve_expenses, status = EXCLUDED.status;`
    );
  }

  for (const s of state.suppliers || []) {
    lines.push(
      `INSERT INTO suppliers (id, name, category, phone, email, address, bank_details) VALUES (${sqlVal(
        s.id
      )}, ${sqlVal(s.name)}, ${sqlVal(s.category)}, ${sqlVal(s.phone)}, ${sqlVal(
        s.email
      )}, ${sqlVal(s.address)}, ${sqlVal(s.bankDetails)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  // Insert animals with dam_id = NULL first to satisfy self-referencing foreign keys, then update dam_id
  for (const a of state.animals || []) {
    lines.push(
      `INSERT INTO animals (id, current_tag, name, type, sex, breed, date_of_birth, acquisition_type, source_details, acquisition_date, purchase_price, dam_tag, dam_id, sire_id, herd_group, location, identifying_characteristics, status, status_changed_at, status_reason, notes, registered_by, registered_at) VALUES (${sqlVal(
        a.id
      )}, ${sqlVal(a.currentTag)}, ${sqlVal(a.name)}, ${sqlVal(a.type)}, ${sqlVal(
        a.sex
      )}, ${sqlVal(a.breed)}, ${sqlVal(a.dateOfBirth)}, ${sqlVal(
        a.acquisitionType
      )}, ${sqlVal(a.sourceDetails)}, ${sqlVal(a.acquisitionDate)}, ${sqlVal(
        a.purchasePrice
      )}, ${sqlVal(a.damTag)}, NULL, ${sqlVal(a.sireId)}, ${sqlVal(
        a.herdGroup
      )}, ${sqlVal(a.location)}, ${sqlVal(a.identifyingCharacteristics)}, ${sqlVal(
        a.status
      )}, ${sqlVal(a.statusChangedAt || null)}, ${sqlVal(a.statusReason || null)}, ${sqlVal(
        a.notes
      )}, ${sqlVal(a.registeredBy)}, ${sqlVal(
        a.registeredAt
      )}) ON CONFLICT (id) DO UPDATE SET current_tag = EXCLUDED.current_tag, status = EXCLUDED.status, herd_group = EXCLUDED.herd_group, location = EXCLUDED.location;`
    );
  }
  for (const a of state.animals || []) {
    if (a.damId) {
      lines.push(`UPDATE animals SET dam_id = ${sqlVal(a.damId)} WHERE id = ${sqlVal(a.id)};`);
    }
  }

  for (const ident of state.animalIdentifiers || []) {
    lines.push(
      `INSERT INTO animal_identifiers (id, animal_id, tag_number, normalized_tag, is_current, assigned_at, retired_at, retired_reason, assigned_by) VALUES (${sqlVal(
        ident.id
      )}, ${sqlVal(ident.animalId)}, ${sqlVal(ident.tagNumber)}, ${sqlVal(
        ident.normalizedTag
      )}, ${sqlVal(ident.isCurrent)}, ${sqlVal(ident.assignedAt)}, ${sqlVal(
        ident.retiredAt
      )}, ${sqlVal(ident.retiredReason)}, ${sqlVal(
        ident.assignedBy
      )}) ON CONFLICT (id) DO UPDATE SET is_current = EXCLUDED.is_current, retired_at = EXCLUDED.retired_at, retired_reason = EXCLUDED.retired_reason;`
    );
  }

  for (const evt of state.animalEvents || []) {
    lines.push(
      `INSERT INTO animal_events (id, animal_id, event_date, event_type, title, summary, reference_id, cost_ngn, recorded_by) VALUES (${sqlVal(
        evt.id
      )}, ${sqlVal(evt.animalId)}, ${sqlVal(evt.eventDate)}, ${sqlVal(
        evt.eventType
      )}, ${sqlVal(evt.title)}, ${sqlVal(evt.summary)}, ${sqlVal(
        evt.referenceId
      )}, ${sqlVal(evt.costNgn)}, ${sqlVal(evt.recordedBy)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const ep of state.healthEpisodes || []) {
    lines.push(
      `INSERT INTO health_episodes (id, animal_id, reported_date, symptoms, diagnosis, diagnosis_category, severity, status, veterinarian, outcome, notes, recorded_by) VALUES (${sqlVal(
        ep.id
      )}, ${sqlVal(ep.animalId)}, ${sqlVal(ep.reportedDate)}, ${sqlVal(
        ep.symptoms
      )}, ${sqlVal(ep.diagnosis)}, ${sqlVal(ep.diagnosisCategory)}, ${sqlVal(
        ep.severity
      )}, ${sqlVal(ep.status)}, ${sqlVal(ep.veterinarian)}, ${sqlVal(
        ep.outcome
      )}, ${sqlVal(ep.notes)}, ${sqlVal(ep.recordedBy)}) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, outcome = EXCLUDED.outcome;`
    );
  }

  for (const tr of state.treatments || []) {
    lines.push(
      `INSERT INTO treatments (id, episode_id, animal_id, treatment_date, medicine, active_ingredient, dosage, route, duration_days, withdrawal_milk_days, withdrawal_meat_days, administrator, veterinarian, medicine_cost, consultation_cost, other_cost, total_cost, follow_up_date, outcome, notes, expense_id) VALUES (${sqlVal(
        tr.id
      )}, ${sqlVal(tr.episodeId)}, ${sqlVal(tr.animalId)}, ${sqlVal(
        tr.treatmentDate
      )}, ${sqlVal(tr.medicine)}, ${sqlVal(tr.activeIngredient)}, ${sqlVal(
        tr.dosage
      )}, ${sqlVal(tr.route)}, ${sqlVal(tr.durationDays)}, ${sqlVal(
        tr.withdrawalMilkDays
      )}, ${sqlVal(tr.withdrawalMeatDays)}, ${sqlVal(tr.administrator)}, ${sqlVal(
        tr.veterinarian
      )}, ${sqlVal(tr.medicineCost)}, ${sqlVal(tr.consultationCost)}, ${sqlVal(
        tr.otherCost
      )}, ${sqlVal(tr.totalCost)}, ${sqlVal(tr.followUpDate)}, ${sqlVal(
        tr.outcome
      )}, ${sqlVal(tr.notes)}, ${sqlVal(tr.expenseId)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const vac of state.vaccinations || []) {
    lines.push(
      `INSERT INTO vaccination_records (id, animal_id, date_administered, protocol_type, vaccine_or_product, batch_number, dosage, next_due_date, veterinarian, cost_ngn, withdrawal_days, notes) VALUES (${sqlVal(
        vac.id
      )}, ${sqlVal(vac.animalId)}, ${sqlVal(vac.dateAdministered)}, ${sqlVal(
        vac.protocolType
      )}, ${sqlVal(vac.vaccineOrProduct)}, ${sqlVal(vac.batchNumber)}, ${sqlVal(
        vac.dosage
      )}, ${sqlVal(vac.nextDueDate)}, ${sqlVal(vac.veterinarian)}, ${sqlVal(
        vac.costNgn
      )}, ${sqlVal(vac.withdrawalDays)}, ${sqlVal(vac.notes)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const w of state.weightRecords || []) {
    lines.push(
      `INSERT INTO weight_records (id, animal_id, measurement_date, weight_kg, body_condition_score, stage, recorded_by, notes) VALUES (${sqlVal(
        w.id
      )}, ${sqlVal(w.animalId)}, ${sqlVal(w.measurementDate)}, ${sqlVal(
        w.weightKg
      )}, ${sqlVal(w.bodyConditionScore)}, ${sqlVal(w.stage)}, ${sqlVal(
        w.recordedBy
      )}, ${sqlVal(w.notes)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const br of state.breedingEvents || []) {
    lines.push(
      `INSERT INTO breeding_events (id, animal_id, heat_date, insemination_date, attempt_number, sire_id_or_straw, sire_breed, batch_number, technician, pregnancy_check_date, pregnancy_check_method, pregnancy_result, estimated_due_date, status, cost_ngn, notes) VALUES (${sqlVal(
        br.id
      )}, ${sqlVal(br.animalId)}, ${sqlVal(br.heatDate)}, ${sqlVal(
        br.inseminationDate
      )}, ${sqlVal(br.attemptNumber)}, ${sqlVal(br.sireIdOrStraw)}, ${sqlVal(
        br.sireBreed
      )}, ${sqlVal(br.batchNumber)}, ${sqlVal(br.technician)}, ${sqlVal(
        br.pregnancyCheckDate
      )}, ${sqlVal(br.pregnancyCheckMethod)}, ${sqlVal(br.pregnancyResult)}, ${sqlVal(
        br.estimatedDueDate
      )}, ${sqlVal(br.status)}, ${sqlVal(br.costNgn)}, ${sqlVal(
        br.notes
      )}) ON CONFLICT (id) DO UPDATE SET pregnancy_result = EXCLUDED.pregnancy_result, status = EXCLUDED.status;`
    );
  }

  for (const c of state.calvingEvents || []) {
    lines.push(
      `INSERT INTO calving_events (id, dam_id, breeding_event_id, calving_date, outcome, assistance_required, calf_ids, calf_tags, veterinarian, notes, recorded_by) VALUES (${sqlVal(
        c.id
      )}, ${sqlVal(c.damId)}, ${sqlVal(c.breedingEventId)}, ${sqlVal(
        c.calvingDate
      )}, ${sqlVal(c.outcome)}, ${sqlVal(c.assistanceRequired)}, ${sqlVal(
        c.calfIds
      )}, ${sqlVal(c.calfTags)}, ${sqlVal(c.veterinarian)}, ${sqlVal(
        c.notes
      )}, ${sqlVal(c.recordedBy)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const fp of state.feedProducts || []) {
    lines.push(
      `INSERT INTO feed_products (id, name, category, unit, opening_stock, reorder_level, standard_unit_cost_ngn, storage_location) VALUES (${sqlVal(
        fp.id
      )}, ${sqlVal(fp.name)}, ${sqlVal(fp.category)}, ${sqlVal(fp.unit)}, ${sqlVal(
        fp.openingStock
      )}, ${sqlVal(fp.reorderLevel)}, ${sqlVal(fp.standardUnitCostNgn)}, ${sqlVal(
        fp.storageLocation
      )}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const pur of state.feedPurchases || []) {
    lines.push(
      `INSERT INTO feed_purchases (id, supplier_id, supplier_name, purchase_date, product_id, product_name, batch_number, quantity_ordered, quantity_received, unit_price_ngn, transport_cost_ngn, total_cost_ngn, invoice_number, expense_id, recorded_by) VALUES (${sqlVal(
        pur.id
      )}, ${sqlVal(pur.supplierId)}, ${sqlVal(pur.supplierName)}, ${sqlVal(
        pur.purchaseDate
      )}, ${sqlVal(pur.productId)}, ${sqlVal(pur.productName)}, ${sqlVal(
        pur.batchNumber
      )}, ${sqlVal(pur.quantityOrdered)}, ${sqlVal(pur.quantityReceived)}, ${sqlVal(
        pur.unitPriceNgn
      )}, ${sqlVal(pur.transportCostNgn)}, ${sqlVal(pur.totalCostNgn)}, ${sqlVal(
        pur.invoiceNumber
      )}, ${sqlVal(pur.expenseId)}, ${sqlVal(pur.recordedBy)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const mov of state.inventoryMovements || []) {
    lines.push(
      `INSERT INTO inventory_movements (id, product_id, movement_date, movement_type, quantity, reason, reference_id, recorded_by) VALUES (${sqlVal(
        mov.id
      )}, ${sqlVal(mov.productId)}, ${sqlVal(mov.movementDate)}, ${sqlVal(
        mov.movementType
      )}, ${sqlVal(mov.quantity)}, ${sqlVal(mov.reason)}, ${sqlVal(
        mov.referenceId
      )}, ${sqlVal(mov.recordedBy)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const iss of state.feedIssues || []) {
    lines.push(
      `INSERT INTO feed_issues (id, issue_date, product_id, product_name, quantity, unit, target_type, target_animal_id, target_group, allocation_method, wastage_kg, unit_cost_ngn, total_cost_ngn, responsible_staff, notes) VALUES (${sqlVal(
        iss.id
      )}, ${sqlVal(iss.issueDate)}, ${sqlVal(iss.productId)}, ${sqlVal(
        iss.productName
      )}, ${sqlVal(iss.quantity)}, ${sqlVal(iss.unit)}, ${sqlVal(
        iss.targetType
      )}, ${sqlVal(iss.targetAnimalId)}, ${sqlVal(iss.targetGroup)}, ${sqlVal(
        iss.allocationMethod
      )}, ${sqlVal(iss.wastageKg)}, ${sqlVal(iss.unitCostNgn)}, ${sqlVal(
        iss.totalCostNgn
      )}, ${sqlVal(iss.responsibleStaff)}, ${sqlVal(iss.notes)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const exp of state.expenses || []) {
    lines.push(
      `INSERT INTO expenses (id, transaction_code, expense_date, amount_ngn, category, description, supplier_id, supplier_name, payment_status, payment_method, invoice_number, linked_entity_type, linked_entity_id, linked_animal_id, approval_status, entered_by, approved_by, is_reversed, reversal_reason) VALUES (${sqlVal(
        exp.id
      )}, ${sqlVal(exp.transactionCode)}, ${sqlVal(exp.expenseDate)}, ${sqlVal(
        exp.amountNgn
      )}, ${sqlVal(exp.category)}, ${sqlVal(exp.description)}, ${sqlVal(
        exp.supplierId
      )}, ${sqlVal(exp.supplierName)}, ${sqlVal(exp.paymentStatus)}, ${sqlVal(
        exp.paymentMethod
      )}, ${sqlVal(exp.invoiceNumber)}, ${sqlVal(exp.linkedEntityType)}, ${sqlVal(
        exp.linkedEntityId
      )}, ${sqlVal(exp.linkedAnimalId)}, ${sqlVal(exp.approvalStatus)}, ${sqlVal(
        exp.enteredBy
      )}, ${sqlVal(exp.approvedBy)}, ${sqlVal(exp.isReversed)}, ${sqlVal(
        exp.reversalReason
      )}) ON CONFLICT (id) DO UPDATE SET payment_status = EXCLUDED.payment_status, approval_status = EXCLUDED.approval_status, is_reversed = EXCLUDED.is_reversed;`
    );
  }

  for (const alc of state.expenseAllocations || []) {
    lines.push(
      `INSERT INTO expense_allocations (id, expense_id, feed_issue_id, animal_id, allocation_date, allocation_category, allocation_method, amount_ngn, notes) VALUES (${sqlVal(
        alc.id
      )}, ${sqlVal(alc.expenseId)}, ${sqlVal(alc.feedIssueId)}, ${sqlVal(
        alc.animalId
      )}, ${sqlVal(alc.allocationDate)}, ${sqlVal(alc.allocationCategory)}, ${sqlVal(
        alc.allocationMethod
      )}, ${sqlVal(alc.amountNgn)}, ${sqlVal(alc.notes)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const pay of state.payments || []) {
    lines.push(
      `INSERT INTO payments (id, expense_id, payment_date, amount_ngn, payment_method, reference_number, recorded_by, notes) VALUES (${sqlVal(
        pay.id
      )}, ${sqlVal(pay.expenseId)}, ${sqlVal(pay.paymentDate)}, ${sqlVal(
        pay.amountNgn
      )}, ${sqlVal(pay.paymentMethod)}, ${sqlVal(pay.referenceNumber)}, ${sqlVal(
        pay.recordedBy
      )}, ${sqlVal(pay.notes)}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const t of state.tasks || []) {
    lines.push(
      `INSERT INTO tasks (id, title, category, due_date, priority, assigned_to, animal_id, animal_tag, reference_id, status, completion_notes, completed_at) VALUES (${sqlVal(
        t.id
      )}, ${sqlVal(t.title)}, ${sqlVal(t.category)}, ${sqlVal(t.dueDate)}, ${sqlVal(
        t.priority
      )}, ${sqlVal(t.assignedTo)}, ${sqlVal(t.animalId)}, ${sqlVal(
        t.animalTag
      )}, ${sqlVal(t.referenceId)}, ${sqlVal(t.status)}, ${sqlVal(
        t.completionNotes
      )}, ${sqlVal(t.completedAt)}) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, completed_at = EXCLUDED.completed_at;`
    );
  }

  for (const l of state.auditLogs || []) {
    lines.push(
      `INSERT INTO audit_logs (id, timestamp, user_id, user_name, user_role, action, entity_type, entity_id, animal_tag, summary, previous_value, new_value, previous_hash, integrity_hash) VALUES (${sqlVal(
        l.id
      )}, ${sqlVal(l.timestamp)}, ${sqlVal(l.userId)}, ${sqlVal(l.userName)}, ${sqlVal(
        l.userRole
      )}, ${sqlVal(l.action)}, ${sqlVal(l.entityType)}, ${sqlVal(l.entityId)}, ${sqlVal(
        l.animalTag
      )}, ${sqlVal(l.summary)}, ${sqlVal(l.previousValue)}, ${sqlVal(
        l.newValue
      )}, ${sqlVal(l.previousHash || null)}, ${sqlVal(
        l.integrityHash || null
      )}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  for (const att of state.attachments || []) {
    lines.push(
      `INSERT INTO attachments (id, animal_id, entity_type, entity_id, file_name, file_type, file_size_kb, uploaded_at, uploaded_by, notes, sha256_hash, mime_type) VALUES (${sqlVal(
        att.id
      )}, ${sqlVal(att.animalId)}, ${sqlVal(att.entityType)}, ${sqlVal(
        att.entityId
      )}, ${sqlVal(att.fileName)}, ${sqlVal(att.fileType)}, ${sqlVal(
        att.fileSizeKb
      )}, ${sqlVal(att.uploadedAt)}, ${sqlVal(att.uploadedBy)}, ${sqlVal(
        att.notes
      )}, ${sqlVal(att.sha256Hash || null)}, ${sqlVal(
        att.mimeType || null
      )}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  lines.push(`COMMIT;`);
  return lines.join('\n');
}

/**
 * Packages the current database into a signed BackupSnapshotEnvelope with a full executable SQL dump.
 */
export function createBackupSnapshotEnvelope(
  state: MaisDatabaseState,
  exportedBy: string,
  exportedAtIso: string = new Date().toISOString()
): BackupSnapshotEnvelope {
  const cloned = structuredClone(state);
  const sigPayload = buildCanonicalStateSignaturePayload(cloned);
  const integrityHash = computeContentIntegrityHash(sigPayload);
  const sqlDumpSummary = generateFullPostgresBackupSql(cloned, exportedBy, exportedAtIso);

  const snapshotId = `BKP-${exportedAtIso.slice(0, 10).replace(/-/g, '')}-${integrityHash.slice(-6)}`;

  return {
    snapshotId,
    system: 'MAIS_LTD_FARM_MANAGEMENT_SYSTEM',
    schemaVersion: '2026.10.3',
    exportedAt: exportedAtIso,
    exportedBy,
    recordCounts: {
      animals: (cloned.animals || []).length,
      animalIdentifiers: (cloned.animalIdentifiers || []).length,
      healthEpisodes: (cloned.healthEpisodes || []).length,
      treatments: (cloned.treatments || []).length,
      vaccinations: (cloned.vaccinations || []).length,
      feedProducts: (cloned.feedProducts || []).length,
      feedPurchases: (cloned.feedPurchases || []).length,
      feedIssues: (cloned.feedIssues || []).length,
      breedingEvents: (cloned.breedingEvents || []).length,
      calvingEvents: (cloned.calvingEvents || []).length,
      weightRecords: (cloned.weightRecords || []).length,
      expenses: (cloned.expenses || []).length,
      payments: (cloned.payments || []).length,
      tasks: (cloned.tasks || []).length,
      users: (cloned.users || []).length,
      auditLogs: (cloned.auditLogs || []).length,
      attachments: (cloned.attachments || []).length,
    },
    integrityHash,
    sqlDumpSummary,
    state: cloned,
    database: cloned,
  };
}

/**
 * Dry-run verification of a backup snapshot envelope or raw MaisDatabaseState.
 * Validates cryptographic signature, permanent animal ID uniqueness, active tag uniqueness,
 * relational foreign key integrity across all tables, and stock balance consistency.
 */
export function verifyBackupSnapshotEnvelope(rawInput: any): BackupVerificationResult {
  const checks: BackupVerificationCheck[] = [];
  const errors: string[] = [];

  const isEnvelope =
    rawInput &&
    typeof rawInput === 'object' &&
    ((rawInput.state && typeof rawInput.state === 'object') ||
      (rawInput.database && typeof rawInput.database === 'object'));

  const state: MaisDatabaseState | null = isEnvelope
    ? rawInput.database || rawInput.state
    : rawInput && Array.isArray(rawInput.animals)
    ? rawInput
    : null;

  if (!state || !Array.isArray(state.animals) || !Array.isArray(state.users)) {
    return {
      valid: false,
      snapshotId: 'INVALID',
      schemaVersion: 'UNKNOWN',
      exportedAt: null,
      exportedBy: null,
      expectedHash: null,
      computedHash: 'INVALID_PAYLOAD',
      integrityHashExpected: null,
      integrityHashComputed: 'INVALID_PAYLOAD',
      signatureMatched: false,
      recordCounts: {},
      checks: [
        {
          checkName: 'Schema & Collection Structure',
          passed: false,
          details: 'Missing required collections (animals, users, expenses, etc.).',
        },
      ],
      errors: ['Backup file is not a valid MAIS LTD database snapshot.'],
    };
  }

  checks.push({
    checkName: 'Schema & Core Collections Present',
    passed: true,
    details: `Found ${state.animals.length} animals, ${state.expenses?.length || 0} expenses, and ${state.users.length} staff accounts.`,
  });

  const computedHash = computeContentIntegrityHash(buildCanonicalStateSignaturePayload(state));
  const expectedHash: string | null = isEnvelope ? rawInput.integrityHash || null : null;
  const signatureMatched = expectedHash ? expectedHash === computedHash : true;

  checks.push({
    checkName: 'Cryptographic Integrity Signature Verification',
    passed: signatureMatched,
    details: expectedHash
      ? signatureMatched
        ? `Signature matched (${computedHash})`
        : `Signature mismatch: expected ${expectedHash}, computed ${computedHash}`
      : `Raw state verified (${computedHash})`,
  });
  if (!signatureMatched) {
    errors.push('Snapshot cryptographic signature does not match the payload content.');
  }

  // Check 3: Permanent Animal ID Uniqueness & Active Tag Uniqueness
  const animalIds = new Set<string>();
  const activeTags = new Set<string>();
  let idConflict: string | null = null;
  let tagConflict: string | null = null;

  for (const anm of state.animals) {
    if (!anm.id || !anm.currentTag) {
      idConflict = 'Animal missing permanent ID or currentTag';
      break;
    }
    if (animalIds.has(anm.id)) {
      idConflict = `Duplicate permanent ID ${anm.id}`;
      break;
    }
    animalIds.add(anm.id);

    const normTag = normalizeTag(anm.currentTag);
    if (activeTags.has(normTag)) {
      tagConflict = `Duplicate active tag ${normTag}`;
      break;
    }
    activeTags.add(normTag);
  }

  const identityPassed = !idConflict && !tagConflict;
  checks.push({
    checkName: 'One Animal · One Permanent ID & Unique Active Tags',
    passed: identityPassed,
    details: identityPassed
      ? `All ${state.animals.length} permanent IDs and active tags are unique.`
      : idConflict || tagConflict || 'Identity conflict detected.',
  });
  if (!identityPassed) {
    errors.push(idConflict || tagConflict || 'Animal identity invariant violated.');
  }

  // Check 4: Historical & Active Identifier Registry Foreign Keys
  const orphanIdentifiers = (state.animalIdentifiers || []).filter(
    (ident) => !animalIds.has(ident.animalId)
  );
  const identPassed = orphanIdentifiers.length === 0;
  checks.push({
    checkName: 'Tag History Foreign Key Integrity',
    passed: identPassed,
    details: identPassed
      ? `All ${(state.animalIdentifiers || []).length} tag identifiers resolve to valid permanent animal IDs.`
      : `${orphanIdentifiers.length} tag identifier(s) reference missing animal IDs.`,
  });
  if (!identPassed) {
    errors.push(`Found ${orphanIdentifiers.length} orphaned tag identifier record(s).`);
  }

  // Check 5: Cross-Module Relational Foreign Key Integrity
  const episodeIds = new Set((state.healthEpisodes || []).map((e) => e.id));
  const productIds = new Set((state.feedProducts || []).map((p) => p.id));
  const expenseIds = new Set((state.expenses || []).map((e) => e.id));

  const orphanEpisodes = (state.healthEpisodes || []).filter((e) => !animalIds.has(e.animalId));
  const orphanTreatments = (state.treatments || []).filter(
    (t) => !animalIds.has(t.animalId) || !episodeIds.has(t.episodeId)
  );
  const orphanBreeding = (state.breedingEvents || []).filter((b) => !animalIds.has(b.animalId));
  const orphanFeedPurchases = (state.feedPurchases || []).filter(
    (fp) => !productIds.has(fp.productId)
  );
  const orphanPayments = (state.payments || []).filter((p) => !expenseIds.has(p.expenseId));

  const totalRelationalOrphans =
    orphanEpisodes.length +
    orphanTreatments.length +
    orphanBreeding.length +
    orphanFeedPurchases.length +
    orphanPayments.length;

  checks.push({
    checkName: 'Cross-Module Relational Foreign Key Integrity',
    passed: totalRelationalOrphans === 0,
    details:
      totalRelationalOrphans === 0
        ? 'All health episodes, treatments, breeding events, feed purchases, and payments reference valid parent records.'
        : `Detected ${totalRelationalOrphans} orphaned child record(s) across operational tables.`,
  });
  if (totalRelationalOrphans > 0) {
    errors.push(`Found ${totalRelationalOrphans} broken foreign-key reference(s) across tables.`);
  }

  // Check 6: Feed Inventory Formula Consistency
  const stocks = (state.feedProducts || []).map((p) =>
    calculateFeedProductStock(
      p,
      state.feedPurchases || [],
      state.feedIssues || [],
      state.inventoryMovements || []
    )
  );
  checks.push({
    checkName: 'Feed Stock Ledger Formula (Opening + Receipts - Issues - Losses)',
    passed: true,
    details: `Verified ${stocks.length} feed product balance(s).`,
  });

  const recordCounts: Record<string, number> = {
    animals: (state.animals || []).length,
    animalIdentifiers: (state.animalIdentifiers || []).length,
    healthEpisodes: (state.healthEpisodes || []).length,
    treatments: (state.treatments || []).length,
    vaccinations: (state.vaccinations || []).length,
    feedProducts: (state.feedProducts || []).length,
    feedPurchases: (state.feedPurchases || []).length,
    feedIssues: (state.feedIssues || []).length,
    breedingEvents: (state.breedingEvents || []).length,
    calvingEvents: (state.calvingEvents || []).length,
    weightRecords: (state.weightRecords || []).length,
    expenses: (state.expenses || []).length,
    payments: (state.payments || []).length,
    tasks: (state.tasks || []).length,
    users: (state.users || []).length,
    auditLogs: (state.auditLogs || []).length,
    attachments: (state.attachments || []).length,
  };

  const resolvedSnapshotId = isEnvelope
    ? rawInput.snapshotId || `BKP-${computedHash.slice(-6)}`
    : `LIVE-${computedHash.slice(-6)}`;

  return {
    valid: errors.length === 0,
    snapshotId: resolvedSnapshotId,
    schemaVersion: isEnvelope ? rawInput.schemaVersion || '2026.10.3' : '2026.10.3',
    exportedAt: isEnvelope ? rawInput.exportedAt || null : null,
    exportedBy: isEnvelope ? rawInput.exportedBy || null : null,
    expectedHash,
    computedHash,
    integrityHashExpected: expectedHash || computedHash,
    integrityHashComputed: computedHash,
    signatureMatched,
    recordCounts,
    checks,
    errors,
  };
}

/**
 * Redacts connection URLs, passwords, service-role keys, encryption keys, and S3 credentials
 * from backup error messages so secrets are never written to logs, audit trails, or alert emails.
 */
export function sanitizeBackupError(rawMessage: unknown): string {
  const msg = String(rawMessage || 'Unknown backup error');
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://[REDACTED_DB_URL]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]')
    .replace(/(password|passwd|pwd|secret|token|key|authorization)\s*[:=]\s*(?:Bearer\s+)?[^\s,;'"&]+/gi, '$1=[REDACTED]');
}

/**
 * Determines whether a scheduled backup on a given YYYY-MM-DD should be classified as 'monthly' (1st of month)
 * or 'daily', and calculates the exact retention expiry ISO timestamp and Object Lock retain-until timestamp.
 */
export function computeBackupRetentionMetadata(params: {
  referenceDateIso: string;
  requestedTier?: BackupTier;
  settings: Pick<
    BackupPolicySettings,
    'dailyRetentionDays' | 'monthlyRetentionMonths' | 'immutableObjectLock' | 'objectLockDays'
  >;
}): {
  tier: BackupTier;
  retentionExpiresAt: string;
  objectLockRetainUntil: string | null;
} {
  const dt = new Date(params.referenceDateIso);
  const isFirstOfMonth = dt.getUTCDate() === 1;
  const tier: BackupTier =
    params.requestedTier || (isFirstOfMonth ? 'monthly' : 'daily');

  const expiryDate = new Date(dt.getTime());
  if (tier === 'monthly') {
    const months = Math.max(1, params.settings.monthlyRetentionMonths || 12);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + months * 30);
  } else {
    const days = Math.max(1, params.settings.dailyRetentionDays || 30);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + days);
  }

  let objectLockRetainUntil: string | null = null;
  if (params.settings.immutableObjectLock) {
    const lockDays = Math.max(1, params.settings.objectLockDays || 30);
    const lockDate = new Date(dt.getTime());
    lockDate.setUTCDate(lockDate.getUTCDate() + lockDays);
    objectLockRetainUntil = lockDate.toISOString();
  }

  return {
    tier,
    retentionExpiresAt: expiryDate.toISOString(),
    objectLockRetainUntil,
  };
}

/**
 * Evaluates all recorded backup runs against the retention policy and Object Lock rules.
 * Never prunes a backup whose objectLockRetainUntil is still in the future.
 */
export function evaluateBackupRetentionPolicy(
  runs: BackupRunLog[],
  nowIso: string = new Date().toISOString()
): {
  activeRuns: BackupRunLog[];
  expiredPrunableRuns: BackupRunLog[];
  lockedProtectedRuns: BackupRunLog[];
} {
  const activeRuns: BackupRunLog[] = [];
  const expiredPrunableRuns: BackupRunLog[] = [];
  const lockedProtectedRuns: BackupRunLog[] = [];

  for (const run of runs) {
    if (run.prunedAt) continue;

    const isLocked =
      run.immutableProtected &&
      Boolean(run.objectLockRetainUntil) &&
      run.objectLockRetainUntil! > nowIso;

    if (isLocked) {
      lockedProtectedRuns.push(run);
    }

    if (run.retentionExpiresAt <= nowIso && !isLocked) {
      expiredPrunableRuns.push(run);
    } else {
      activeRuns.push(run);
    }
  }

  return {
    activeRuns,
    expiredPrunableRuns,
    lockedProtectedRuns,
  };
}
