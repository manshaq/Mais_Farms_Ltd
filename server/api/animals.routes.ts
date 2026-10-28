import { Router, Response } from 'express';
import {
  calculateAnimalTotalCosts,
  calculateWeightHistoryWithADG,
  computeContentIntegrityHash,
  normalizeTag,
  resolveAnimalByTag,
  validateNewTagCandidate,
} from '../../src/domain/farmRules.ts';
import {
  Animal,
  AnimalIdentifier,
  AttachmentRecord,
  Expense,
  Payment,
  WeightRecord,
} from '../../src/types/mais.ts';
import {
  appendAnimalEvent,
  appendAudit,
  db,
  generateExpenseTransactionCode,
  saveDatabase,
  supabaseClient,
} from '../db/store.ts';
import {
  insertAnimal,
  updateAnimal,
  replaceAnimalTagInDb,
  uploadAttachment,
  insertWeightRecord,
  insertExpense,
  insertPayment,
} from '../db/supabaseService.ts';
import { paginateItems, requirePermission, StaffRequest } from '../middleware/auth.ts';
import {
  normalizeSearchTag,
  validateNonNegativeNumber,
  validateRequiredString,
} from '../validation/validators.ts';

export const animalsRouter = Router();

/**
 * GET /api/animals
 * Supports pagination (page, limit) and filters (type, status, herdGroup, search)
 */
animalsRouter.get(
  '/animals',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { type, status, herdGroup, search, page, limit } = req.query;
    let filtered = [...db.animals];

    if (type && type !== 'ALL') {
      filtered = filtered.filter((a) => a.type === String(type));
    }
    if (status && status !== 'ALL') {
      filtered = filtered.filter((a) => a.status === String(status));
    }
    if (herdGroup && herdGroup !== 'ALL') {
      filtered = filtered.filter((a) => a.herdGroup === String(herdGroup));
    }
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      const normQ = normalizeSearchTag(search);
      filtered = filtered.filter((a) => {
        const retiredMatch = db.animalIdentifiers.some(
          (i) => i.animalId === a.id && i.normalizedTag.includes(normQ)
        );
        return (
          a.currentTag.toLowerCase().includes(q) ||
          normalizeTag(a.currentTag).includes(normQ) ||
          a.name.toLowerCase().includes(q) ||
          a.breed.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          retiredMatch
        );
      });
    }

    const result = paginateItems(filtered, page, limit);
    res.json(result);
  }
);

/**
 * GET /api/animals/by-tag/:tagNumber
 * Normalizes tag numbers consistently before searching active and retired tags.
 */
animalsRouter.get(
  '/animals/by-tag/:tagNumber',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const rawTag = String(req.params.tagNumber || '');
    const normalized = normalizeSearchTag(rawTag);
    if (!normalized) {
      res.status(400).json({ error: 'A valid tag number is required for lookup.' });
      return;
    }

    const resolution = resolveAnimalByTag(normalized, db.animals, db.animalIdentifiers);
    if (!resolution) {
      res.status(404).json({
        error: `No animal found matching current or historical tag "${normalized}".`,
      });
      return;
    }
    res.json(resolution);
  }
);

/**
 * GET /api/animals/:id
 * Returns the animal profile, identifiers, and computed lifetime cost summary.
 */
animalsRouter.get(
  '/animals/:id',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }
    const identifiers = db.animalIdentifiers.filter((i) => i.animalId === animal.id);
    const costBreakdown = calculateAnimalTotalCosts(animal, db.expenses, db.expenseAllocations);
    res.json({ animal, identifiers, costBreakdown });
  }
);

/**
 * GET /api/animals/:id/history
 * Returns complete individual animal history across all operational modules.
 */
animalsRouter.get(
  '/animals/:id/history',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }
    const identifiers = db.animalIdentifiers.filter((i) => i.animalId === animal.id);
    const timeline = [...db.animalEvents.filter((e) => e.animalId === animal.id)].sort((a, b) =>
      b.eventDate.localeCompare(a.eventDate)
    );
    const healthEpisodes = db.healthEpisodes.filter((h) => h.animalId === animal.id);
    const treatments = db.treatments.filter((t) => t.animalId === animal.id);
    const vaccinations = db.vaccinations.filter((v) => v.animalId === animal.id);
    const weights = calculateWeightHistoryWithADG(
      db.weightRecords.filter((w) => w.animalId === animal.id)
    );
    const breedingEvents = db.breedingEvents.filter((b) => b.animalId === animal.id);
    const calvingEvents = db.calvingEvents.filter(
      (c) => c.damId === animal.id || c.calfIds.includes(animal.id)
    );
    const allocations = db.expenseAllocations.filter((a) => a.animalId === animal.id);
    const directExpenses = db.expenses.filter(
      (e) => e.linkedAnimalId === animal.id && !e.isReversed
    );
    const costBreakdown = calculateAnimalTotalCosts(animal, db.expenses, db.expenseAllocations);
    const attachments = db.attachments.filter((att) => att.animalId === animal.id);

    res.json({
      animal,
      identifiers,
      timeline,
      healthEpisodes,
      treatments,
      vaccinations,
      weights,
      breedingEvents,
      calvingEvents,
      allocations,
      directExpenses,
      costBreakdown,
      attachments,
    });
  }
);

/**
 * POST /api/animals
 * Registers a new animal with backend validation and tag normalization.
 */
animalsRouter.post(
  '/animals',
  requirePermission('EDIT_ANIMALS'),
  async (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const {
      tagNumber,
      name,
      type,
      sex,
      breed,
      dateOfBirth,
      acquisitionType,
      sourceDetails,
      acquisitionDate,
      purchasePrice,
      damTag,
      sireId,
      herdGroup,
      location,
      identifyingCharacteristics,
      initialWeightKg,
      notes,
    } = req.body;

    const tagCheck = validateNewTagCandidate(
      String(tagNumber || ''),
      db.animals,
      db.animalIdentifiers
    );
    if (!tagCheck.valid) {
      res.status(400).json({ error: tagCheck.error });
      return;
    }

    const nameVal = validateRequiredString(name, 'Animal name');
    if (!nameVal.valid) {
      res.status(400).json({ error: nameVal.error });
      return;
    }

    if (!type || !sex || !breed || !dateOfBirth) {
      res.status(400).json({
        error: 'Name, animal type, sex, breed, and date of birth are required.',
      });
      return;
    }

    const priceCheck = validateNonNegativeNumber(purchasePrice, 'Purchase price');
    if (!priceCheck.valid) {
      res.status(400).json({ error: priceCheck.error });
      return;
    }

    const normalized = normalizeSearchTag(tagNumber);
    const nextNum = 1001 + db.animals.length;
    const permanentId = `ANM-${nextNum}`;
    const regDate = acquisitionDate || new Date().toISOString().slice(0, 10);

    let resolvedDamId: string | null = null;
    let resolvedDamTag: string | null = null;
    if (damTag) {
      const damRes = resolveAnimalByTag(String(damTag), db.animals, db.animalIdentifiers);
      if (damRes) {
        resolvedDamId = damRes.animal.id;
        resolvedDamTag = damRes.animal.currentTag;
      } else {
        resolvedDamTag = normalizeSearchTag(damTag);
      }
    } else if (req.body.damId) {
      const damAnimal = db.animals.find((a) => a.id === req.body.damId);
      if (damAnimal) {
        resolvedDamId = damAnimal.id;
        resolvedDamTag = damAnimal.currentTag;
      }
    }

    const parsedPrice =
      purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== ''
        ? Number(purchasePrice)
        : null;

    const newAnimal: Animal = {
      id: permanentId,
      currentTag: normalized,
      name: String(name).trim(),
      type,
      sex,
      breed: String(breed).trim(),
      dateOfBirth,
      acquisitionType: acquisitionType || 'Born on Farm',
      sourceDetails: String(sourceDetails || '').trim(),
      acquisitionDate: regDate,
      purchasePrice: parsedPrice,
      damTag: resolvedDamTag,
      damId: resolvedDamId,
      sireId: sireId ? String(sireId).trim() : null,
      herdGroup: herdGroup || 'General Herd',
      location: location || 'Main Paddock',
      identifyingCharacteristics: String(identifyingCharacteristics || '').trim(),
      status: 'Active',
      notes: String(notes || '').trim(),
      registeredBy: user.fullName,
      registeredAt: regDate,
    };

    const newIdentifier: AnimalIdentifier = {
      id: `IDENT-${Date.now()}`,
      animalId: permanentId,
      tagNumber: normalized,
      normalizedTag: normalized,
      isCurrent: true,
      assignedAt: regDate,
      retiredAt: null,
      retiredReason: null,
      assignedBy: user.fullName,
    };

    try {
      await insertAnimal(newAnimal, newIdentifier);
      // Also keep local in‑memory store for runtime operations
      db.animals.unshift(newAnimal);
      db.animalIdentifiers.push(newIdentifier);
    } catch (err: any) {
      console.error('Supabase insert error:', err);
      const msg =
        err?.message ||
        err?.error_description ||
        (typeof err === 'string' ? err : 'Unknown database error');
      let hint = '';
      if (
        err?.code === '42501' ||
        String(msg).includes('row-level security') ||
        String(msg).includes('violates row-level security')
      ) {
        hint =
          ' (RLS Policy Violation: Run the permissive RLS policy migration in Supabase SQL Editor, or ensure SUPABASE_SERVICE_ROLE_KEY is set in .env)';
      } else if (err?.code === '42P01' || String(msg).includes('does not exist')) {
        hint =
          ' (Table Not Found: Ensure you have executed supabase/consolidated_schema.sql in your Supabase SQL Editor)';
      } else if (err?.hint) {
        hint = ` (${err.hint})`;
      }
      res.status(500).json({
        error: `Failed to persist animal to database: ${msg}${hint}`,
        details: err?.details || null,
        code: err?.code || null,
      });
      return;
    }

    appendAnimalEvent(
      permanentId,
      regDate,
      'REGISTRATION',
      `Animal Registered with Tag ${normalized}`,
      `Permanent ID ${permanentId} created (${newAnimal.breed} ${newAnimal.type}, ${newAnimal.acquisitionType}).`,
      permanentId,
      parsedPrice,
      user.fullName
    );

    if (initialWeightKg && Number(initialWeightKg) > 0) {
      const wRec: WeightRecord = {
        id: `WGT-${Date.now()}`,
        animalId: permanentId,
        measurementDate: regDate,
        weightKg: Number(initialWeightKg),
        bodyConditionScore: 3.0,
        stage: newAnimal.type === 'Calf' ? 'Birth' : 'Routine',
        recordedBy: user.fullName,
        notes: 'Initial registration weight',
      };
      db.weightRecords.push(wRec);
      // Persist weight record to Supabase
      try {
        await insertWeightRecord(wRec);
      } catch (err) {
        console.warn('Supabase weight insert error:', err);
      }
      appendAnimalEvent(
        permanentId,
        regDate,
        'WEIGHT',
        `Initial Weight Recorded: ${wRec.weightKg} kg`,
        `Baseline weight logged at registration.`,
        wRec.id,
        null,
        user.fullName
      );
    }

    if (parsedPrice && parsedPrice > 0 && newAnimal.acquisitionType === 'Purchased') {
      const expId = `EXP-${Date.now()}`;
      const exp: Expense = {
        id: expId,
        transactionCode: generateExpenseTransactionCode(db.expenses),
        expenseDate: regDate,
        amountNgn: parsedPrice,
        category: 'Animal Purchase',
        description: `Acquisition of ${newAnimal.breed} ${newAnimal.type} (${normalized} · ${newAnimal.name})`,
        supplierId: null,
        supplierName: newAnimal.sourceDetails || 'Livestock Vendor',
        paymentStatus: 'Paid',
        paymentMethod: 'Bank Transfer',
        invoiceNumber: `ACQ-${normalized}`,
        linkedEntityType: 'Animal',
        linkedEntityId: permanentId,
        linkedAnimalId: permanentId,
        approvalStatus: 'Approved',
        enteredBy: user.fullName,
        approvedBy: user.fullName,
        isReversed: false,
        reversalReason: null,
      };
      db.expenses.unshift(exp);
      const acqPayment: Payment = {
        id: `PAY-${Date.now()}`,
        expenseId: expId,
        paymentDate: regDate,
        amountNgn: parsedPrice,
        paymentMethod: 'Bank Transfer',
        referenceNumber: `REF-${normalized}`,
        recordedBy: user.fullName,
        notes: 'Acquisition payment',
      };
      db.payments.push(acqPayment);
      // Payment has an FK on expense_id, so it must not reach Supabase before the expense does.
      insertExpense(exp)
        .catch((e) => console.warn('Supabase acquisition expense sync warning:', e))
        .then(() => insertPayment(acqPayment))
        .catch((e) => console.warn('Supabase acquisition payment sync warning:', e));
    }

    appendAudit(
      user,
      'REGISTER_ANIMAL',
      'Animal',
      permanentId,
      normalized,
      `Registered ${newAnimal.name} (${normalized}) with permanent ID ${permanentId}.`,
      null,
      `${normalized} (${permanentId})`
    );

    saveDatabase(db);
    res.status(201).json({ animal: newAnimal, identifier: newIdentifier });
  }
);

/**
 * POST /api/animals/:id/replace-tag
 * Replaces an animal's active tag and retires the previous tag into the historical registry.
 */
animalsRouter.post(
  '/animals/:id/replace-tag',
  requirePermission('EDIT_ANIMALS'),
  async (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }

    const { newTagNumber, reason, changeDate } = req.body;
    const reasonCheck = validateRequiredString(reason, 'Reason for tag replacement', 4);
    if (!reasonCheck.valid) {
      res.status(400).json({ error: reasonCheck.error });
      return;
    }

    const tagCheck = validateNewTagCandidate(
      String(newTagNumber || ''),
      db.animals,
      db.animalIdentifiers
    );
    if (!tagCheck.valid) {
      res.status(400).json({ error: tagCheck.error });
      return;
    }

    const normalizedNew = normalizeSearchTag(newTagNumber);
    const oldTag = animal.currentTag;
    const effectiveDate = changeDate || new Date().toISOString().slice(0, 10);

    for (const ident of db.animalIdentifiers) {
      if (ident.animalId === animal.id && ident.isCurrent) {
        ident.isCurrent = false;
        ident.retiredAt = effectiveDate;
        ident.retiredReason = String(reason).trim();
      }
    }

    const newIdent: AnimalIdentifier = {
      id: `IDENT-${Date.now()}`,
      animalId: animal.id,
      tagNumber: normalizedNew,
      normalizedTag: normalizedNew,
      isCurrent: true,
      assignedAt: effectiveDate,
      retiredAt: null,
      retiredReason: null,
      assignedBy: user.fullName,
    };

    try {
      await replaceAnimalTagInDb(
        animal.id,
        normalizedNew,
        newIdent,
        effectiveDate,
        String(reason).trim()
      );
    } catch (err) {
      console.error('Supabase replace-tag error:', err);
      res.status(500).json({ error: 'Failed to update tag identifier in database.' });
      return;
    }

    db.animalIdentifiers.push(newIdent);
    animal.currentTag = normalizedNew;

    appendAnimalEvent(
      animal.id,
      effectiveDate,
      'TAG_CHANGE',
      `Tag Replaced: ${oldTag} → ${normalizedNew}`,
      `Previous tag ${oldTag} retired (${reason}) and kept searchable. Permanent ID ${animal.id} unchanged.`,
      newIdent.id,
      null,
      user.fullName
    );

    appendAudit(
      user,
      'TAG_REPLACEMENT',
      'Animal',
      animal.id,
      normalizedNew,
      `Replaced tag ${oldTag} with ${normalizedNew} on animal ${animal.id}. Reason: ${reason}`,
      oldTag,
      normalizedNew
    );

    saveDatabase(db);
    res.json({ animal, newIdentifier: newIdent });
  }
);

/**
 * POST /api/animals/:id/status
 * Updates animal status while preserving all historical records.
 */
animalsRouter.post(
  '/animals/:id/status',
  requirePermission('EDIT_ANIMALS'),
  async (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }

    const { newStatus, reason, effectiveDate } = req.body;
    if (!newStatus || !reason) {
      res.status(400).json({ error: 'New status and reason are required.' });
      return;
    }

    const prevStatus = animal.status;
    const dateStr = effectiveDate || new Date().toISOString().slice(0, 10);
    animal.status = newStatus;
    animal.statusChangedAt = dateStr;
    animal.statusReason = String(reason).trim();

    try {
      await updateAnimal(animal.id, {
        status: newStatus,
        statusChangedAt: dateStr,
        statusReason: String(reason).trim(),
      });
    } catch (err) {
      console.warn('Supabase animal status sync warning:', err);
    }

    appendAnimalEvent(
      animal.id,
      dateStr,
      'STATUS_CHANGE',
      `Status Updated: ${prevStatus} → ${newStatus}`,
      `Reason: ${reason}. All historical health, feed, breeding, and cost records preserved.`,
      animal.id,
      null,
      user.fullName
    );

    appendAudit(
      user,
      'ANIMAL_STATUS_CHANGE',
      'Animal',
      animal.id,
      animal.currentTag,
      `Changed status of ${animal.currentTag} (${animal.id}) from ${prevStatus} to ${newStatus}. Reason: ${reason}`,
      prevStatus,
      newStatus
    );

    saveDatabase(db);
    res.json({ animal });
  }
);

/**
 * PUT /api/animals/:id
 * Updates animal biodata while preserving permanent internal ID and historical tags.
 */
animalsRouter.put(
  '/animals/:id',
  requirePermission('EDIT_ANIMALS'),
  async (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }

    const {
      name,
      type,
      sex,
      breed,
      dateOfBirth,
      acquisitionType,
      sourceDetails,
      acquisitionDate,
      purchasePrice,
      damTag,
      sireId,
      herdGroup,
      location,
      identifyingCharacteristics,
      notes,
    } = req.body;

    if (name !== undefined && !validateRequiredString(name, 'Animal name').valid) {
      res.status(400).json({ error: 'Animal name cannot be empty.' });
      return;
    }
    if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== '') {
      const priceCheck = validateNonNegativeNumber(purchasePrice, 'Purchase price');
      if (!priceCheck.valid) {
        res.status(400).json({ error: priceCheck.error });
        return;
      }
    }

    const prevSnapshot = JSON.stringify({
      name: animal.name,
      type: animal.type,
      sex: animal.sex,
      breed: animal.breed,
      dateOfBirth: animal.dateOfBirth,
      acquisitionType: animal.acquisitionType,
      purchasePrice: animal.purchasePrice,
      damTag: animal.damTag,
      sireId: animal.sireId,
      herdGroup: animal.herdGroup,
      location: animal.location,
    });

    if (name !== undefined) animal.name = String(name).trim();
    if (type !== undefined && type) animal.type = String(type).trim();
    if (sex !== undefined && sex) animal.sex = String(sex).trim();
    if (breed !== undefined && breed) animal.breed = String(breed).trim();
    if (dateOfBirth !== undefined && dateOfBirth) animal.dateOfBirth = String(dateOfBirth).trim();
    if (acquisitionType !== undefined && acquisitionType) {
      animal.acquisitionType = String(acquisitionType).trim();
    }
    if (sourceDetails !== undefined) animal.sourceDetails = String(sourceDetails).trim();
    if (acquisitionDate !== undefined && acquisitionDate) {
      animal.acquisitionDate = String(acquisitionDate).trim();
    }
    if (purchasePrice !== undefined) {
      animal.purchasePrice =
        purchasePrice === null || purchasePrice === '' ? null : Number(purchasePrice);
    }
    if (damTag !== undefined) {
      const cleanDamTag = String(damTag || '').trim();
      if (!cleanDamTag) {
        animal.damTag = null;
        animal.damId = null;
      } else {
        const normDam = normalizeSearchTag(cleanDamTag);
        animal.damTag = normDam;
        const resolvedDam = resolveAnimalByTag(normDam, db.animals, db.animalIdentifiers);
        animal.damId =
          resolvedDam && resolvedDam.animal.id !== animal.id ? resolvedDam.animal.id : null;
      }
    }
    if (sireId !== undefined) {
      animal.sireId = String(sireId || '').trim() || null;
    }
    if (herdGroup !== undefined && herdGroup) animal.herdGroup = String(herdGroup).trim();
    if (location !== undefined && location) animal.location = String(location).trim();
    if (identifyingCharacteristics !== undefined) {
      animal.identifyingCharacteristics = String(identifyingCharacteristics).trim();
    }
    if (notes !== undefined) animal.notes = String(notes).trim();

    const nextSnapshot = JSON.stringify({
      name: animal.name,
      type: animal.type,
      sex: animal.sex,
      breed: animal.breed,
      dateOfBirth: animal.dateOfBirth,
      acquisitionType: animal.acquisitionType,
      purchasePrice: animal.purchasePrice,
      damTag: animal.damTag,
      sireId: animal.sireId,
      herdGroup: animal.herdGroup,
      location: animal.location,
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    appendAnimalEvent(
      animal.id,
      todayStr,
      'BIODATA_UPDATE',
      `Biodata Updated for ${animal.currentTag}`,
      `Updated profile details (${animal.breed} ${animal.type} · ${animal.herdGroup} · ${animal.location}). Permanent ID ${animal.id} unchanged.`,
      animal.id,
      null,
      user.fullName
    );

    appendAudit(
      user,
      'UPDATE_ANIMAL_BIODATA',
      'Animal',
      animal.id,
      animal.currentTag,
      `Updated biodata for ${animal.currentTag} (${animal.name}, ID: ${animal.id}).`,
      prevSnapshot,
      nextSnapshot
    );

    try {
      await updateAnimal(animal.id, animal);
    } catch (err) {
      console.warn('Supabase animal update sync warning:', err);
    }

    saveDatabase(db);
    res.json({ animal });
  }
);

/**
 * DELETE /api/animals/:id
 * Enforces archival policy: animals with linked history cannot be permanently deleted.
 */
animalsRouter.delete(
  '/animals/:id',
  requirePermission('REVERSE_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }
    const linkedCount =
      db.animalEvents.filter((e) => e.animalId === animal.id).length +
      db.healthEpisodes.filter((h) => h.animalId === animal.id).length +
      db.weightRecords.filter((w) => w.animalId === animal.id).length;

    if (linkedCount > 0) {
      res.status(400).json({
        error: `Deletion restricted: Animal ${animal.currentTag} (${animal.id}) has ${linkedCount} linked historical records. Use Status Update (Sold, Transferred, Deceased, or Culled) to archive while preserving history.`,
      });
      return;
    }

    res.status(400).json({
      error: 'Permanent deletion is disabled per MAIS LTD archival policy.',
    });
  }
);

/**
 * GET /api/attachments
 * Supports filtering by animalId, entityType, and entityId
 */
animalsRouter.get(
  '/attachments',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { animalId, entityType, entityId } = req.query;
    let list = [...db.attachments];
    if (animalId) {
      list = list.filter((a) => a.animalId === String(animalId));
    }
    if (entityType) {
      list = list.filter((a) => a.entityType === String(entityType));
    }
    if (entityId) {
      list = list.filter((a) => a.entityId === String(entityId));
    }
    res.json({ items: list });
  }
);

/**
 * POST /api/attachments
 * Supports animal documents as well as Expense receipts & invoices with SHA-256 content verification.
 */
animalsRouter.post(
  '/attachments',
  requirePermission('EDIT_ANIMALS'),
  async (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const {
      animalId,
      entityType,
      entityId,
      fileName,
      fileType,
      fileSizeKb,
      notes,
      mimeType,
      contentBase64,
    } = req.body;

    if (!fileName || !String(fileName).trim()) {
      res.status(400).json({ error: 'Document or receipt file name is required.' });
      return;
    }

    const resolvedEntityType = entityType || 'Animal';
    const animal = animalId ? db.animals.find((a) => a.id === animalId) : null;
    const expense =
      resolvedEntityType === 'Expense' && entityId
        ? db.expenses.find((e) => e.id === entityId)
        : null;

    if (!animal && !expense) {
      res.status(400).json({
        error: 'Attachment must be linked to a valid animal record or expense transaction.',
      });
      return;
    }

    const sizeKb = Math.max(1, Math.min(25600, Number(fileSizeKb || 340)));
    const dateStr = new Date().toISOString().slice(0, 10);
    const linkedAnimalId = animal?.id || expense?.linkedAnimalId || null;
    const resolvedEntityId = entityId || animal?.id || expense?.id || '';
    const sha256Hash = computeContentIntegrityHash(
      `${fileName}|${resolvedEntityType}|${resolvedEntityId}|${sizeKb}|${contentBase64 || dateStr}`
    );

    const att: AttachmentRecord = {
      id: `ATT-${Date.now()}`,
      animalId: linkedAnimalId,
      entityType: resolvedEntityType,
      entityId: resolvedEntityId,
      fileName: String(fileName).trim(),
      fileType:
        fileType || (resolvedEntityType === 'Expense' ? 'Invoice / Receipt' : 'Veterinary Report'),
      fileSizeKb: sizeKb,
      uploadedAt: dateStr,
      uploadedBy: user.fullName,
      notes: String(notes || '').trim(),
      sha256Hash,
      mimeType: mimeType ? String(mimeType) : undefined,
    };

    try {
      const uploaded = await uploadAttachment(att, contentBase64);
      if (uploaded) {
        att.storageBucket = uploaded.storageBucket;
        att.storagePath = uploaded.storagePath;
      }
    } catch (err) {
      console.warn('Supabase attachment persistence warning:', err);
    }
    db.attachments.unshift(att);

    if (linkedAnimalId) {
      appendAnimalEvent(
        linkedAnimalId,
        dateStr,
        'DOCUMENT',
        `Document Uploaded: ${att.fileName}`,
        `Type: ${att.fileType} (${att.fileSizeKb} KB · ${sha256Hash.slice(0, 15)}) · ${att.notes}`,
        att.id,
        null,
        user.fullName
      );
    }

    appendAudit(
      user,
      'UPLOAD_ATTACHMENT',
      att.entityType,
      att.entityId,
      animal?.currentTag || null,
      `Attached ${att.fileType} "${att.fileName}" (${att.fileSizeKb} KB, ${sha256Hash}) to ${att.entityType} ${att.entityId}.`,
      null,
      att.fileName
    );

    saveDatabase(db);
    res.status(201).json({ attachment: att });
  }
);

/**
 * GET /api/attachments/:id/signed-url
 * Generates a time-limited (1-hour) signed download URL for private attachments in Supabase Storage.
 */
animalsRouter.get(
  '/attachments/:id/signed-url',
  requirePermission('VIEW_RECORDS'),
  async (req: StaffRequest, res: Response) => {
    const { id } = req.params;
    const att = db.attachments.find((a) => a.id === id);
    if (!att) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }

    if (att.storageBucket && att.storagePath && supabaseClient) {
      try {
        const { data, error } = await supabaseClient.storage
          .from(att.storageBucket)
          .createSignedUrl(att.storagePath, 3600);

        if (error || !data?.signedUrl) {
          res.status(500).json({ error: 'Failed to create signed URL from storage.' });
          return;
        }

        res.json({
          signedUrl: data.signedUrl,
          expiresInSeconds: 3600,
          storageBucket: att.storageBucket,
          storagePath: att.storagePath,
        });
        return;
      } catch {
        res.status(500).json({ error: 'Storage service connection error.' });
        return;
      }
    }

    res.json({
      signedUrl: null,
      fileName: att.fileName,
      sha256Hash: att.sha256Hash,
      message: 'Attachment is archived in local vault with SHA-256 integrity verification.',
    });
  }
);

