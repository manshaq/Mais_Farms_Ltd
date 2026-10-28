import { Router, Response } from 'express';
import {
  calculateWeightHistoryWithADG,
  normalizeTag,
  validateNewTagCandidate,
} from '../../src/domain/farmRules.ts';
import {
  Animal,
  BreedingEvent,
  CalvingEvent,
  Expense,
  ExpenseAllocation,
  WeightRecord,
} from '../../src/types/mais.ts';
import {
  appendAnimalEvent,
  appendAudit,
  db,
  generateExpenseTransactionCode,
  saveDatabase,
} from '../db/store.ts';
import {
  insertAnimal,
  insertBreedingEvent,
  insertCalvingEvent,
  insertExpense,
  insertExpenseAllocation,
  insertPayment,
  insertTask,
  insertWeightRecord,
  updateBreedingEvent,
} from '../db/supabaseService.ts';
import { paginateItems, requirePermission, StaffRequest } from '../middleware/auth.ts';
import {
  validateNonNegativeNumber,
  validatePositiveNumber,
  validateRequiredString,
} from '../validation/validators.ts';

export const breedingRouter = Router();

/**
 * GET /api/breeding-events
 * Supports pagination and filters (animalId, status)
 */
breedingRouter.get(
  '/breeding-events',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { animalId, status, page, limit } = req.query;
    let filtered = [...db.breedingEvents];
    if (animalId) {
      filtered = filtered.filter((b) => b.animalId === String(animalId));
    }
    if (status && status !== 'ALL') {
      filtered = filtered.filter((b) => b.status === String(status));
    }
    res.json(paginateItems(filtered, page, limit));
  }
);

/**
 * POST /api/animals/:id/breeding-events
 */
breedingRouter.post(
  '/animals/:id/breeding-events',
  requirePermission('MANAGE_BREEDING'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }

    const {
      heatDate,
      inseminationDate,
      attemptNumber,
      sireIdOrStraw,
      sireBreed,
      batchNumber,
      technician,
      pregnancyCheckDate,
      pregnancyCheckMethod,
      pregnancyResult,
      estimatedDueDate,
      costNgn,
      notes,
    } = req.body;

    if (
      !inseminationDate ||
      !validateRequiredString(sireIdOrStraw, 'Sire / Straw ID').valid ||
      !estimatedDueDate
    ) {
      res.status(400).json({
        error: 'Insemination date, sire/straw ID, and estimated due date are required.',
      });
      return;
    }

    const costCheck = validateNonNegativeNumber(costNgn, 'Breeding cost');
    if (!costCheck.valid) {
      res.status(400).json({ error: costCheck.error });
      return;
    }

    const cost = Number(costNgn || 0);
    const brd: BreedingEvent = {
      id: `BRD-${Date.now()}`,
      animalId: animal.id,
      heatDate: heatDate || inseminationDate,
      inseminationDate,
      attemptNumber: Math.max(1, Number(attemptNumber || 1)),
      sireIdOrStraw: String(sireIdOrStraw).trim(),
      sireBreed: String(sireBreed || animal.breed).trim(),
      batchNumber: String(batchNumber || 'STW-STD').trim(),
      technician: String(technician || user.fullName).trim(),
      pregnancyCheckDate: pregnancyCheckDate || null,
      pregnancyCheckMethod: pregnancyCheckMethod || 'Pending',
      pregnancyResult: pregnancyResult || 'Pending',
      estimatedDueDate,
      status:
        pregnancyResult === 'Confirmed Pregnant'
          ? 'Confirmed Pregnant'
          : pregnancyResult === 'Open / Not Pregnant'
          ? 'Failed / Open'
          : 'Inseminated',
      costNgn: cost,
      notes: String(notes || '').trim(),
    };

    db.breedingEvents.unshift(brd);

    appendAnimalEvent(
      animal.id,
      inseminationDate,
      'BREEDING',
      `Insemination Logged (Sire: ${brd.sireIdOrStraw})`,
      `Attempt #${brd.attemptNumber} · Status: ${brd.status} · Est. Due Date: ${brd.estimatedDueDate}`,
      brd.id,
      cost > 0 ? cost : null,
      user.fullName
    );

    if (cost > 0) {
      const expId = `EXP-${Date.now()}`;
      const breedingExpense: Expense = {
        id: expId,
        transactionCode: generateExpenseTransactionCode(db.expenses),
        expenseDate: inseminationDate,
        amountNgn: cost,
        category: 'Breeding & AI',
        description: `AI service & straw (${brd.sireIdOrStraw}) for ${animal.currentTag}`,
        supplierId: null,
        supplierName: brd.technician,
        paymentStatus: 'Paid',
        paymentMethod: 'Bank Transfer',
        invoiceNumber: `AI-${brd.id.slice(-5)}`,
        linkedEntityType: 'Breeding',
        linkedEntityId: brd.id,
        linkedAnimalId: animal.id,
        approvalStatus: 'Approved',
        enteredBy: user.fullName,
        approvedBy: user.fullName,
        isReversed: false,
        reversalReason: null,
      };
      db.expenses.unshift(breedingExpense);
      // Allocation/payment below have an FK on expense_id, so each must wait
      // for the expense's Supabase write instead of racing it.
      const breedingExpenseReady = insertExpense(breedingExpense).catch((err) => {
        console.warn('⚠️ [MAIS DB] Supabase expense persistence warning:', err?.message || err);
      });

      const breedingAlloc: ExpenseAllocation = {
        id: `ALC-${Date.now()}`,
        expenseId: expId,
        feedIssueId: null,
        animalId: animal.id,
        allocationDate: inseminationDate,
        allocationCategory: 'Direct Breeding',
        allocationMethod: 'Direct 100%',
        amountNgn: cost,
        notes: `Direct AI breeding cost for ${animal.currentTag}`,
      };
      db.expenseAllocations.unshift(breedingAlloc);
      breedingExpenseReady
        .then(() => insertExpenseAllocation(breedingAlloc))
        .catch((err) => {
          console.warn('⚠️ [MAIS DB] Supabase expense allocation persistence warning:', err?.message || err);
        });

      const breedingPayment = {
        id: `PAY-${Date.now()}`,
        expenseId: expId,
        paymentDate: inseminationDate,
        amountNgn: cost,
        paymentMethod: 'Bank Transfer' as const,
        referenceNumber: `AI-${brd.id.slice(-5)}`,
        recordedBy: user.fullName,
        notes: 'Breeding service settlement',
      };
      db.payments.push(breedingPayment);
      breedingExpenseReady
        .then(() => insertPayment(breedingPayment))
        .catch((err) => {
          console.warn('⚠️ [MAIS DB] Supabase payment persistence warning:', err?.message || err);
        });
    }

    if (brd.pregnancyCheckDate && brd.pregnancyResult === 'Pending') {
      const pregCheckTask = {
        id: `TSK-${Date.now()}`,
        title: `Pregnancy Check Due for ${animal.currentTag} (Sire ${brd.sireIdOrStraw})`,
        category: 'Pregnancy Check' as const,
        dueDate: brd.pregnancyCheckDate,
        priority: 'Medium' as const,
        assignedTo: brd.technician,
        animalId: animal.id,
        animalTag: animal.currentTag,
        referenceId: brd.id,
        status: 'Pending' as const,
        completionNotes: '',
        completedAt: null,
      };
      db.tasks.unshift(pregCheckTask);
      insertTask(pregCheckTask).catch((err) => {
        console.warn('⚠️ [MAIS DB] Supabase task persistence warning:', err?.message || err);
      });
    }

    appendAudit(
      user,
      'RECORD_BREEDING',
      'BreedingEvent',
      brd.id,
      animal.currentTag,
      `Recorded insemination for ${animal.currentTag} with sire ${brd.sireIdOrStraw}.`
    );

    saveDatabase(db);
    insertBreedingEvent(brd).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase breeding event persistence warning:', err?.message || err);
    });
    res.status(201).json({ breedingEvent: brd });
  }
);

/**
 * GET /api/calving-events
 */
breedingRouter.get(
  '/calving-events',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { damId, page, limit } = req.query;
    let filtered = [...db.calvingEvents];
    if (damId) {
      filtered = filtered.filter((c) => c.damId === String(damId));
    }
    res.json(paginateItems(filtered, page, limit));
  }
);

/**
 * POST /api/calving-events
 * Records calving and automatically registers linked calves with permanent IDs and parent links.
 */
breedingRouter.post(
  '/calving-events',
  requirePermission('MANAGE_BREEDING'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const {
      damId,
      breedingEventId,
      calvingDate,
      outcome,
      assistanceRequired,
      veterinarian,
      notes,
      calves,
    } = req.body;

    const dam = db.animals.find((a) => a.id === damId);
    if (!dam) {
      res.status(400).json({ error: 'Selected Dam animal not found.' });
      return;
    }

    const calfInputList: Array<{
      tagNumber: string;
      name: string;
      sex: 'Female' | 'Male';
      birthWeightKg: number;
      sireId?: string;
    }> = Array.isArray(calves) ? calves : [];

    for (const c of calfInputList) {
      const check = validateNewTagCandidate(c.tagNumber, db.animals, db.animalIdentifiers);
      if (!check.valid) {
        res.status(400).json({ error: check.error });
        return;
      }
    }

    const dateStr = calvingDate || new Date().toISOString().slice(0, 10);
    const createdCalfIds: string[] = [];
    const createdCalfTags: string[] = [];

    const linkedBreeding = breedingEventId
      ? db.breedingEvents.find((b) => b.id === breedingEventId)
      : db.breedingEvents.find(
          (b) => b.animalId === dam.id && b.status === 'Confirmed Pregnant'
        );

    if (linkedBreeding) {
      linkedBreeding.status = 'Calved';
      updateBreedingEvent(linkedBreeding.id, { status: linkedBreeding.status }).catch((err) => {
        console.warn('⚠️ [MAIS DB] Supabase breeding event update warning:', err?.message || err);
      });
    }

    for (const c of calfInputList) {
      const normTag = normalizeTag(c.tagNumber);
      const permanentCalfId = `ANM-${1001 + db.animals.length}`;
      const sire = c.sireId || linkedBreeding?.sireIdOrStraw || 'SIRE-MAIS-STD';

      const calfAnimal: Animal = {
        id: permanentCalfId,
        currentTag: normTag,
        name: String(c.name || `Calf of ${dam.name}`).trim(),
        type: 'Calf',
        sex: c.sex || 'Female',
        breed: dam.breed,
        dateOfBirth: dateStr,
        acquisitionType: 'Born on Farm',
        sourceDetails: `Born to Dam ${dam.currentTag} (${dam.id}) at MAIS LTD`,
        acquisitionDate: dateStr,
        purchasePrice: null,
        damTag: dam.currentTag,
        damId: dam.id,
        sireId: sire,
        herdGroup: 'Calf Nursery',
        location: 'Calf Barn · Pen C1',
        identifyingCharacteristics: `Offspring of Dam ${dam.currentTag} and Sire ${sire}`,
        status: 'Active',
        notes: String(notes || 'Registered at calving').trim(),
        registeredBy: user.fullName,
        registeredAt: dateStr,
      };

      db.animals.unshift(calfAnimal);
      const calfIdent = {
        id: `IDENT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        animalId: permanentCalfId,
        tagNumber: normTag,
        normalizedTag: normTag,
        isCurrent: true,
        assignedAt: dateStr,
        retiredAt: null,
        retiredReason: null,
        assignedBy: user.fullName,
      };
      db.animalIdentifiers.push(calfIdent);
      // Other inserts below (weight record, animal event) have an FK on this
      // calf's animal_id, so they must wait for this insert rather than race it.
      const calfAnimalReady = insertAnimal(calfAnimal, calfIdent).catch((e) =>
        console.warn('Supabase calf insert warning:', e)
      );

      if (c.birthWeightKg && Number(c.birthWeightKg) > 0) {
        const wRec: WeightRecord = {
          id: `WGT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          animalId: permanentCalfId,
          measurementDate: dateStr,
          weightKg: Number(c.birthWeightKg),
          bodyConditionScore: 3.0,
          stage: 'Birth',
          recordedBy: user.fullName,
          notes: 'Birth weight recorded at calving',
        };
        db.weightRecords.push(wRec);
        calfAnimalReady
          .then(() => insertWeightRecord(wRec))
          .catch((e) => console.warn('Supabase birth weight sync warning:', e));
      }

      appendAnimalEvent(
        permanentCalfId,
        dateStr,
        'REGISTRATION',
        `Calf Born & Registered (${normTag})`,
        `Dam: ${dam.currentTag} (${dam.id}) · Sire: ${sire} · Birth Weight: ${c.birthWeightKg || 'N/A'} kg.`,
        permanentCalfId,
        null,
        user.fullName,
        calfAnimalReady
      );

      createdCalfIds.push(permanentCalfId);
      createdCalfTags.push(normTag);
    }

    const calvingEvt: CalvingEvent = {
      id: `CLV-${Date.now()}`,
      damId: dam.id,
      breedingEventId: linkedBreeding?.id || null,
      calvingDate: dateStr,
      outcome: outcome || (createdCalfIds.length > 1 ? 'Live Twins' : 'Live Single'),
      assistanceRequired: assistanceRequired || 'None',
      calfIds: createdCalfIds,
      calfTags: createdCalfTags,
      veterinarian: String(veterinarian || user.fullName).trim(),
      notes: String(notes || '').trim(),
      recordedBy: user.fullName,
    };

    db.calvingEvents.unshift(calvingEvt);

    appendAnimalEvent(
      dam.id,
      dateStr,
      'CALVING',
      `Calving Event: ${calvingEvt.outcome} (${createdCalfTags.join(', ') || 'No live tag'})`,
      `Assistance: ${calvingEvt.assistanceRequired} · Linked Calf IDs: ${createdCalfIds.join(', ')}`,
      calvingEvt.id,
      null,
      user.fullName
    );

    appendAudit(
      user,
      'RECORD_CALVING',
      'CalvingEvent',
      calvingEvt.id,
      dam.currentTag,
      `Recorded calving for Dam ${dam.currentTag}; created calf record(s): ${createdCalfTags.join(', ')}.`
    );

    saveDatabase(db);
    insertCalvingEvent(calvingEvt).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase calving event persistence warning:', err?.message || err);
    });
    res.status(201).json({ calvingEvent: calvingEvt, calfIds: createdCalfIds });
  }
);

/**
 * GET /api/animals/:id/weights
 */
breedingRouter.get(
  '/animals/:id/weights',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }
    const historyWithAdg = calculateWeightHistoryWithADG(
      db.weightRecords.filter((w) => w.animalId === animal.id)
    );
    res.json({ animalId: animal.id, weights: historyWithAdg });
  }
);

/**
 * POST /api/animals/:id/weights
 * Records dated weight measurement and computes ADG on the backend.
 */
breedingRouter.post(
  '/animals/:id/weights',
  requirePermission('MANAGE_BREEDING'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }

    const { measurementDate, weightKg, bodyConditionScore, stage, notes } = req.body;
    const weightCheck = validatePositiveNumber(weightKg, 'Weight (kg)');
    if (!weightCheck.valid) {
      res.status(400).json({ error: weightCheck.error });
      return;
    }

    const wVal = Number(weightKg);
    const dateStr = measurementDate || new Date().toISOString().slice(0, 10);
    const newWeight: WeightRecord = {
      id: `WGT-${Date.now()}`,
      animalId: animal.id,
      measurementDate: dateStr,
      weightKg: wVal,
      bodyConditionScore: bodyConditionScore ? Number(bodyConditionScore) : 3.25,
      stage: stage || 'Routine',
      recordedBy: user.fullName,
      notes: String(notes || '').trim(),
    };

    db.weightRecords.push(newWeight);
    insertWeightRecord(newWeight).catch((e) => console.warn('Supabase weight sync warning:', e));
    const historyWithAdg = calculateWeightHistoryWithADG(
      db.weightRecords.filter((w) => w.animalId === animal.id)
    );
    const latestComputed = historyWithAdg[historyWithAdg.length - 1];

    appendAnimalEvent(
      animal.id,
      dateStr,
      'WEIGHT',
      `Weight Recorded: ${wVal} kg (${newWeight.stage})`,
      latestComputed?.adgKgPerDay !== null && latestComputed?.adgKgPerDay !== undefined
        ? `ADG: ${latestComputed.adgKgPerDay >= 0 ? '+' : ''}${latestComputed.adgKgPerDay} kg/day over ${latestComputed.daysBetween} days.`
        : `Baseline weight measurement recorded.`,
      newWeight.id,
      null,
      user.fullName
    );

    appendAudit(
      user,
      'RECORD_WEIGHT',
      'WeightRecord',
      newWeight.id,
      animal.currentTag,
      `Recorded weight ${wVal} kg for ${animal.currentTag} on ${dateStr}.`
    );

    saveDatabase(db);
    res.status(201).json({ weightRecord: newWeight, historyWithAdg });
  }
);

/**
 * GET /api/weights (Canonical Section 15 Endpoint)
 */
breedingRouter.get(
  '/weights',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { animalId, stage, page, limit } = req.query;
    let list = [...db.weightRecords];
    if (animalId) list = list.filter((w) => w.animalId === String(animalId));
    if (stage && stage !== 'ALL') list = list.filter((w) => w.stage === String(stage));
    const withAdg = calculateWeightHistoryWithADG(list);
    res.json(paginateItems(withAdg, page, limit));
  }
);

/**
 * POST /api/weights (Canonical Section 15 Endpoint)
 */
breedingRouter.post(
  '/weights',
  requirePermission('MANAGE_BREEDING'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const { animalId, measurementDate, weightKg, bodyConditionScore, stage, notes } = req.body;
    const animal = db.animals.find((a) => a.id === animalId);
    if (!animal) {
      res.status(400).json({ error: 'Valid animalId is required.' });
      return;
    }
    const weightCheck = validatePositiveNumber(weightKg, 'Weight (kg)');
    if (!weightCheck.valid) {
      res.status(400).json({ error: weightCheck.error });
      return;
    }
    const wVal = Number(weightKg);
    const dateStr = measurementDate || new Date().toISOString().slice(0, 10);
    const newWeight: WeightRecord = {
      id: `WGT-${Date.now()}`,
      animalId: animal.id,
      measurementDate: dateStr,
      weightKg: wVal,
      bodyConditionScore: bodyConditionScore ? Number(bodyConditionScore) : 3.25,
      stage: stage || 'Routine',
      recordedBy: user.fullName,
      notes: String(notes || '').trim(),
    };
    db.weightRecords.push(newWeight);
    insertWeightRecord(newWeight).catch((e) => console.warn('Supabase weight sync warning:', e));
    const historyWithAdg = calculateWeightHistoryWithADG(
      db.weightRecords.filter((w) => w.animalId === animal.id)
    );
    appendAudit(
      user,
      'RECORD_WEIGHT',
      'WeightRecord',
      newWeight.id,
      animal.currentTag,
      `Recorded weight ${wVal} kg for ${animal.currentTag} on ${dateStr}.`
    );
    saveDatabase(db);
    res.status(201).json({ weightRecord: newWeight, historyWithAdg });
  }
);

