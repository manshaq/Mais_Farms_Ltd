import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateSharedFeedCost,
  calculateAnimalTotalCosts,
  calculateFarmFinancialSummary,
  calculateFeedProductStock,
  calculateWeightHistoryWithADG,
  canPerformAction,
  computeHealthRankings,
  normalizeTag,
  resolveAnimalByTag,
  validateNewTagCandidate,
} from '../../src/domain/farmRules';
import {
  Animal,
  AnimalIdentifier,
  Expense,
  ExpenseAllocation,
  FeedIssue,
  FeedProduct,
  FeedPurchase,
  HealthEpisode,
  InventoryMovement,
  Payment,
  Treatment,
  WeightRecord,
} from '../../src/types/mais';

const mockAnimals: Animal[] = [
  {
    id: 'ANM-1001',
    currentTag: 'MAIS-014',
    name: 'Zaria Duchess',
    type: 'Cow',
    sex: 'Female',
    breed: 'Holstein Friesian',
    dateOfBirth: '2022-03-14',
    acquisitionType: 'Purchased',
    sourceDetails: 'Kaduna Highland Breeders',
    acquisitionDate: '2023-01-10',
    purchasePrice: 850000,
    damTag: null,
    damId: null,
    sireId: 'SIRE-HF-88',
    herdGroup: 'Lactating Herd A',
    location: 'Barn 1 - Pen A',
    identifyingCharacteristics: 'Black and white piebald with star on forehead',
    status: 'Active',
    notes: 'High-yielding dairy cow',
    registeredBy: 'Dr. Bello Aliyu',
    registeredAt: '2023-01-10',
  },
];

const mockIdentifiers: AnimalIdentifier[] = [
  {
    id: 'ID-1',
    animalId: 'ANM-1001',
    tagNumber: 'MAIS-OLD-002',
    normalizedTag: 'MAIS-OLD-002',
    isCurrent: false,
    assignedAt: '2023-01-10',
    retiredAt: '2024-06-01',
    retiredReason: 'Ear tag damaged on fence; replaced with MAIS-014',
    assignedBy: 'Dr. Bello Aliyu',
  },
  {
    id: 'ID-2',
    animalId: 'ANM-1001',
    tagNumber: 'MAIS-014',
    normalizedTag: 'MAIS-014',
    isCurrent: true,
    assignedAt: '2024-06-01',
    retiredAt: null,
    retiredReason: null,
    assignedBy: 'Dr. Bello Aliyu',
  },
];

test('normalizeTag standardizes whitespace, case, and hyphens', () => {
  assert.equal(normalizeTag(' mais 014 '), 'MAIS-014');
  assert.equal(normalizeTag('mais--old-002'), 'MAIS-OLD-002');
});

test('resolveAnimalByTag resolves both current and historical tags to the same permanent Animal ID', () => {
  const byCurrent = resolveAnimalByTag('mais-014', mockAnimals, mockIdentifiers);
  assert.ok(byCurrent);
  assert.equal(byCurrent.animal.id, 'ANM-1001');
  assert.equal(byCurrent.isHistoricalMatch, false);

  const byHistorical = resolveAnimalByTag('MAIS-OLD-002', mockAnimals, mockIdentifiers);
  assert.ok(byHistorical);
  assert.equal(byHistorical.animal.id, 'ANM-1001');
  assert.equal(byHistorical.isHistoricalMatch, true);
  assert.deepEqual(byHistorical.historicalTags, ['MAIS-OLD-002']);
});

test('validateNewTagCandidate rejects both active and retired historical tags', () => {
  const dupActive = validateNewTagCandidate('MAIS-014', mockAnimals, mockIdentifiers);
  assert.equal(dupActive.valid, false);
  assert.match(dupActive.error || '', /Duplicate tag rejected/);

  const dupHistorical = validateNewTagCandidate('mais-old-002', mockAnimals, mockIdentifiers);
  assert.equal(dupHistorical.valid, false);
  assert.match(dupHistorical.error || '', /Retired tag conflict/);

  const freshTag = validateNewTagCandidate('MAIS-099', mockAnimals, mockIdentifiers);
  assert.equal(freshTag.valid, true);
});

test('calculateFeedProductStock enforces Closing Stock = Opening Stock + Receipts - Issues - Recorded Losses', () => {
  const product: FeedProduct = {
    id: 'FD-01',
    name: 'Dairy Concentrate 18% CP',
    category: 'Concentrate',
    unit: 'kg',
    openingStock: 1000,
    reorderLevel: 500,
    standardUnitCostNgn: 420,
    storageLocation: 'Silo A',
  };
  const purchases: FeedPurchase[] = [
    {
      id: 'FP-1',
      supplierId: 'SUP-1',
      supplierName: 'Northern Mills',
      purchaseDate: '2026-10-01',
      productId: 'FD-01',
      productName: 'Dairy Concentrate 18% CP',
      batchNumber: 'B-101',
      quantityOrdered: 2000,
      quantityReceived: 2000,
      unitPriceNgn: 420,
      transportCostNgn: 20000,
      totalCostNgn: 860000,
      invoiceNumber: 'INV-101',
      expenseId: 'EXP-1',
      recordedBy: 'Musa Ibrahim',
    },
  ];
  const issues: FeedIssue[] = [
    {
      id: 'FI-1',
      issueDate: '2026-10-05',
      productId: 'FD-01',
      productName: 'Dairy Concentrate 18% CP',
      quantity: 600,
      unit: 'kg',
      targetType: 'Group',
      targetAnimalId: null,
      targetGroup: 'Lactating Herd A',
      allocationMethod: 'equal_headcount',
      wastageKg: 20, // 580 net consumption + 20 wastage = 600 issued
      unitCostNgn: 420,
      totalCostNgn: 252000,
      responsibleStaff: 'Musa Ibrahim',
      notes: 'Morning ration',
    },
  ];
  const movements: InventoryMovement[] = [
    {
      id: 'MOV-1',
      productId: 'FD-01',
      movementDate: '2026-10-08',
      movementType: 'LOSS',
      quantity: 50,
      reason: 'Moisture spoilage in corner bag',
      referenceId: 'LOSS-1',
      recordedBy: 'Musa Ibrahim',
    },
  ];

  const stock = calculateFeedProductStock(product, purchases, issues, movements);
  // Opening (1000) + Receipts (2000) - Net Issues (580) - Recorded Losses (50 + 20 = 70) = 2350
  assert.equal(stock.openingStock, 1000);
  assert.equal(stock.receipts, 2000);
  assert.equal(stock.issues, 580);
  assert.equal(stock.recordedLosses, 70);
  assert.equal(stock.closingStock, 2350);
  assert.equal(stock.isLowStock, false);
});

test('allocateSharedFeedCost distributes group cost accurately without charging full cost to each animal', () => {
  const shares = allocateSharedFeedCost({
    quantityKg: 90,
    unitCostNgn: 400, // Total 36,000 NGN
    allocationMethod: 'equal_headcount',
    targetAnimals: [{ id: 'ANM-1' }, { id: 'ANM-2' }, { id: 'ANM-3' }],
  });

  assert.equal(shares.length, 3);
  assert.equal(shares[0].allocatedCostNgn, 12000);
  assert.equal(shares[1].allocatedCostNgn, 12000);
  assert.equal(shares[2].allocatedCostNgn, 12000);
  const sum = shares.reduce((acc, s) => acc + s.allocatedCostNgn, 0);
  assert.equal(sum, 36000);
});

test('calculateWeightHistoryWithADG computes exact average daily gain between dated measurements', () => {
  const weights: WeightRecord[] = [
    {
      id: 'W-1',
      animalId: 'ANM-1005',
      measurementDate: '2026-08-01',
      weightKg: 38.0,
      bodyConditionScore: 3.0,
      stage: 'Birth',
      recordedBy: 'Staff',
      notes: 'Birth weight',
    },
    {
      id: 'W-2',
      animalId: 'ANM-1005',
      measurementDate: '2026-09-10', // 40 days later
      weightKg: 70.0, // +32 kg / 40 days = 0.800 kg/day
      bodyConditionScore: 3.5,
      stage: 'Weaning',
      recordedBy: 'Staff',
      notes: '40-day check',
    },
  ];

  const withAdg = calculateWeightHistoryWithADG(weights);
  assert.equal(withAdg[0].adgKgPerDay, null);
  assert.equal(withAdg[1].daysBetween, 40);
  assert.equal(withAdg[1].adgKgPerDay, 0.8);
});

test('calculateFarmFinancialSummary and calculateAnimalTotalCosts prevent double counting of expenses and allocations', () => {
  const expenses: Expense[] = [
    {
      id: 'EXP-100',
      transactionCode: 'TXN-100',
      expenseDate: '2026-10-01',
      amountNgn: 500000,
      category: 'Feed & Nutrition',
      description: 'Bulk feed purchase',
      supplierId: 'SUP-1',
      supplierName: 'Northern Mills',
      paymentStatus: 'Paid',
      paymentMethod: 'Bank Transfer',
      invoiceNumber: 'INV-100',
      linkedEntityType: 'FeedPurchase',
      linkedEntityId: 'FP-1',
      linkedAnimalId: null,
      approvalStatus: 'Approved',
      enteredBy: 'Admin',
      approvedBy: 'Admin',
      isReversed: false,
      reversalReason: null,
    },
    {
      id: 'EXP-101',
      transactionCode: 'TXN-101',
      expenseDate: '2026-10-04',
      amountNgn: 25000,
      category: 'Veterinary & Treatment',
      description: 'Mastitis treatment for MAIS-014',
      supplierId: 'SUP-2',
      supplierName: 'Arewa Vet Clinic',
      paymentStatus: 'Partially Paid',
      paymentMethod: 'Bank Transfer',
      invoiceNumber: 'INV-101',
      linkedEntityType: 'Treatment',
      linkedEntityId: 'TR-1',
      linkedAnimalId: 'ANM-1001',
      approvalStatus: 'Approved',
      enteredBy: 'Admin',
      approvedBy: 'Admin',
      isReversed: false,
      reversalReason: null,
    },
  ];

  const allocations: ExpenseAllocation[] = [
    {
      id: 'AL-1',
      expenseId: null,
      feedIssueId: 'FI-1',
      animalId: 'ANM-1001',
      allocationDate: '2026-10-05',
      allocationCategory: 'Shared Feed',
      allocationMethod: 'Equal Headcount',
      amountNgn: 18000,
      notes: 'Allocated share from bulk feed issue',
    },
    {
      id: 'AL-2',
      expenseId: 'EXP-101',
      feedIssueId: null,
      animalId: 'ANM-1001',
      allocationDate: '2026-10-04',
      allocationCategory: 'Direct Treatment',
      allocationMethod: 'Direct 100%',
      amountNgn: 25000,
      notes: 'Direct treatment allocation',
    },
  ];

  const payments: Payment[] = [
    {
      id: 'PAY-1',
      expenseId: 'EXP-100',
      paymentDate: '2026-10-01',
      amountNgn: 500000,
      paymentMethod: 'Bank Transfer',
      referenceNumber: 'REF-1',
      recordedBy: 'Admin',
      notes: 'Full payment',
    },
    {
      id: 'PAY-2',
      expenseId: 'EXP-101',
      paymentDate: '2026-10-04',
      amountNgn: 15000,
      paymentMethod: 'Bank Transfer',
      referenceNumber: 'REF-2',
      recordedBy: 'Admin',
      notes: 'Part payment',
    },
  ];

  // Farm summary must sum original expenses (500,000 + 25,000 = 525,000), NOT add allocations on top!
  const farmSummary = calculateFarmFinancialSummary(expenses, payments, allocations);
  assert.equal(farmSummary.totalExpenditureNgn, 525000);
  assert.equal(farmSummary.totalPaidNgn, 515000);
  assert.equal(farmSummary.totalUnpaidBalanceNgn, 10000);

  // Animal cost breakdown must count EXP-101 once (25,000) + shared feed (18,000) + purchasePrice (850,000) = 893,000
  const animalCost = calculateAnimalTotalCosts(mockAnimals[0], expenses, allocations);
  assert.equal(animalCost.directTreatmentCostNgn, 25000);
  assert.equal(animalCost.allocatedFeedCostNgn, 18000);
  assert.equal(animalCost.totalLifetimeCostNgn, 893000);
});

test('computeHealthRankings ranks expenditure separately from recurring illness and clinical vulnerability', () => {
  const animals: Animal[] = [
    mockAnimals[0],
    {
      ...mockAnimals[0],
      id: 'ANM-1002',
      currentTag: 'MAIS-018',
      name: 'Kano Belle',
    },
  ];

  const episodes: HealthEpisode[] = [
    // ANM-1001 has 1 expensive surgical/orthopedic episode
    {
      id: 'EP-1',
      animalId: 'ANM-1001',
      reportedDate: '2026-09-01',
      symptoms: 'Acute hoof injury',
      diagnosis: 'Traumatic Hoof Laceration',
      diagnosisCategory: 'Orthopedic / Hoof',
      severity: 'Moderate',
      status: 'Resolved',
      veterinarian: 'Dr. Bello',
      outcome: 'Full recovery',
      notes: '',
      recordedBy: 'Admin',
    },
    // ANM-1002 has 2 recurring Mastitis episodes with lower cost but high biological vulnerability
    {
      id: 'EP-2',
      animalId: 'ANM-1002',
      reportedDate: '2026-08-10',
      symptoms: 'Swollen quarter, clots in milk',
      diagnosis: 'Clinical Mastitis',
      diagnosisCategory: 'Mastitis / Udder',
      severity: 'High',
      status: 'Resolved',
      veterinarian: 'Dr. Bello',
      outcome: 'Recovered initially',
      notes: '',
      recordedBy: 'Admin',
    },
    {
      id: 'EP-3',
      animalId: 'ANM-1002',
      reportedDate: '2026-10-05',
      symptoms: 'Recurrent udder inflammation',
      diagnosis: 'Recurrent Clinical Mastitis',
      diagnosisCategory: 'Mastitis / Udder',
      severity: 'High',
      status: 'Under Treatment',
      veterinarian: 'Dr. Bello',
      outcome: 'Ongoing',
      notes: '',
      recordedBy: 'Admin',
    },
  ];

  const treatments: Treatment[] = [
    {
      id: 'TR-1',
      episodeId: 'EP-1',
      animalId: 'ANM-1001',
      treatmentDate: '2026-09-01',
      medicine: 'Surgical Debridement & Oxytetracycline',
      activeIngredient: 'Oxytetracycline',
      dosage: '20ml',
      route: 'Intramuscular (IM)',
      durationDays: 5,
      withdrawalMilkDays: 7,
      withdrawalMeatDays: 14,
      administrator: 'Dr. Bello',
      veterinarian: 'Dr. Bello',
      medicineCost: 30000,
      consultationCost: 45000,
      otherCost: 10000,
      totalCost: 85000,
      followUpDate: '2026-09-10',
      outcome: 'Recovered',
      notes: '',
      expenseId: null,
    },
    {
      id: 'TR-2',
      episodeId: 'EP-3',
      animalId: 'ANM-1002',
      treatmentDate: '2026-10-05',
      medicine: 'Cefquinome Intramammary',
      activeIngredient: 'Cefquinome',
      dosage: '1 syringe / 12h',
      route: 'Intramammary',
      durationDays: 3,
      withdrawalMilkDays: 5,
      withdrawalMeatDays: 7,
      administrator: 'Dr. Bello',
      veterinarian: 'Dr. Bello',
      medicineCost: 12000,
      consultationCost: 8000,
      otherCost: 0,
      totalCost: 20000,
      followUpDate: '2026-10-15',
      outcome: 'Pending Follow-up',
      notes: '',
      expenseId: null,
    },
  ];

  const rankings = computeHealthRankings(animals, episodes, treatments, '2026-10-22');
  // Highest expenditure is ANM-1001 (85,000 vs 20,000)
  assert.equal(rankings.highestTreatmentExpenditure[0].animalId, 'ANM-1001');
  // Most recurring illness & concerning health pattern is ANM-1002
  assert.equal(rankings.mostRecurringIllnesses[0].animalId, 'ANM-1002');
  assert.equal(rankings.mostOverdueFollowUps[0].animalId, 'ANM-1002');
  assert.equal(rankings.concerningHealthPatterns[0].animalId, 'ANM-1002');
});

test('canPerformAction strictly enforces Admin, Farm Manager, and Read-Only Staff permissions', () => {
  assert.equal(canPerformAction('Read-Only Staff', 'VIEW_RECORDS'), true);
  assert.equal(canPerformAction('Read-Only Staff', 'EDIT_ANIMALS'), false);
  assert.equal(canPerformAction('Read-Only Staff', 'RECORD_EXPENSES'), false);

  assert.equal(canPerformAction('Farm Manager', 'EDIT_ANIMALS'), true);
  assert.equal(canPerformAction('Farm Manager', 'MANAGE_STAFF'), false);
  assert.equal(canPerformAction('Farm Manager', 'MANAGE_SETTINGS'), false);
  assert.equal(canPerformAction('Farm Manager', 'APPROVE_EXPENSES', false), false);
  assert.equal(canPerformAction('Farm Manager', 'APPROVE_EXPENSES', true), true);

  assert.equal(canPerformAction('Admin', 'MANAGE_STAFF'), true);
  assert.equal(canPerformAction('Admin', 'MANAGE_SETTINGS'), true);
});

test('formatCsvContent escapes commas, double quotes, and null values according to RFC-4180', async () => {
  const { formatCsvContent } = await import('../../src/utils/csvExport');
  const csv = formatCsvContent(
    ['Animal Tag', 'Description', 'Amount (NGN)'],
    [
      ['MAIS-014', 'Feed purchase, bulk "Grade A"', 850000],
      ['MAIS-018', null, 0],
    ]
  );
  assert.equal(
    csv,
    'Animal Tag,Description,Amount (NGN)\r\nMAIS-014,"Feed purchase, bulk ""Grade A""",850000\r\nMAIS-018,,0'
  );
});

test('allocateSharedFeedCost absorbs rounding remainders so allocated quantities and NGN costs sum 100% to the exact issue total', () => {
  const shares = allocateSharedFeedCost({
    quantityKg: 100,
    unitCostNgn: 100, // Total = NGN 10,000 split across 3 animals (3333 + 3333 + 3334 = 10,000)
    allocationMethod: 'equal_headcount',
    targetAnimals: [{ id: 'ANM-1' }, { id: 'ANM-2' }, { id: 'ANM-3' }],
  });

  const totalCost = shares.reduce((s, x) => s + x.allocatedCostNgn, 0);
  const totalQty = Number(shares.reduce((s, x) => s + x.allocatedQuantityKg, 0).toFixed(2));
  assert.equal(totalCost, 10000);
  assert.equal(totalQty, 100);
});

test('reversed expenses are excluded from both farm financial summary and per-animal lifetime cost totals', () => {
  const reversedExpenses: Expense[] = [
    {
      id: 'EXP-REV-1',
      transactionCode: 'TXN-REV-1',
      expenseDate: '2026-10-10',
      amountNgn: 40000,
      category: 'Veterinary & Treatment',
      description: 'Erroneous duplicate entry',
      supplierId: 'SUP-1',
      supplierName: 'Vet',
      paymentStatus: 'Paid',
      paymentMethod: 'Bank Transfer',
      invoiceNumber: 'INV-REV',
      linkedEntityType: 'Treatment',
      linkedEntityId: 'TR-99',
      linkedAnimalId: 'ANM-1001',
      approvalStatus: 'Approved',
      enteredBy: 'Admin',
      approvedBy: 'Admin',
      isReversed: true,
      reversalReason: 'Duplicate entry',
    },
  ];
  const allocations: ExpenseAllocation[] = [
    {
      id: 'ALC-REV-1',
      expenseId: 'EXP-REV-1',
      feedIssueId: null,
      animalId: 'ANM-1001',
      allocationDate: '2026-10-10',
      allocationCategory: 'Direct Treatment',
      allocationMethod: 'Direct 100%',
      amountNgn: 40000,
      notes: 'Should be ignored because EXP-REV-1 is reversed',
    },
  ];

  const summary = calculateFarmFinancialSummary(reversedExpenses, [], allocations);
  assert.equal(summary.totalExpenditureNgn, 0);
  assert.equal(summary.totalAllocatedToAnimalsNgn, 0);

  const animalCost = calculateAnimalTotalCosts(mockAnimals[0], reversedExpenses, allocations);
  assert.equal(animalCost.directTreatmentCostNgn, 0);
  assert.equal(animalCost.totalLifetimeCostNgn, 850000); // Only purchase price
});

test('login rate limiter locks out after 5 failed attempts within 15 minutes and resets after window expiry or clear', async () => {
  const {
    clearLoginAttempts,
    evaluateLoginRateLimit,
    recordFailedLoginAttempt,
    LOGIN_RATE_LIMIT_LOCKOUT_MS,
  } = await import('../../src/domain/farmRules');
  const store = new Map();
  const key = '127.0.0.1:belloaliyu808@gmail.com';
  const t0 = 1_700_000_000_000;

  assert.equal(evaluateLoginRateLimit(store, key, t0).allowed, true);

  for (let i = 1; i <= 4; i++) {
    const res = recordFailedLoginAttempt(store, key, t0 + i * 1000);
    assert.equal(res.locked, false);
    assert.equal(res.remainingAttempts, 5 - i);
  }

  // 5th attempt triggers lockout
  const fifth = recordFailedLoginAttempt(store, key, t0 + 5000);
  assert.equal(fifth.locked, true);
  assert.equal(fifth.remainingAttempts, 0);

  const blockedCheck = evaluateLoginRateLimit(store, key, t0 + 10_000);
  assert.equal(blockedCheck.allowed, false);
  assert.ok(blockedCheck.retryAfterSeconds > 800);

  // After 15-minute lockout expires, access is restored automatically
  const afterExpiry = evaluateLoginRateLimit(
    store,
    key,
    t0 + 5000 + LOGIN_RATE_LIMIT_LOCKOUT_MS + 1
  );
  assert.equal(afterExpiry.allowed, true);
  assert.equal(afterExpiry.remainingAttempts, 5);

  // Explicit clear on successful login also resets state
  recordFailedLoginAttempt(store, key, t0);
  clearLoginAttempts(store, key);
  assert.equal(evaluateLoginRateLimit(store, key, t0).remainingAttempts, 5);
});

test('computeAuditEntryHash chains tamper-evident hashes and filterAuditLogs filters by search, action, user, and date range', async () => {
  const { computeAuditEntryHash, filterAuditLogs } = await import('../../src/domain/farmRules');
  const firstLog = {
    id: 'AUD-1',
    timestamp: '2026-10-20T09:15:00.000Z',
    userId: 'USR-01',
    userName: 'Dr. Bello Aliyu',
    userRole: 'Admin' as const,
    action: 'LOGIN',
    entityType: 'StaffUser',
    entityId: 'USR-01',
    animalTag: null,
    summary: 'Dr. Bello Aliyu signed in.',
    previousValue: null,
    newValue: null,
  };
  const hash1 = computeAuditEntryHash(firstLog, null);
  const hash1Repeat = computeAuditEntryHash(firstLog, null);
  assert.equal(hash1, hash1Repeat);
  assert.ok(hash1.startsWith('SHA-'));

  // Any mutation to summary or values produces a different hash
  const tamperedHash = computeAuditEntryHash(
    { ...firstLog, summary: 'Modified summary' },
    null
  );
  assert.notEqual(hash1, tamperedHash);

  const secondLog = {
    id: 'AUD-2',
    timestamp: '2026-10-22T14:30:00.000Z',
    userId: 'USR-02',
    userName: 'Musa Ibrahim',
    userRole: 'Farm Manager' as const,
    action: 'REVERSE_EXPENSE',
    entityType: 'Expense',
    entityId: 'EXP-101',
    animalTag: 'MAIS-014',
    summary: 'Reversed expense EXP-101 due to duplicate invoice.',
    previousValue: 'Approved',
    newValue: 'Reversed',
    previousHash: hash1,
  };
  const hash2 = computeAuditEntryHash(secondLog, hash1);

  const logs = [
    { ...secondLog, integrityHash: hash2 },
    { ...firstLog, previousHash: null, integrityHash: hash1 },
  ];

  assert.equal(filterAuditLogs(logs, { action: 'REVERSE_EXPENSE' }).length, 1);
  assert.equal(filterAuditLogs(logs, { userId: 'USR-01' }).length, 1);
  assert.equal(filterAuditLogs(logs, { searchQuery: 'mais-014' }).length, 1);
  assert.equal(
    filterAuditLogs(logs, { startDate: '2026-10-21', endDate: '2026-10-23' }).length,
    1
  );
});

test('collectDueTomorrowReminders gathers Tasks, Vet Treatment Revisits, Vaccinations, Pregnancy Checks, and Estimated Calving due in 1 day', async () => {
  const { collectDueTomorrowReminders } = await import('../../src/domain/farmRules');
  const { INITIAL_MAIS_DB } = await import('../../src/data/seedData');
  const db = structuredClone(INITIAL_MAIS_DB);

  db.animals = [...mockAnimals];
  db.tasks = [
    {
      id: 'TSK-1',
      title: 'Inspect hoof bandage on MAIS-014',
      category: 'Follow-up',
      dueDate: '2026-10-24', // Tomorrow relative to 2026-10-23
      priority: 'High',
      assignedTo: 'Bello Aliyu',
      animalId: 'ANM-1001',
      animalTag: 'MAIS-014',
      referenceId: null,
      status: 'Pending',
      completionNotes: '',
      completedAt: null,
    },
  ];
  db.treatments = [
    {
      id: 'TR-10',
      episodeId: 'EP-10',
      animalId: 'ANM-1001',
      treatmentDate: '2026-10-17',
      medicine: 'Oxytetracycline LA',
      activeIngredient: 'Oxytetracycline',
      dosage: '20ml',
      route: 'Intramuscular (IM)',
      durationDays: 3,
      withdrawalMilkDays: 7,
      withdrawalMeatDays: 14,
      administrator: 'Bello Aliyu',
      veterinarian: 'Bello Aliyu',
      medicineCost: 15000,
      consultationCost: 5000,
      otherCost: 0,
      totalCost: 20000,
      followUpDate: '2026-10-24', // Revisit date tomorrow
      outcome: 'Pending Follow-up',
      notes: '',
      expenseId: null,
    },
  ];
  db.vaccinations = [
    {
      id: 'VAC-10',
      animalId: 'ANM-1001',
      dateAdministered: '2026-04-24',
      protocolType: 'Vaccination',
      vaccineOrProduct: 'FMD Trivalent Booster',
      batchNumber: 'FMD-99',
      dosage: '3ml SC',
      nextDueDate: '2026-10-24', // Booster due tomorrow
      veterinarian: 'Bello Aliyu',
      costNgn: 5000,
      withdrawalDays: 0,
      notes: '',
    },
  ];
  db.breedingEvents = [
    {
      id: 'BR-10',
      animalId: 'ANM-1001',
      heatDate: '2026-09-10',
      inseminationDate: '2026-09-11',
      attemptNumber: 1,
      sireIdOrStraw: 'SIRE-HF-88',
      sireBreed: 'Holstein Friesian',
      batchNumber: 'B-88',
      technician: 'Bello Aliyu',
      pregnancyCheckDate: '2026-10-24', // Pregnancy check tomorrow
      pregnancyCheckMethod: 'Ultrasound',
      pregnancyResult: 'Pending',
      estimatedDueDate: '2027-06-18',
      status: 'Inseminated',
      costNgn: 30000,
      notes: '',
    },
  ];

  const reminders = collectDueTomorrowReminders(db, '2026-10-23', 1);
  assert.equal(reminders.length, 4);
  const types = reminders.map((r) => r.sourceType).sort();
  assert.deepEqual(types, ['Pregnancy Check', 'Task', 'Treatment Revisit', 'Vaccination']);
  assert.ok(reminders.every((r) => r.recipientEmails.includes('belloaliyu808@gmail.com')));
});

test('buildMonthlyReportPackage compiles executive metrics and 3 RFC-4180 CSV attachments', async () => {
  const { buildMonthlyReportPackage } = await import('../../src/domain/farmRules');
  const { INITIAL_MAIS_DB } = await import('../../src/data/seedData');
  const db = structuredClone(INITIAL_MAIS_DB);
  db.animals = [...mockAnimals];
  db.expenses = [
    {
      id: 'EXP-201',
      transactionCode: 'TXN-201',
      expenseDate: '2026-10-12',
      amountNgn: 120000,
      category: 'Feed & Nutrition',
      description: 'Silage bales',
      supplierId: null,
      supplierName: 'Kano Feeds',
      paymentStatus: 'Paid',
      paymentMethod: 'Bank Transfer',
      invoiceNumber: 'INV-201',
      linkedEntityType: 'General',
      linkedEntityId: null,
      linkedAnimalId: null,
      approvalStatus: 'Approved',
      enteredBy: 'Bello Aliyu',
      approvedBy: 'Bello Aliyu',
      isReversed: false,
      reversalReason: null,
    },
  ];

  const pkg = buildMonthlyReportPackage(db, '2026-10-01', '2026-10-31');
  assert.equal(pkg.metrics.activeHerdCount, 1);
  assert.equal(pkg.metrics.totalExpenditureNgn, 120000);
  assert.equal(pkg.attachments.length, 3);
  assert.equal(pkg.attachments[0].fileName, 'mais_expenses_2026-10-01_to_2026-10-31.csv');
  assert.equal(pkg.attachments[0].rowCount, 1);
  assert.equal(pkg.attachments[1].fileName, 'mais_herd_costs_2026-10-01_to_2026-10-31.csv');
  assert.equal(pkg.attachments[1].rowCount, 1);
});

test('createBackupSnapshotEnvelope and verifyBackupSnapshotEnvelope validate SHA-256 integrity, tag uniqueness, and audit chain', async () => {
  const { createBackupSnapshotEnvelope, verifyBackupSnapshotEnvelope } = await import('../../src/domain/farmRules');
  const { INITIAL_MAIS_DB } = await import('../../src/data/seedData');
  const db = structuredClone(INITIAL_MAIS_DB);

  const envelope = createBackupSnapshotEnvelope(db, 'Dr. Bello Aliyu');
  assert.ok(envelope.snapshotId.startsWith('BKP-'));
  assert.ok(envelope.integrityHash.startsWith('SHA256-'));

  const verification = verifyBackupSnapshotEnvelope(envelope);
  assert.equal(verification.valid, true);
  assert.equal(verification.checks.every((c) => c.passed), true);

  // Tamper with the database inside the snapshot without updating integrityHash
  const tampered = structuredClone(envelope);
  tampered.database.animals.push({
    ...mockAnimals[0],
    id: 'ANM-9999',
    currentTag: 'MAIS-9999',
  });
  const tamperedResult = verifyBackupSnapshotEnvelope(tampered);
  assert.equal(tamperedResult.valid, false);
  const hashCheck = tamperedResult.checks.find((c) => c.checkName.includes('Integrity Signature'));
  assert.equal(hashCheck?.passed, false);
});

test('collectUpcomingScheduleItems aggregates upcoming vaccinations, pregnancy checks, calving dates, and treatment follow-ups', async () => {
  const { collectUpcomingScheduleItems } = await import('../../src/domain/farmRules');
  const { INITIAL_MAIS_DB } = await import('../../src/data/seedData');
  const db = structuredClone(INITIAL_MAIS_DB);
  db.animals = [...mockAnimals];
  db.vaccinations = [
    {
      id: 'VAC-99',
      animalId: 'ANM-1001',
      dateAdministered: '2026-04-25',
      protocolType: 'Vaccination',
      vaccineOrProduct: 'CBPP Annual Booster',
      batchNumber: 'CBPP-1',
      dosage: '2ml',
      nextDueDate: '2026-10-25',
      veterinarian: 'Dr. Bello',
      costNgn: 4000,
      withdrawalDays: 0,
      notes: '',
    },
  ];

  const items = collectUpcomingScheduleItems(db, '2026-10-20');
  assert.ok(items.some((i) => i.id.includes('VAC-99') && i.category === 'Vaccination'));
});

test('formatExcelXml generates valid SpreadsheetML XML with escaped cells and numeric types', async () => {
  const { formatExcelXml } = await import('../../src/utils/csvExport');
  const xml = formatExcelXml(
    'Herd Cost Report',
    ['Animal Tag', 'Amount (NGN)'],
    [['MAIS-014 & Co', 850000]],
    { subtitle: 'Period: Oct 2026' }
  );
  assert.ok(xml.includes('<Workbook'));
  assert.ok(xml.includes('MAIS-014 &amp; Co'));
  assert.ok(xml.includes('<Data ss:Type="Number">850000</Data>'));
});

test('generateFullPostgresBackupSql produces a complete SERIALIZABLE PostgreSQL dump with schema, triggers, RLS, and ordered INSERTs', async () => {
  const { generateFullPostgresBackupSql } = await import('../../src/domain/farmRules');
  const { INITIAL_MAIS_DB } = await import('../../src/data/seedData');
  const db = structuredClone(INITIAL_MAIS_DB);
  db.animals = [...mockAnimals];

  const sql = generateFullPostgresBackupSql(db, 'Bello Aliyu', '2026-10-24T05:30:00.000Z');
  assert.ok(sql.includes('BEGIN;'));
  assert.ok(sql.includes('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;'));
  assert.ok(sql.includes('CREATE TRIGGER on_auth_user_created'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS backup_runs'));
  assert.ok(sql.includes('ALTER TABLE backup_runs ENABLE ROW LEVEL SECURITY;'));
  assert.ok(sql.includes("INSERT INTO animals (id, current_tag, name"));
  assert.ok(sql.includes("'MAIS-014'"));
  assert.ok(sql.includes('COMMIT;'));
});

test('AES-256-GCM cryptoVault compresses, encrypts, and decrypts backup payloads and rejects tampered ciphertext or wrong keys', async () => {
  const { compressAndEncryptBackup, decryptAndDecompressBackup } = await import(
    '../../server/backup/cryptoVault'
  );
  const sampleSql = '-- MAIS LTD TEST BACKUP\nSELECT 1;\n'.repeat(25);
  const secretKey = 'test-passphrase-with-at-least-32-chars-2026';

  const artifact = compressAndEncryptBackup(sampleSql, secretKey);
  assert.equal(artifact.cipher, 'AES-256-GCM');
  assert.ok(artifact.encryptedBuffer.subarray(0, 8).toString('ascii') === 'MAISENC1');
  assert.ok(artifact.compressedSizeBytes < artifact.uncompressedSizeBytes);

  const roundTrip = decryptAndDecompressBackup(artifact.encryptedBuffer, secretKey);
  assert.equal(roundTrip, sampleSql);

  // Wrong key must fail GCM authentication
  assert.throws(() => {
    decryptAndDecompressBackup(artifact.encryptedBuffer, 'wrong-key-passphrase-000000000000');
  });

  // Tampering with ciphertext byte must fail GCM authentication tag check
  const tampered = Buffer.from(artifact.encryptedBuffer);
  tampered[tampered.length - 1] ^= 0xff;
  assert.throws(() => {
    decryptAndDecompressBackup(tampered, secretKey);
  });
});

test('sanitizeBackupError scrubs PostgreSQL URLs, passwords, Bearer tokens, JWTs, and AWS keys', async () => {
  const { sanitizeBackupError } = await import('../../src/domain/farmRules');
  const raw =
    'Connection failed to postgresql://postgres:MySuperSecretPass!@db.xyz.supabase.co:5432/postgres with Authorization: Bearer secret_tok_999 and key=AKIAIOSFODNN7EXAMPLE';
  const scrubbed = sanitizeBackupError(raw);
  assert.equal(scrubbed.includes('MySuperSecretPass'), false);
  assert.equal(scrubbed.includes('secret_tok_999'), false);
  assert.equal(scrubbed.includes('AKIAIOSFODNN7EXAMPLE'), false);
  assert.ok(scrubbed.includes('postgresql://[REDACTED_DB_URL]'));
});

test('computeBackupRetentionMetadata and evaluateBackupRetentionPolicy enforce 30d daily, 12m monthly, and Object Lock immutability', async () => {
  const { computeBackupRetentionMetadata, evaluateBackupRetentionPolicy } = await import(
    '../../src/domain/farmRules'
  );

  // 1st of month -> automatically classified as 'monthly' (12 * 30 = 360 days)
  const monthlyMeta = computeBackupRetentionMetadata({
    referenceDateIso: '2026-10-01T02:00:00.000Z',
    settings: {
      dailyRetentionDays: 30,
      monthlyRetentionMonths: 12,
      immutableObjectLock: true,
      objectLockDays: 30,
    },
  });
  assert.equal(monthlyMeta.tier, 'monthly');
  assert.ok(monthlyMeta.retentionExpiresAt.startsWith('2027-09-26'));
  assert.ok(monthlyMeta.objectLockRetainUntil?.startsWith('2026-10-31'));

  // Other day of month -> classified as 'daily' (30 days)
  const dailyMeta = computeBackupRetentionMetadata({
    referenceDateIso: '2026-10-15T02:00:00.000Z',
    settings: {
      dailyRetentionDays: 30,
      monthlyRetentionMonths: 12,
      immutableObjectLock: true,
      objectLockDays: 30,
    },
  });
  assert.equal(dailyMeta.tier, 'daily');
  assert.ok(dailyMeta.retentionExpiresAt.startsWith('2026-11-14'));

  // Retention evaluation must NEVER prune a run whose objectLockRetainUntil is still in the future
  const evalRes = evaluateBackupRetentionPolicy(
    [
      {
        id: 'RUN-EXPIRED-UNLOCKED',
        snapshotId: 'S1',
        startedAt: '2026-08-01T00:00:00.000Z',
        completedAt: '2026-08-01T00:00:05.000Z',
        tier: 'daily',
        engine: 'serializable_sql_bundle',
        status: 'Succeeded',
        attemptCount: 1,
        maxAttempts: 3,
        fileName: 'old.sql.gz.enc',
        uncompressedSizeBytes: 1000,
        encryptedSizeBytes: 400,
        encrypted: true,
        cipher: 'AES-256-GCM',
        sha256Checksum: 'abc',
        storageDestinations: ['local_vault'],
        s3Key: null,
        immutableProtected: true,
        objectLockRetainUntil: '2026-09-01T00:00:00.000Z', // Lock already expired
        retentionExpiresAt: '2026-09-01T00:00:00.000Z', // Retention expired
        prunedAt: null,
        errorSummary: null,
        triggeredBy: 'Scheduler',
      },
      {
        id: 'RUN-EXPIRED-BUT-LOCKED',
        snapshotId: 'S2',
        startedAt: '2026-09-20T00:00:00.000Z',
        completedAt: '2026-09-20T00:00:05.000Z',
        tier: 'daily',
        engine: 'serializable_sql_bundle',
        status: 'Succeeded',
        attemptCount: 1,
        maxAttempts: 3,
        fileName: 'locked.sql.gz.enc',
        uncompressedSizeBytes: 1000,
        encryptedSizeBytes: 400,
        encrypted: true,
        cipher: 'AES-256-GCM',
        sha256Checksum: 'def',
        storageDestinations: ['local_vault'],
        s3Key: null,
        immutableProtected: true,
        objectLockRetainUntil: '2026-11-15T00:00:00.000Z', // Still locked!
        retentionExpiresAt: '2026-10-20T00:00:00.000Z', // Retention expired, but lock protects it
        prunedAt: null,
        errorSummary: null,
        triggeredBy: 'Scheduler',
      },
    ],
    '2026-10-24T05:00:00.000Z'
  );

  assert.equal(evalRes.expiredPrunableRuns.length, 1);
  assert.equal(evalRes.expiredPrunableRuns[0].id, 'RUN-EXPIRED-UNLOCKED');
  assert.equal(evalRes.lockedProtectedRuns.length, 1);
  assert.equal(evalRes.lockedProtectedRuns[0].id, 'RUN-EXPIRED-BUT-LOCKED');
  assert.equal(evalRes.activeRuns.length, 1);
});






