import { Router, Response } from 'express';
import {
  Expense,
  ExpenseAllocation,
  HealthEpisode,
  Treatment,
  VaccinationRecord,
} from '../../src/types/mais.ts';
import { appendAnimalEvent, appendAudit, db, saveDatabase } from '../db/store.ts';
import { paginateItems, requirePermission, StaffRequest } from '../middleware/auth.ts';
import {
  validateNonNegativeNumber,
  validateRequiredString,
} from '../validation/validators.ts';

export const healthRouter = Router();

/**
 * GET /api/health-episodes
 * Supports pagination and filters (animalId, status, severity, category)
 */
healthRouter.get(
  '/health-episodes',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { animalId, status, severity, category, page, limit } = req.query;
    let filtered = [...db.healthEpisodes];

    if (animalId) {
      filtered = filtered.filter((e) => e.animalId === String(animalId));
    }
    if (status && status !== 'ALL') {
      filtered = filtered.filter((e) => e.status === String(status));
    }
    if (severity && severity !== 'ALL') {
      filtered = filtered.filter((e) => e.severity === String(severity));
    }
    if (category && category !== 'ALL') {
      filtered = filtered.filter((e) => e.diagnosisCategory === String(category));
    }

    const enriched = filtered.map((ep) => ({
      ...ep,
      treatments: db.treatments.filter((t) => t.episodeId === ep.id),
    }));

    res.json(paginateItems(enriched, page, limit));
  }
);

/**
 * POST /api/animals/:id/health-episodes
 * Records a new illness episode and automatically creates follow-up tasks on the backend.
 */
healthRouter.post(
  '/animals/:id/health-episodes',
  requirePermission('RECORD_HEALTH'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }

    const {
      reportedDate,
      symptoms,
      diagnosis,
      diagnosisCategory,
      severity,
      status,
      veterinarian,
      outcome,
      notes,
    } = req.body;

    if (
      !validateRequiredString(symptoms, 'Symptoms').valid ||
      !validateRequiredString(diagnosis, 'Diagnosis').valid ||
      !validateRequiredString(veterinarian, 'Veterinarian').valid
    ) {
      res.status(400).json({
        error:
          'Symptoms, suspected/confirmed diagnosis, and veterinary professional are required.',
      });
      return;
    }

    const dateStr = reportedDate || new Date().toISOString().slice(0, 10);
    const episode: HealthEpisode = {
      id: `HEP-${Date.now()}`,
      animalId: animal.id,
      reportedDate: dateStr,
      symptoms: String(symptoms).trim(),
      diagnosis: String(diagnosis).trim(),
      diagnosisCategory: diagnosisCategory || 'General Clinical',
      severity: severity || 'Moderate',
      status: status || 'Open',
      veterinarian: String(veterinarian).trim(),
      outcome: String(outcome || 'Under evaluation').trim(),
      notes: String(notes || '').trim(),
      recordedBy: user.fullName,
    };

    db.healthEpisodes.unshift(episode);

    appendAnimalEvent(
      animal.id,
      dateStr,
      'HEALTH_EPISODE',
      `Health Episode Reported: ${episode.diagnosis}`,
      `Severity: ${episode.severity} · Category: ${episode.diagnosisCategory} · Vet: ${episode.veterinarian}`,
      episode.id,
      null,
      user.fullName
    );

    if (
      episode.severity === 'High' ||
      episode.severity === 'Critical' ||
      episode.status === 'Open'
    ) {
      db.tasks.unshift({
        id: `TSK-${Date.now()}`,
        title: `Veterinary Review: ${episode.diagnosis} (${animal.currentTag})`,
        category: 'Open Health Case',
        dueDate: dateStr,
        priority:
          episode.severity === 'Critical' || episode.severity === 'High' ? 'High' : 'Medium',
        assignedTo: episode.veterinarian,
        animalId: animal.id,
        animalTag: animal.currentTag,
        referenceId: episode.id,
        status: 'Pending',
        completionNotes: '',
        completedAt: null,
      });
    }

    appendAudit(
      user,
      'CREATE_HEALTH_EPISODE',
      'HealthEpisode',
      episode.id,
      animal.currentTag,
      `Reported ${episode.severity} health episode "${episode.diagnosis}" for ${animal.currentTag}.`
    );

    saveDatabase(db);
    res.status(201).json({ episode });
  }
);

/**
 * POST /api/health-episodes/:id/treatments
 * Records a veterinary treatment visit, enforces withdrawal periods, and posts an atomic non-duplicating expense + allocation.
 */
healthRouter.post(
  '/health-episodes/:id/treatments',
  requirePermission('RECORD_HEALTH'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const episode = db.healthEpisodes.find((e) => e.id === req.params.id);
    if (!episode) {
      res.status(404).json({ error: 'Health episode not found.' });
      return;
    }
    const animal = db.animals.find((a) => a.id === episode.animalId);
    if (!animal) {
      res.status(404).json({ error: 'Linked animal not found.' });
      return;
    }

    const {
      treatmentDate,
      medicine,
      activeIngredient,
      dosage,
      route,
      durationDays,
      withdrawalMilkDays,
      withdrawalMeatDays,
      administrator,
      veterinarian,
      medicineCost,
      consultationCost,
      otherCost,
      followUpDate,
      outcome,
      notes,
      supplierName,
      paymentStatus,
    } = req.body;

    if (
      !validateRequiredString(medicine, 'Medicine').valid ||
      !validateRequiredString(dosage, 'Dosage').valid ||
      !validateRequiredString(veterinarian, 'Veterinarian').valid
    ) {
      res.status(400).json({
        error: 'Medicine name, authorized dosage, and veterinary professional are required.',
      });
      return;
    }

    if (
      !validateNonNegativeNumber(medicineCost, 'Medicine cost').valid ||
      !validateNonNegativeNumber(consultationCost, 'Consultation cost').valid ||
      !validateNonNegativeNumber(otherCost, 'Other cost').valid
    ) {
      res.status(400).json({
        error: 'Treatment costs cannot be negative.',
      });
      return;
    }

    const dateStr = treatmentDate || new Date().toISOString().slice(0, 10);
    const medCost = Number(medicineCost || 0);
    const consCost = Number(consultationCost || 0);
    const othCost = Number(otherCost || 0);
    const totalCost = medCost + consCost + othCost;

    const treatmentId = `TRT-${Date.now()}`;
    let expenseId: string | null = null;

    if (totalCost > 0) {
      expenseId = `EXP-${Date.now()}`;
      const newExp: Expense = {
        id: expenseId,
        transactionCode: `MAIS-EXP-2026-${db.expenses.length + 101}`,
        expenseDate: dateStr,
        amountNgn: totalCost,
        category: 'Veterinary & Treatment',
        description: `Treatment (${medicine}) for ${animal.currentTag} — Episode: ${episode.diagnosis}`,
        supplierId: 'SUP-02',
        supplierName: supplierName || 'Arewa Veterinary Pharma & Diagnostics',
        paymentStatus: paymentStatus || 'Paid',
        paymentMethod: 'Bank Transfer',
        invoiceNumber: `VET-${treatmentId.slice(-5)}`,
        linkedEntityType: 'Treatment',
        linkedEntityId: treatmentId,
        linkedAnimalId: animal.id,
        approvalStatus: 'Approved',
        enteredBy: user.fullName,
        approvedBy: user.fullName,
        isReversed: false,
        reversalReason: null,
      };
      db.expenses.unshift(newExp);

      const newAlloc: ExpenseAllocation = {
        id: `ALC-${Date.now()}`,
        expenseId,
        feedIssueId: null,
        animalId: animal.id,
        allocationDate: dateStr,
        allocationCategory: 'Direct Treatment',
        allocationMethod: 'Direct 100%',
        amountNgn: totalCost,
        notes: `Direct treatment cost (${medicine}) for ${animal.currentTag}`,
      };
      db.expenseAllocations.unshift(newAlloc);

      if (newExp.paymentStatus === 'Paid') {
        db.payments.push({
          id: `PAY-${Date.now()}`,
          expenseId,
          paymentDate: dateStr,
          amountNgn: totalCost,
          paymentMethod: 'Bank Transfer',
          referenceNumber: `NIP-${treatmentId.slice(-5)}`,
          recordedBy: user.fullName,
          notes: 'Treatment settlement',
        });
      }
    }

    const treatment: Treatment = {
      id: treatmentId,
      episodeId: episode.id,
      animalId: animal.id,
      treatmentDate: dateStr,
      medicine: String(medicine).trim(),
      activeIngredient: String(activeIngredient || medicine).trim(),
      dosage: String(dosage).trim(),
      route: route || 'Intramuscular (IM)',
      durationDays: Math.max(1, Number(durationDays || 1)),
      withdrawalMilkDays: Math.max(0, Number(withdrawalMilkDays || 0)),
      withdrawalMeatDays: Math.max(0, Number(withdrawalMeatDays || 0)),
      administrator: String(administrator || user.fullName).trim(),
      veterinarian: String(veterinarian).trim(),
      medicineCost: medCost,
      consultationCost: consCost,
      otherCost: othCost,
      totalCost,
      followUpDate: followUpDate || null,
      outcome: outcome || 'Pending Follow-up',
      notes: String(notes || '').trim(),
      expenseId,
    };

    db.treatments.unshift(treatment);

    if (treatment.outcome === 'Recovered') {
      episode.status = 'Resolved';
      episode.outcome = `Recovered following ${treatment.medicine}`;
    } else {
      episode.status = 'Under Treatment';
    }

    appendAnimalEvent(
      animal.id,
      dateStr,
      'TREATMENT',
      `Treatment Administered: ${treatment.medicine}`,
      `Dosage: ${treatment.dosage} (${treatment.route}) · Vet: ${treatment.veterinarian} · Withdrawal: Milk ${treatment.withdrawalMilkDays}d / Meat ${treatment.withdrawalMeatDays}d.`,
      treatment.id,
      totalCost,
      user.fullName
    );

    if (treatment.followUpDate) {
      const today = new Date().toISOString().slice(0, 10);
      db.tasks.unshift({
        id: `TSK-${Date.now()}`,
        title: `Treatment Follow-up (${treatment.medicine}) for ${animal.currentTag}`,
        category: 'Treatment Follow-up',
        dueDate: treatment.followUpDate,
        priority: 'High',
        assignedTo: treatment.veterinarian,
        animalId: animal.id,
        animalTag: animal.currentTag,
        referenceId: treatment.id,
        status:
          treatment.followUpDate < today && treatment.outcome === 'Pending Follow-up'
            ? 'Overdue'
            : 'Pending',
        completionNotes: '',
        completedAt: null,
      });
    }

    appendAudit(
      user,
      'RECORD_TREATMENT',
      'Treatment',
      treatment.id,
      animal.currentTag,
      `Recorded treatment "${treatment.medicine}" (NGN ${totalCost.toLocaleString()}) for ${animal.currentTag}.`
    );

    saveDatabase(db);
    res.status(201).json({ treatment, expenseId });
  }
);

/**
 * POST /api/animals/:id/vaccinations
 */
healthRouter.post(
  '/animals/:id/vaccinations',
  requirePermission('RECORD_HEALTH'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const animal = db.animals.find((a) => a.id === req.params.id);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found.' });
      return;
    }

    const {
      dateAdministered,
      protocolType,
      vaccineOrProduct,
      batchNumber,
      dosage,
      nextDueDate,
      veterinarian,
      costNgn,
      withdrawalDays,
      notes,
    } = req.body;

    if (!vaccineOrProduct || !dosage || !nextDueDate) {
      res.status(400).json({
        error: 'Vaccine/product name, dosage, and next due date are required.',
      });
      return;
    }

    const dateStr = dateAdministered || new Date().toISOString().slice(0, 10);
    const cost = Math.max(0, Number(costNgn || 0));
    const vac: VaccinationRecord = {
      id: `VAC-${Date.now()}`,
      animalId: animal.id,
      dateAdministered: dateStr,
      protocolType: protocolType || 'Vaccination',
      vaccineOrProduct: String(vaccineOrProduct).trim(),
      batchNumber: String(batchNumber || 'BATCH-STD').trim(),
      dosage: String(dosage).trim(),
      nextDueDate,
      veterinarian: String(veterinarian || user.fullName).trim(),
      costNgn: cost,
      withdrawalDays: Math.max(0, Number(withdrawalDays || 0)),
      notes: String(notes || '').trim(),
    };

    db.vaccinations.unshift(vac);

    if (cost > 0) {
      const expId = `EXP-${Date.now()}`;
      db.expenses.unshift({
        id: expId,
        transactionCode: `MAIS-EXP-2026-${db.expenses.length + 101}`,
        expenseDate: dateStr,
        amountNgn: cost,
        category: 'Veterinary & Treatment',
        description: `${vac.protocolType} (${vac.vaccineOrProduct}) for ${animal.currentTag}`,
        supplierId: null,
        supplierName: vac.veterinarian,
        paymentStatus: 'Paid',
        paymentMethod: 'Bank Transfer',
        invoiceNumber: `VAC-${vac.id.slice(-5)}`,
        linkedEntityType: 'Treatment',
        linkedEntityId: vac.id,
        linkedAnimalId: animal.id,
        approvalStatus: 'Approved',
        enteredBy: user.fullName,
        approvedBy: user.fullName,
        isReversed: false,
        reversalReason: null,
      });
      db.expenseAllocations.unshift({
        id: `ALC-${Date.now()}`,
        expenseId: expId,
        feedIssueId: null,
        animalId: animal.id,
        allocationDate: dateStr,
        allocationCategory: 'Direct Treatment',
        allocationMethod: 'Direct 100%',
        amountNgn: cost,
        notes: `${vac.protocolType} (${vac.vaccineOrProduct}) for ${animal.currentTag}`,
      });
      db.payments.push({
        id: `PAY-${Date.now()}`,
        expenseId: expId,
        paymentDate: dateStr,
        amountNgn: cost,
        paymentMethod: 'Bank Transfer',
        referenceNumber: `VAC-${vac.id.slice(-5)}`,
        recordedBy: user.fullName,
        notes: 'Vaccination settlement',
      });
    }

    appendAnimalEvent(
      animal.id,
      dateStr,
      'VACCINATION',
      `${vac.protocolType}: ${vac.vaccineOrProduct}`,
      `Batch ${vac.batchNumber} · Dosage: ${vac.dosage} · Next Due: ${vac.nextDueDate}`,
      vac.id,
      cost > 0 ? cost : null,
      user.fullName
    );

    db.tasks.unshift({
      id: `TSK-${Date.now()}`,
      title: `Scheduled ${vac.protocolType}: ${vac.vaccineOrProduct} (${animal.currentTag})`,
      category: 'Vaccination / Protocol',
      dueDate: vac.nextDueDate,
      priority: 'Medium',
      assignedTo: vac.veterinarian,
      animalId: animal.id,
      animalTag: animal.currentTag,
      referenceId: vac.id,
      status: 'Pending',
      completionNotes: '',
      completedAt: null,
    });

    appendAudit(
      user,
      'RECORD_VACCINATION',
      'Vaccination',
      vac.id,
      animal.currentTag,
      `Recorded ${vac.protocolType} "${vac.vaccineOrProduct}" for ${animal.currentTag}.`
    );

    saveDatabase(db);
    res.status(201).json({ vaccination: vac });
  }
);

/**
 * GET /api/treatments (Canonical Section 15 Endpoint)
 */
healthRouter.get(
  '/treatments',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { animalId, episodeId, outcome, startDate, endDate, page, limit } = req.query;
    let filtered = [...db.treatments];
    if (animalId) filtered = filtered.filter((t) => t.animalId === String(animalId));
    if (episodeId) filtered = filtered.filter((t) => t.episodeId === String(episodeId));
    if (outcome && outcome !== 'ALL') {
      filtered = filtered.filter((t) => t.outcome === String(outcome));
    }
    if (startDate) filtered = filtered.filter((t) => t.treatmentDate >= String(startDate));
    if (endDate) filtered = filtered.filter((t) => t.treatmentDate <= String(endDate));
    res.json(paginateItems(filtered, page, limit));
  }
);

/**
 * POST /api/treatments (Canonical Section 15 Endpoint)
 */
healthRouter.post(
  '/treatments',
  requirePermission('RECORD_HEALTH'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const { episodeId, animalId } = req.body;
    const existingEpisode = episodeId ? db.healthEpisodes.find((e) => e.id === episodeId) : null;
    let episode = existingEpisode;
    const animal = animalId
      ? db.animals.find((a) => a.id === animalId)
      : existingEpisode
      ? db.animals.find((a) => a.id === existingEpisode.animalId)
      : null;

    if (!animal) {
      res.status(400).json({ error: 'Valid animalId or episodeId is required.' });
      return;
    }

    if (!episode) {
      const dateStr = req.body.treatmentDate || new Date().toISOString().slice(0, 10);
      episode = {
        id: `HEP-${Date.now()}`,
        animalId: animal.id,
        reportedDate: dateStr,
        symptoms: String(req.body.symptoms || 'Clinical presentation').trim(),
        diagnosis: String(req.body.diagnosis || req.body.medicine || 'Clinical Treatment').trim(),
        diagnosisCategory: String(req.body.diagnosisCategory || 'General Clinical').trim(),
        severity: req.body.severity || 'Moderate',
        status: 'Under Treatment',
        veterinarian: String(req.body.veterinarian || user.fullName).trim(),
        outcome: 'Under evaluation',
        notes: String(req.body.notes || '').trim(),
        recordedBy: user.fullName,
      };
      db.healthEpisodes.unshift(episode);
    }

    const dateStr = req.body.treatmentDate || new Date().toISOString().slice(0, 10);
    const medCost = Math.max(0, Number(req.body.medicineCost || 0));
    const consCost = Math.max(0, Number(req.body.consultationCost || 0));
    const othCost = Math.max(0, Number(req.body.otherCost || 0));
    const totalCost = medCost + consCost + othCost;
    const medicine = String(req.body.medicine || '').trim();
    const dosage = String(req.body.dosage || '').trim();
    const veterinarian = String(req.body.veterinarian || user.fullName).trim();

    if (!medicine || !dosage) {
      res.status(400).json({ error: 'Medicine name and dosage are required.' });
      return;
    }

    const treatmentId = `TRT-${Date.now()}`;
    const treatment: Treatment = {
      id: treatmentId,
      episodeId: episode.id,
      animalId: animal.id,
      treatmentDate: dateStr,
      medicine,
      activeIngredient: String(req.body.activeIngredient || medicine).trim(),
      dosage,
      route: req.body.route || 'Intramuscular (IM)',
      durationDays: Math.max(1, Number(req.body.durationDays || 1)),
      withdrawalMilkDays: Math.max(0, Number(req.body.withdrawalMilkDays || 0)),
      withdrawalMeatDays: Math.max(0, Number(req.body.withdrawalMeatDays || 0)),
      administrator: String(req.body.administrator || user.fullName).trim(),
      veterinarian,
      medicineCost: medCost,
      consultationCost: consCost,
      otherCost: othCost,
      totalCost,
      followUpDate: req.body.followUpDate || null,
      outcome: req.body.outcome || 'Pending Follow-up',
      notes: String(req.body.notes || '').trim(),
      expenseId: null,
    };

    db.treatments.unshift(treatment);
    appendAudit(
      user,
      'RECORD_TREATMENT',
      'Treatment',
      treatment.id,
      animal.currentTag,
      `Recorded treatment "${treatment.medicine}" for ${animal.currentTag}.`
    );
    saveDatabase(db);
    res.status(201).json({ treatment, episode });
  }
);

/**
 * GET /api/vaccinations (Canonical Section 15 Endpoint)
 */
healthRouter.get(
  '/vaccinations',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { animalId, protocolType, page, limit } = req.query;
    let filtered = [...db.vaccinations];
    if (animalId) filtered = filtered.filter((v) => v.animalId === String(animalId));
    if (protocolType && protocolType !== 'ALL') {
      filtered = filtered.filter((v) => v.protocolType === String(protocolType));
    }
    res.json(paginateItems(filtered, page, limit));
  }
);

/**
 * POST /api/vaccinations (Canonical Section 15 Endpoint)
 */
healthRouter.post(
  '/vaccinations',
  requirePermission('RECORD_HEALTH'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const {
      animalId,
      dateAdministered,
      protocolType,
      vaccineOrProduct,
      batchNumber,
      dosage,
      nextDueDate,
      veterinarian,
      costNgn,
      withdrawalDays,
      notes,
    } = req.body;

    const animal = db.animals.find((a) => a.id === animalId);
    if (!animal || !vaccineOrProduct || !dosage || !nextDueDate) {
      res.status(400).json({
        error: 'Valid animalId, vaccine/product name, dosage, and nextDueDate are required.',
      });
      return;
    }

    const dateStr = dateAdministered || new Date().toISOString().slice(0, 10);
    const cost = Math.max(0, Number(costNgn || 0));
    const vac: VaccinationRecord = {
      id: `VAC-${Date.now()}`,
      animalId: animal.id,
      dateAdministered: dateStr,
      protocolType: protocolType || 'Vaccination',
      vaccineOrProduct: String(vaccineOrProduct).trim(),
      batchNumber: String(batchNumber || 'BATCH-STD').trim(),
      dosage: String(dosage).trim(),
      nextDueDate,
      veterinarian: String(veterinarian || user.fullName).trim(),
      costNgn: cost,
      withdrawalDays: Math.max(0, Number(withdrawalDays || 0)),
      notes: String(notes || '').trim(),
    };
    db.vaccinations.unshift(vac);
    appendAudit(
      user,
      'RECORD_VACCINATION',
      'Vaccination',
      vac.id,
      animal.currentTag,
      `Recorded ${vac.protocolType} "${vac.vaccineOrProduct}" for ${animal.currentTag}.`
    );
    saveDatabase(db);
    res.status(201).json({ vaccination: vac });
  }
);

