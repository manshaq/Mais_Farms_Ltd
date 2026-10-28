// Supabase service wrapper for MAIS LTD
// Provides production-ready PostgreSQL persistence helpers with strict schema column mapping.
// Supports graceful no-op fallback when supabaseClient is not configured (e.g. local dev mode).

import { supabaseClient } from './store.ts';
import {
  Animal,
  AnimalEvent,
  AnimalIdentifier,
  AttachmentRecord,
  BreedingEvent,
  CalvingEvent,
  Expense,
  FarmTask,
  FeedIssue,
  FeedProduct,
  FeedPurchase,
  HealthEpisode,
  InventoryMovement,
  MaisDatabaseState,
  Payment,
  StaffUser,
  Supplier,
  Treatment,
  VaccinationRecord,
  WeightRecord,
} from '../../src/types/mais.ts';

/**
 * Maps an Animal domain object (camelCase) to public.animals table columns (snake_case).
 */
export function mapAnimalToDb(animal: Animal) {
  return {
    id: animal.id,
    current_tag: animal.currentTag,
    name: animal.name,
    type: animal.type,
    sex: animal.sex,
    breed: animal.breed,
    date_of_birth: animal.dateOfBirth,
    acquisition_type: animal.acquisitionType,
    source_details: animal.sourceDetails || null,
    acquisition_date: animal.acquisitionDate,
    purchase_price: animal.purchasePrice ?? 0,
    dam_tag: animal.damTag || null,
    dam_id: animal.damId || null,
    sire_id: animal.sireId || null,
    herd_group: animal.herdGroup,
    location: animal.location,
    identifying_characteristics: animal.identifyingCharacteristics || null,
    status: animal.status,
    status_changed_at: animal.statusChangedAt || null,
    status_reason: animal.statusReason || null,
    notes: animal.notes || null,
    registered_by: animal.registeredBy,
    registered_at: animal.registeredAt,
  };
}

/**
 * Maps partial Animal updates to snake_case table columns.
 */
export function mapAnimalUpdatesToDb(updates: Partial<Animal>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  if (updates.currentTag !== undefined) mapped.current_tag = updates.currentTag;
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.type !== undefined) mapped.type = updates.type;
  if (updates.sex !== undefined) mapped.sex = updates.sex;
  if (updates.breed !== undefined) mapped.breed = updates.breed;
  if (updates.dateOfBirth !== undefined) mapped.date_of_birth = updates.dateOfBirth;
  if (updates.acquisitionType !== undefined) mapped.acquisition_type = updates.acquisitionType;
  if (updates.sourceDetails !== undefined) mapped.source_details = updates.sourceDetails;
  if (updates.acquisitionDate !== undefined) mapped.acquisition_date = updates.acquisitionDate;
  if (updates.purchasePrice !== undefined) mapped.purchase_price = updates.purchasePrice;
  if (updates.damTag !== undefined) mapped.dam_tag = updates.damTag;
  if (updates.damId !== undefined) mapped.dam_id = updates.damId;
  if (updates.sireId !== undefined) mapped.sire_id = updates.sireId;
  if (updates.herdGroup !== undefined) mapped.herd_group = updates.herdGroup;
  if (updates.location !== undefined) mapped.location = updates.location;
  if (updates.identifyingCharacteristics !== undefined) mapped.identifying_characteristics = updates.identifyingCharacteristics;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.statusChangedAt !== undefined) mapped.status_changed_at = updates.statusChangedAt;
  if (updates.statusReason !== undefined) mapped.status_reason = updates.statusReason;
  if (updates.notes !== undefined) mapped.notes = updates.notes;
  return mapped;
}

/**
 * Maps an AnimalIdentifier to public.animal_identifiers table columns (snake_case).
 */
export function mapIdentifierToDb(ident: AnimalIdentifier) {
  return {
    id: ident.id,
    animal_id: ident.animalId,
    tag_number: ident.tagNumber,
    normalized_tag: ident.normalizedTag,
    is_current: ident.isCurrent,
    assigned_at: ident.assignedAt,
    retired_at: ident.retiredAt || null,
    retired_reason: ident.retiredReason || null,
    assigned_by: ident.assignedBy,
  };
}

/**
 * Maps a WeightRecord to public.weight_records table columns (snake_case).
 */
export function mapWeightRecordToDb(record: WeightRecord) {
  return {
    id: record.id,
    animal_id: record.animalId,
    measurement_date: record.measurementDate,
    weight_kg: record.weightKg,
    body_condition_score: record.bodyConditionScore ?? null,
    stage: record.stage,
    recorded_by: record.recordedBy,
    notes: record.notes || null,
  };
}

/**
 * Maps an Expense to public.expenses table columns (snake_case).
 */
export function mapExpenseToDb(expense: Expense) {
  return {
    id: expense.id,
    transaction_code: expense.transactionCode,
    expense_date: expense.expenseDate,
    amount_ngn: expense.amountNgn,
    category: expense.category,
    description: expense.description,
    supplier_id: expense.supplierId || null,
    supplier_name: expense.supplierName || null,
    payment_status: expense.paymentStatus,
    payment_method: expense.paymentMethod,
    invoice_number: expense.invoiceNumber || null,
    linked_entity_type: expense.linkedEntityType || null,
    linked_entity_id: expense.linkedEntityId || null,
    linked_animal_id: expense.linkedAnimalId || null,
    approval_status: expense.approvalStatus,
    entered_by: expense.enteredBy,
    approved_by: expense.approvedBy || null,
    is_reversed: expense.isReversed,
    reversal_reason: expense.reversalReason || null,
  };
}

/**
 * Maps a Payment to public.payments table columns (snake_case).
 */
export function mapPaymentToDb(payment: Payment) {
  return {
    id: payment.id,
    expense_id: payment.expenseId,
    payment_date: payment.paymentDate,
    amount_ngn: payment.amountNgn,
    payment_method: payment.paymentMethod,
    reference_number: payment.referenceNumber || null,
    recorded_by: payment.recordedBy,
    notes: payment.notes || null,
  };
}

/**
 * Insert a new animal and its initial identifier into Supabase.
 * Returns null if Supabase is not configured (local dev fallback).
 */
export async function insertAnimal(animal: Animal, identifier: AnimalIdentifier) {
  if (!supabaseClient) return null;
  const dbAnimal = mapAnimalToDb(animal);
  const dbIdent = mapIdentifierToDb(identifier);

  // If a dam_id is specified, verify that the referenced dam exists in Supabase animals
  // to avoid a foreign key constraint violation (e.g. if initial herd was not pre-seeded).
  if (dbAnimal.dam_id) {
    try {
      const { data: damRow } = await supabaseClient
        .from('animals')
        .select('id')
        .eq('id', dbAnimal.dam_id)
        .maybeSingle();
      if (!damRow) {
        console.warn(
          `Foreign key safety: referenced dam_id "${dbAnimal.dam_id}" not found in Supabase public.animals. Preserving dam_tag and setting dam_id to null.`
        );
        dbAnimal.dam_id = null;
      }
    } catch {
      dbAnimal.dam_id = null;
    }
  }

  const { error: animalErr } = await supabaseClient
    .from('animals')
    .insert([dbAnimal]);
  if (animalErr) throw animalErr;

  const { error: identErr } = await supabaseClient
    .from('animal_identifiers')
    .insert([dbIdent]);
  if (identErr) throw identErr;

  return { animal, identifier };
}

/**
 * Update an existing animal record in Supabase.
 * Returns null if Supabase is not configured.
 */
export async function updateAnimal(id: string, updates: Partial<Animal>) {
  if (!supabaseClient) return null;
  const dbUpdates = mapAnimalUpdatesToDb(updates);
  if (Object.keys(dbUpdates).length === 0) return null;

  const { error } = await supabaseClient
    .from('animals')
    .update(dbUpdates)
    .eq('id', id);
  if (error) throw error;
  return true;
}

/**
 * Replaces an animal's active tag: retires active identifiers and inserts new one.
 */
export async function replaceAnimalTagInDb(
  animalId: string,
  newTagNumber: string,
  newIdentifier: AnimalIdentifier,
  effectiveDate: string,
  reason: string
) {
  if (!supabaseClient) return null;

  // 1. Retire current active identifiers in Supabase
  const { error: retireErr } = await supabaseClient
    .from('animal_identifiers')
    .update({
      is_current: false,
      retired_at: effectiveDate,
      retired_reason: reason,
    })
    .eq('animal_id', animalId)
    .eq('is_current', true);
  if (retireErr) throw retireErr;

  // 2. Insert new identifier
  const dbIdent = mapIdentifierToDb(newIdentifier);
  const { error: identErr } = await supabaseClient
    .from('animal_identifiers')
    .insert([dbIdent]);
  if (identErr) throw identErr;

  // 3. Update current tag on animal record
  const { error: animalErr } = await supabaseClient
    .from('animals')
    .update({ current_tag: newTagNumber })
    .eq('id', animalId);
  if (animalErr) throw animalErr;

  return true;
}

/**
 * Soft-delete a user in Supabase (admin only).
 * Sets deleted = true and status = 'Suspended'.
 */
export async function softDeleteUser(userId: string) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient
    .from('users')
    .update({ status: 'Suspended', deleted: true })
    .eq('id', userId);
  if (error) throw error;
  return true;
}

/**
 * Upload an attachment to Supabase storage and record metadata.
 */
export async function uploadAttachment(att: AttachmentRecord, contentBase64?: string) {
  if (!supabaseClient) return null;
  let storageBucket: string | undefined;
  let storagePath: string | undefined;

  if (contentBase64) {
    const bucket = att.entityType === 'Expense' ? 'receipt-documents' : 'animal-photos';
    const safeFileName = att.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${att.entityType.toLowerCase()}s/${att.entityId}/${Date.now()}_${safeFileName}`;
    const base64Data = contentBase64.replace(/^data:.*?;base64,/, '');
    const fileBuffer = Buffer.from(base64Data, 'base64');

    const { error: uploadErr } = await supabaseClient.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: att.mimeType || 'application/octet-stream',
        upsert: true,
      });

    if (!uploadErr) {
      storageBucket = bucket;
      storagePath = filePath;
    } else {
      console.warn('Supabase storage upload error:', uploadErr.message);
    }
  }

  const record = {
    id: att.id,
    animal_id: att.animalId || null,
    entity_type: att.entityType,
    entity_id: att.entityId,
    file_name: att.fileName,
    file_type: att.fileType,
    file_size_kb: att.fileSizeKb || 1,
    storage_bucket: storageBucket || att.storageBucket || null,
    storage_path: storagePath || att.storagePath || null,
    mime_type: att.mimeType || null,
    sha256_hash: att.sha256Hash || null,
    notes: att.notes || null,
    uploaded_by: att.uploadedBy,
    uploaded_at: att.uploadedAt,
  };

  const { error: dbErr } = await supabaseClient.from('attachments').insert([record]);
  if (dbErr) throw dbErr;
  return { ...att, storageBucket, storagePath };
}

/**
 * Insert a weight record into Supabase.
 */
export async function insertWeightRecord(record: WeightRecord) {
  if (!supabaseClient) return null;
  const dbRecord = mapWeightRecordToDb(record);
  const { error } = await supabaseClient.from('weight_records').insert([dbRecord]);
  if (error) throw error;
  return true;
}

/**
 * Insert an expense record into Supabase.
 */
export async function insertExpense(expense: Expense) {
  if (!supabaseClient) return null;
  const dbExpense = mapExpenseToDb(expense);
  const { error } = await supabaseClient.from('expenses').insert([dbExpense]);
  if (error) throw error;
  return true;
}

/**
 * Insert a payment record into Supabase.
 */
export async function insertPayment(payment: Payment) {
  if (!supabaseClient) return null;
  const dbPayment = mapPaymentToDb(payment);
  const { error } = await supabaseClient.from('payments').insert([dbPayment]);
  if (error) throw error;
  return true;
}

export async function insertHealthEpisode(episode: HealthEpisode) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('health_episodes').insert([mapHealthEpisodeToDb(episode)]);
  if (error) console.warn('Supabase insertHealthEpisode warning:', error.message);
  return true;
}

export async function insertTreatment(treatment: Treatment) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('treatments').insert([mapTreatmentToDb(treatment)]);
  if (error) console.warn('Supabase insertTreatment warning:', error.message);
  return true;
}

export async function insertVaccinationRecord(record: VaccinationRecord) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('vaccination_records').insert([mapVaccinationToDb(record)]);
  if (error) console.warn('Supabase insertVaccinationRecord warning:', error.message);
  return true;
}

export async function insertBreedingEvent(event: BreedingEvent) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('breeding_events').insert([mapBreedingEventToDb(event)]);
  if (error) console.warn('Supabase insertBreedingEvent warning:', error.message);
  return true;
}

export async function insertCalvingEvent(event: CalvingEvent) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('calving_events').insert([mapCalvingEventToDb(event)]);
  if (error) console.warn('Supabase insertCalvingEvent warning:', error.message);
  return true;
}

export async function insertFeedPurchase(purchase: FeedPurchase) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('feed_purchases').insert([mapFeedPurchaseToDb(purchase)]);
  if (error) console.warn('Supabase insertFeedPurchase warning:', error.message);
  return true;
}

export async function insertFeedIssue(issue: FeedIssue) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('feed_issues').insert([mapFeedIssueToDb(issue)]);
  if (error) console.warn('Supabase insertFeedIssue warning:', error.message);
  return true;
}

export async function insertInventoryMovement(movement: InventoryMovement) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('inventory_movements').insert([mapInventoryMovementToDb(movement)]);
  if (error) console.warn('Supabase insertInventoryMovement warning:', error.message);
  return true;
}

export async function insertTask(task: FarmTask) {
  if (!supabaseClient) return null;
  const { error } = await supabaseClient.from('tasks').insert([mapTaskToDb(task)]);
  if (error) console.warn('Supabase insertTask warning:', error.message);
  return true;
}

export async function updateTask(taskId: string, updates: Partial<FarmTask>) {
  if (!supabaseClient) return null;
  const dbUpdates: Record<string, unknown> = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.completionNotes !== undefined) dbUpdates.description = updates.completionNotes;
  if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;
  const { error } = await supabaseClient.from('tasks').update(dbUpdates).eq('id', taskId);
  if (error) console.warn('Supabase updateTask warning:', error.message);
  return true;
}

export async function insertSupplier(supplier: Supplier) {
  if (!supabaseClient) return null;
  const dbSupplier = {
    id: supplier.id,
    name: supplier.name,
    category: supplier.category,
    phone: supplier.phone || null,
    email: supplier.email || null,
    address: supplier.address || null,
    notes: supplier.bankDetails || null,
  };
  const { error } = await supabaseClient.from('suppliers').upsert([dbSupplier], { onConflict: 'id' });
  if (error) console.warn('Supabase insertSupplier warning:', error.message);
  return true;
}

export async function insertFeedProduct(product: FeedProduct) {
  if (!supabaseClient) return null;
  const dbProduct = {
    id: product.id,
    name: product.name,
    category: product.category,
    unit: product.unit,
    opening_stock: product.openingStock,
    reorder_level: product.reorderLevel,
    standard_unit_cost_ngn: product.standardUnitCostNgn,
    storage_location: product.storageLocation,
  };
  const { error } = await supabaseClient.from('feed_products').upsert([dbProduct], { onConflict: 'id' });
  if (error) console.warn('Supabase insertFeedProduct warning:', error.message);
  return true;
}

/**
 * Synchronizes all records from local state into Supabase PostgreSQL tables.
 * Safe upsert that handles self-referencing foreign keys (dam_id).
 */
export async function syncDatabaseToSupabase(state: MaisDatabaseState): Promise<{
  synced: {
    users: number;
    suppliers: number;
    feedProducts: number;
    animals: number;
    identifiers: number;
    expenses: number;
    payments: number;
  };
}> {
  if (!supabaseClient) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
  }

  // 1. Users
  const dbUsers = state.users.map((u) => ({
    id: u.id,
    auth_user_id: u.supabaseUserId || null,
    full_name: u.fullName,
    email: u.email.toLowerCase(),
    role: u.role,
    title: u.title,
    can_approve_expenses: u.canApproveExpenses,
    status: u.status,
    deleted: Boolean(u.deleted),
  }));
  if (dbUsers.length > 0) {
    const { error } = await supabaseClient.from('users').upsert(dbUsers, { onConflict: 'email' });
    if (error) throw new Error(`Failed to sync users: ${error.message}`);
  }

  // 2. Suppliers
  const dbSuppliers = state.suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    contact_person: null,
    phone: s.phone || null,
    email: s.email || null,
    address: s.address || null,
    payment_terms: null,
    notes: s.bankDetails || null,
  }));
  if (dbSuppliers.length > 0) {
    const { error } = await supabaseClient.from('suppliers').upsert(dbSuppliers, { onConflict: 'id' });
    if (error) throw new Error(`Failed to sync suppliers: ${error.message}`);
  }

  // 3. Feed Products
  const dbProducts = state.feedProducts.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    opening_stock: p.openingStock,
    reorder_level: p.reorderLevel,
    standard_unit_cost_ngn: p.standardUnitCostNgn,
    storage_location: p.storageLocation,
  }));
  if (dbProducts.length > 0) {
    const { error } = await supabaseClient.from('feed_products').upsert(dbProducts, { onConflict: 'id' });
    if (error) throw new Error(`Failed to sync feed products: ${error.message}`);
  }

  // 4. Animals (pass 1: insert/upsert with dam_id null to avoid self-referential foreign key conflicts)
  const dbAnimalsPass1 = state.animals.map((a) => {
    const m = mapAnimalToDb(a);
    m.dam_id = null;
    return m;
  });
  if (dbAnimalsPass1.length > 0) {
    const { error } = await supabaseClient.from('animals').upsert(dbAnimalsPass1, { onConflict: 'id' });
    if (error) throw new Error(`Failed to sync animals: ${error.message}`);
  }

  // 5. Animals (pass 2: link dam_id once all animal IDs exist)
  const dbAnimalsPass2 = state.animals
    .filter((a) => Boolean(a.damId))
    .map((a) => ({
      id: a.id,
      dam_id: a.damId,
    }));
  if (dbAnimalsPass2.length > 0) {
    await supabaseClient.from('animals').upsert(dbAnimalsPass2, { onConflict: 'id' });
  }

  // 6. Animal Identifiers
  const dbIdents = state.animalIdentifiers.map((i) => mapIdentifierToDb(i));
  if (dbIdents.length > 0) {
    const { error } = await supabaseClient.from('animal_identifiers').upsert(dbIdents, { onConflict: 'id' });
    if (error) throw new Error(`Failed to sync animal identifiers: ${error.message}`);
  }

  // 7. Expenses
  const dbExpenses = state.expenses.map((e) => mapExpenseToDb(e));
  if (dbExpenses.length > 0) {
    const { error } = await supabaseClient.from('expenses').upsert(dbExpenses, { onConflict: 'id' });
    if (error) throw new Error(`Failed to sync expenses: ${error.message}`);
  }

  // 8. Payments
  const dbPayments = state.payments.map((p) => mapPaymentToDb(p));
  if (dbPayments.length > 0) {
    const { error } = await supabaseClient.from('payments').upsert(dbPayments, { onConflict: 'id' });
    if (error) throw new Error(`Failed to sync payments: ${error.message}`);
  }

  return {
    synced: {
      users: dbUsers.length,
      suppliers: dbSuppliers.length,
      feedProducts: dbProducts.length,
      animals: dbAnimalsPass1.length,
      identifiers: dbIdents.length,
      expenses: dbExpenses.length,
      payments: dbPayments.length,
    },
  };
}

export function mapDbToAnimal(row: Record<string, any>): Animal {
  return {
    id: row.id,
    currentTag: row.current_tag,
    name: row.name,
    type: row.type,
    sex: row.sex,
    breed: row.breed,
    dateOfBirth: row.date_of_birth,
    acquisitionType: row.acquisition_type,
    sourceDetails: row.source_details || undefined,
    acquisitionDate: row.acquisition_date,
    purchasePrice: row.purchase_price !== null && row.purchase_price !== undefined ? Number(row.purchase_price) : null,
    damTag: row.dam_tag || undefined,
    damId: row.dam_id || undefined,
    sireId: row.sire_id || undefined,
    herdGroup: row.herd_group,
    location: row.location,
    identifyingCharacteristics: row.identifying_characteristics || undefined,
    status: row.status,
    statusChangedAt: row.status_changed_at || undefined,
    statusReason: row.status_reason || undefined,
    notes: row.notes || undefined,
    registeredBy: row.registered_by,
    registeredAt: row.registered_at,
  };
}

export function mapDbToIdentifier(row: Record<string, any>): AnimalIdentifier {
  return {
    id: row.id,
    animalId: row.animal_id,
    tagNumber: row.tag_number,
    normalizedTag: row.normalized_tag,
    isCurrent: Boolean(row.is_current),
    assignedAt: row.assigned_at,
    retiredAt: row.retired_at || undefined,
    retiredReason: row.retired_reason || undefined,
    assignedBy: row.assigned_by,
  };
}

export function mapDbToUser(row: Record<string, any>): StaffUser {
  return {
    id: row.id,
    supabaseUserId: row.supabase_user_id || undefined,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    title: row.title || 'Livestock Staff',
    canApproveExpenses: Boolean(row.can_approve_expenses),
    status: row.status || 'Active',
    lastActive: row.last_active || new Date().toISOString(),
    deleted: Boolean(row.deleted),
  };
}

export function mapDbToExpense(row: Record<string, any>): Expense {
  return {
    id: row.id,
    transactionCode: row.transaction_code,
    expenseDate: row.expense_date,
    amountNgn: Number(row.amount_ngn),
    category: row.category,
    description: row.description,
    supplierId: row.supplier_id || undefined,
    supplierName: row.supplier_name || undefined,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    invoiceNumber: row.invoice_number || undefined,
    linkedEntityType: row.linked_entity_type || undefined,
    linkedEntityId: row.linked_entity_id || undefined,
    linkedAnimalId: row.linked_animal_id || undefined,
    approvalStatus: row.approval_status,
    enteredBy: row.entered_by,
    approvedBy: row.approved_by || undefined,
    isReversed: Boolean(row.is_reversed),
    reversalReason: row.reversal_reason || undefined,
  };
}

export function mapDbToPayment(row: Record<string, any>): Payment {
  return {
    id: row.id,
    expenseId: row.expense_id,
    paymentDate: row.payment_date,
    amountNgn: Number(row.amount_ngn),
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number || undefined,
    recordedBy: row.recorded_by,
    notes: row.notes || undefined,
  };
}

export function mapHealthEpisodeToDb(ep: HealthEpisode) {
  return {
    id: ep.id,
    animal_id: ep.animalId,
    reported_date: ep.reportedDate,
    symptoms: ep.symptoms,
    diagnosis: ep.diagnosis,
    diagnosis_category: ep.diagnosisCategory,
    severity: ep.severity,
    status: ep.status,
    veterinarian: ep.veterinarian,
    outcome: ep.outcome || null,
    notes: ep.notes || null,
    recorded_by: ep.recordedBy,
  };
}

export function mapDbToHealthEpisode(row: Record<string, any>): HealthEpisode {
  return {
    id: row.id,
    animalId: row.animal_id,
    reportedDate: row.reported_date,
    symptoms: row.symptoms,
    diagnosis: row.diagnosis,
    diagnosisCategory: row.diagnosis_category,
    severity: row.severity,
    status: row.status,
    veterinarian: row.veterinarian,
    outcome: row.outcome || '',
    notes: row.notes || '',
    recordedBy: row.recorded_by,
  };
}

export function mapTreatmentToDb(t: Treatment) {
  return {
    id: t.id,
    episode_id: t.episodeId,
    animal_id: t.animalId,
    treatment_date: t.treatmentDate,
    medicine: t.medicine,
    active_ingredient: t.activeIngredient || null,
    dosage: t.dosage,
    route: t.route,
    duration_days: t.durationDays,
    withdrawal_milk_days: t.withdrawalMilkDays,
    withdrawal_meat_days: t.withdrawalMeatDays,
    administrator: t.administrator,
    veterinarian: t.veterinarian,
    medicine_cost: t.medicineCost,
    consultation_cost: t.consultationCost,
    other_cost: t.otherCost,
    total_cost: t.totalCost,
    follow_up_date: t.followUpDate || null,
    outcome: t.outcome,
    notes: t.notes || null,
    expense_id: t.expenseId || null,
  };
}

export function mapDbToTreatment(row: Record<string, any>): Treatment {
  return {
    id: row.id,
    episodeId: row.episode_id,
    animalId: row.animal_id,
    treatmentDate: row.treatment_date,
    medicine: row.medicine,
    activeIngredient: row.active_ingredient || '',
    dosage: row.dosage,
    route: row.route,
    durationDays: Number(row.duration_days) || 1,
    withdrawalMilkDays: Number(row.withdrawal_milk_days) || 0,
    withdrawalMeatDays: Number(row.withdrawal_meat_days) || 0,
    administrator: row.administrator,
    veterinarian: row.veterinarian,
    medicineCost: Number(row.medicine_cost) || 0,
    consultationCost: Number(row.consultation_cost) || 0,
    otherCost: Number(row.other_cost) || 0,
    totalCost: Number(row.total_cost) || 0,
    followUpDate: row.follow_up_date || null,
    outcome: row.outcome || 'Pending Follow-up',
    notes: row.notes || '',
    expenseId: row.expense_id || null,
  };
}

export function mapVaccinationToDb(v: VaccinationRecord) {
  return {
    id: v.id,
    animal_id: v.animalId,
    date_administered: v.dateAdministered,
    protocol_type: v.protocolType,
    vaccine_or_product: v.vaccineOrProduct,
    batch_number: v.batchNumber || null,
    dosage: v.dosage,
    next_due_date: v.nextDueDate,
    veterinarian: v.veterinarian,
    cost_ngn: v.costNgn,
    withdrawal_days: v.withdrawalDays,
    notes: v.notes || null,
  };
}

export function mapDbToVaccination(row: Record<string, any>): VaccinationRecord {
  return {
    id: row.id,
    animalId: row.animal_id,
    dateAdministered: row.date_administered,
    protocolType: row.protocol_type,
    vaccineOrProduct: row.vaccine_or_product,
    batchNumber: row.batch_number || '',
    dosage: row.dosage,
    nextDueDate: row.next_due_date,
    veterinarian: row.veterinarian,
    costNgn: Number(row.cost_ngn) || 0,
    withdrawalDays: Number(row.withdrawal_days) || 0,
    notes: row.notes || '',
  };
}

export function mapDbToWeightRecord(row: Record<string, any>): WeightRecord {
  return {
    id: row.id,
    animalId: row.animal_id,
    measurementDate: row.measurement_date,
    weightKg: Number(row.weight_kg),
    bodyConditionScore: row.body_condition_score !== null && row.body_condition_score !== undefined ? Number(row.body_condition_score) : null,
    stage: row.stage,
    recordedBy: row.recorded_by,
    notes: row.notes || '',
  };
}

export function mapBreedingEventToDb(b: BreedingEvent) {
  return {
    id: b.id,
    animal_id: b.animalId,
    heat_date: b.heatDate,
    insemination_date: b.inseminationDate,
    attempt_number: b.attemptNumber,
    sire_id_or_straw: b.sireIdOrStraw,
    sire_breed: b.sireBreed,
    batch_number: b.batchNumber || null,
    technician: b.technician,
    pregnancy_check_date: b.pregnancyCheckDate || null,
    pregnancy_check_method: b.pregnancyCheckMethod,
    pregnancy_result: b.pregnancyResult,
    estimated_due_date: b.estimatedDueDate,
    status: b.status,
    cost_ngn: b.costNgn,
    notes: b.notes || null,
  };
}

export function mapDbToBreedingEvent(row: Record<string, any>): BreedingEvent {
  return {
    id: row.id,
    animalId: row.animal_id,
    heatDate: row.heat_date,
    inseminationDate: row.insemination_date,
    attemptNumber: Number(row.attempt_number) || 1,
    sireIdOrStraw: row.sire_id_or_straw,
    sireBreed: row.sire_breed,
    batchNumber: row.batch_number || '',
    technician: row.technician,
    pregnancyCheckDate: row.pregnancy_check_date || null,
    pregnancyCheckMethod: row.pregnancy_check_method || 'Pending',
    pregnancyResult: row.pregnancy_result || 'Pending',
    estimatedDueDate: row.estimated_due_date,
    status: row.status,
    costNgn: Number(row.cost_ngn) || 0,
    notes: row.notes || '',
  };
}

export function mapCalvingEventToDb(c: CalvingEvent) {
  return {
    id: c.id,
    dam_id: c.damId,
    breeding_event_id: c.breedingEventId || null,
    calving_date: c.calvingDate,
    outcome: c.outcome,
    assistance_required: c.assistanceRequired,
    calf_ids: c.calfIds || [],
    calf_tags: c.calfTags || [],
    veterinarian: c.veterinarian || null,
    notes: c.notes || null,
    recorded_by: c.recordedBy,
  };
}

export function mapDbToCalvingEvent(row: Record<string, any>): CalvingEvent {
  return {
    id: row.id,
    damId: row.dam_id,
    breedingEventId: row.breeding_event_id || null,
    calvingDate: row.calving_date,
    outcome: row.outcome,
    assistanceRequired: row.assistance_required || 'None',
    calfIds: Array.isArray(row.calf_ids) ? row.calf_ids : [],
    calfTags: Array.isArray(row.calf_tags) ? row.calf_tags : [],
    veterinarian: row.veterinarian || '',
    notes: row.notes || '',
    recordedBy: row.recorded_by,
  };
}

export function mapFeedPurchaseToDb(p: FeedPurchase) {
  return {
    id: p.id,
    supplier_id: p.supplierId || null,
    supplier_name: p.supplierName,
    purchase_date: p.purchaseDate,
    product_id: p.productId,
    product_name: p.productName,
    batch_number: p.batchNumber || null,
    quantity_ordered: p.quantityOrdered,
    quantity_received: p.quantityReceived,
    unit_price_ngn: p.unitPriceNgn,
    transport_cost_ngn: p.transportCostNgn,
    total_cost_ngn: p.totalCostNgn,
    invoice_number: p.invoiceNumber || null,
    expense_id: p.expenseId || null,
    recorded_by: p.recordedBy,
  };
}

export function mapDbToFeedPurchase(row: Record<string, any>): FeedPurchase {
  return {
    id: row.id,
    supplierId: row.supplier_id || '',
    supplierName: row.supplier_name,
    purchaseDate: row.purchase_date,
    productId: row.product_id,
    productName: row.product_name,
    batchNumber: row.batch_number || '',
    quantityOrdered: Number(row.quantity_ordered),
    quantityReceived: Number(row.quantity_received),
    unitPriceNgn: Number(row.unit_price_ngn),
    transportCostNgn: Number(row.transport_cost_ngn) || 0,
    totalCostNgn: Number(row.total_cost_ngn),
    invoiceNumber: row.invoice_number || '',
    expenseId: row.expense_id || null,
    recordedBy: row.recorded_by,
  };
}

export function mapFeedIssueToDb(f: FeedIssue) {
  return {
    id: f.id,
    issue_date: f.issueDate,
    product_id: f.productId,
    product_name: f.productName,
    quantity: f.quantity,
    unit: f.unit,
    target_type: f.targetType,
    target_animal_id: f.targetAnimalId || null,
    target_group: f.targetGroup || null,
    allocation_method: f.allocationMethod,
    wastage_kg: f.wastageKg,
    unit_cost_ngn: f.unitCostNgn,
    total_cost_ngn: f.totalCostNgn,
    responsible_staff: f.responsibleStaff,
    notes: f.notes || null,
  };
}

export function mapDbToFeedIssue(row: Record<string, any>): FeedIssue {
  return {
    id: row.id,
    issueDate: row.issue_date,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    unit: row.unit,
    targetType: row.target_type,
    targetAnimalId: row.target_animal_id || null,
    targetGroup: row.target_group || null,
    allocationMethod: row.allocation_method,
    wastageKg: Number(row.wastage_kg) || 0,
    unitCostNgn: Number(row.unit_cost_ngn),
    totalCostNgn: Number(row.total_cost_ngn),
    responsibleStaff: row.responsible_staff,
    notes: row.notes || '',
  };
}

export function mapInventoryMovementToDb(m: InventoryMovement) {
  return {
    id: m.id,
    product_id: m.productId,
    movement_date: m.movementDate,
    movement_type: m.movementType,
    quantity: m.quantity,
    reason: m.reason,
    reference_id: m.referenceId || null,
    recorded_by: m.recordedBy,
  };
}

export function mapDbToInventoryMovement(row: Record<string, any>): InventoryMovement {
  return {
    id: row.id,
    productId: row.product_id,
    movementDate: row.movement_date,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    reason: row.reason,
    referenceId: row.reference_id || '',
    recordedBy: row.recorded_by,
  };
}

export function mapTaskToDb(t: FarmTask) {
  return {
    id: t.id,
    title: t.title,
    description: t.completionNotes || null,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assigned_to_user_id: null,
    assigned_to_name: t.assignedTo || null,
    due_date: t.dueDate,
    completed_at: t.completedAt || null,
    related_entity_type: t.animalId ? 'Animal' : null,
    related_entity_id: t.animalId || null,
    created_by: t.assignedTo || 'System',
  };
}

export function mapDbToTask(row: Record<string, any>): FarmTask {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    dueDate: row.due_date,
    assignedTo: row.assigned_to_name || 'Staff',
    animalId: row.related_entity_type === 'Animal' ? row.related_entity_id : null,
    animalTag: null,
    referenceId: null,
    status: row.status,
    completionNotes: row.description || '',
    completedAt: row.completed_at || null,
  };
}

export function mapAnimalEventToDb(e: AnimalEvent) {
  return {
    id: e.id,
    animal_id: e.animalId,
    event_date: e.eventDate,
    event_type: e.eventType,
    title: e.title,
    summary: e.summary,
    reference_id: e.referenceId,
    cost_ngn: e.costNgn,
    recorded_by: e.recordedBy,
  };
}

export function mapDbToAnimalEvent(row: Record<string, any>): AnimalEvent {
  return {
    id: row.id,
    animalId: row.animal_id,
    eventDate: row.event_date,
    eventType: row.event_type,
    title: row.title,
    summary: row.summary,
    referenceId: row.reference_id,
    costNgn: row.cost_ngn !== null && row.cost_ngn !== undefined ? Number(row.cost_ngn) : null,
    recordedBy: row.recorded_by,
  };
}

/**
 * Hydrates the in-memory store from Supabase PostgreSQL tables (C3).
 * Solves Vercel serverless cold-start data persistence by making PostgreSQL
 * the single source of truth across all operational tables.
 */
export async function hydrateDatabaseFromSupabase(targetDb: MaisDatabaseState): Promise<boolean> {
  if (!supabaseClient) return false;

  try {
    const [
      usersRes,
      animalsRes,
      identsRes,
      expensesRes,
      paymentsRes,
      suppliersRes,
      productsRes,
      healthRes,
      treatmentsRes,
      vaccinationsRes,
      weightsRes,
      breedingRes,
      calvingRes,
      purchasesRes,
      issuesRes,
      movementsRes,
      tasksRes,
      eventsRes,
    ] = await Promise.all([
      supabaseClient.from('users').select('*'),
      supabaseClient.from('animals').select('*'),
      supabaseClient.from('animal_identifiers').select('*'),
      supabaseClient.from('expenses').select('*'),
      supabaseClient.from('payments').select('*'),
      supabaseClient.from('suppliers').select('*'),
      supabaseClient.from('feed_products').select('*'),
      supabaseClient.from('health_episodes').select('*'),
      supabaseClient.from('treatments').select('*'),
      supabaseClient.from('vaccination_records').select('*'),
      supabaseClient.from('weight_records').select('*'),
      supabaseClient.from('breeding_events').select('*'),
      supabaseClient.from('calving_events').select('*'),
      supabaseClient.from('feed_purchases').select('*'),
      supabaseClient.from('feed_issues').select('*'),
      supabaseClient.from('inventory_movements').select('*'),
      supabaseClient.from('tasks').select('*'),
      supabaseClient.from('animal_events').select('*'),
    ]);

    if (usersRes.data && usersRes.data.length > 0) {
      const existingPasswords = new Map(targetDb.users.map((u) => [u.id, u.password]));
      targetDb.users = usersRes.data.map((row) => {
        const u = mapDbToUser(row);
        u.password = existingPasswords.get(u.id);
        return u;
      });
    }
    if (animalsRes.data && animalsRes.data.length > 0) {
      targetDb.animals = animalsRes.data.map(mapDbToAnimal);
    }
    if (identsRes.data && identsRes.data.length > 0) {
      targetDb.animalIdentifiers = identsRes.data.map(mapDbToIdentifier);
    }
    if (expensesRes.data && expensesRes.data.length > 0) {
      targetDb.expenses = expensesRes.data.map(mapDbToExpense);
    }
    if (paymentsRes.data && paymentsRes.data.length > 0) {
      targetDb.payments = paymentsRes.data.map(mapDbToPayment);
    }
    if (suppliersRes.data && suppliersRes.data.length > 0) {
      targetDb.suppliers = suppliersRes.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        phone: s.phone || '',
        email: s.email || '',
        address: s.address || '',
        bankDetails: s.notes || '',
      }));
    }
    if (productsRes.data && productsRes.data.length > 0) {
      targetDb.feedProducts = productsRes.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        openingStock: Number(p.opening_stock),
        reorderLevel: Number(p.reorder_level),
        standardUnitCostNgn: Number(p.standard_unit_cost_ngn),
        storageLocation: p.storage_location,
      }));
    }
    if (healthRes.data && healthRes.data.length > 0) {
      targetDb.healthEpisodes = healthRes.data.map(mapDbToHealthEpisode);
    }
    if (treatmentsRes.data && treatmentsRes.data.length > 0) {
      targetDb.treatments = treatmentsRes.data.map(mapDbToTreatment);
    }
    if (vaccinationsRes.data && vaccinationsRes.data.length > 0) {
      targetDb.vaccinations = vaccinationsRes.data.map(mapDbToVaccination);
    }
    if (weightsRes.data && weightsRes.data.length > 0) {
      targetDb.weightRecords = weightsRes.data.map(mapDbToWeightRecord);
    }
    if (breedingRes.data && breedingRes.data.length > 0) {
      targetDb.breedingEvents = breedingRes.data.map(mapDbToBreedingEvent);
    }
    if (calvingRes.data && calvingRes.data.length > 0) {
      targetDb.calvingEvents = calvingRes.data.map(mapDbToCalvingEvent);
    }
    if (purchasesRes.data && purchasesRes.data.length > 0) {
      targetDb.feedPurchases = purchasesRes.data.map(mapDbToFeedPurchase);
    }
    if (issuesRes.data && issuesRes.data.length > 0) {
      targetDb.feedIssues = issuesRes.data.map(mapDbToFeedIssue);
    }
    if (movementsRes.data && movementsRes.data.length > 0) {
      targetDb.inventoryMovements = movementsRes.data.map(mapDbToInventoryMovement);
    }
    if (tasksRes.data && tasksRes.data.length > 0) {
      targetDb.tasks = tasksRes.data.map(mapDbToTask);
    }
    if (eventsRes.data && eventsRes.data.length > 0) {
      targetDb.animalEvents = eventsRes.data.map(mapDbToAnimalEvent);
    }

    return true;
  } catch (err) {
    console.warn('Supabase hydration warning:', err);
    return false;
  }
}

