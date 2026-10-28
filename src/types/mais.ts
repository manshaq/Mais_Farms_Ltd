export type StaffRole = 'Admin' | 'Farm Manager' | 'Read-Only Staff';

export type AnimalType = 'Cow' | 'Bull' | 'Heifer' | 'Calf' | 'Other' | string;
export type AnimalSex = 'Female' | 'Male' | string;
export type AcquisitionType = 'Purchased' | 'Born on Farm' | 'Transferred' | 'Other' | string;
export type AnimalStatus = 'Active' | 'Sold' | 'Transferred' | 'Deceased' | 'Missing' | 'Culled' | string;

export interface Animal {
  id: string; // Permanent immutable internal ID (e.g., ANM-1001)
  currentTag: string; // Current unique visible tag
  name: string;
  type: AnimalType;
  sex: AnimalSex;
  breed: string;
  dateOfBirth: string;
  acquisitionType: AcquisitionType;
  sourceDetails: string;
  acquisitionDate: string;
  purchasePrice: number | null;
  damTag: string | null;
  damId: string | null;
  sireId: string | null;
  herdGroup: string;
  location: string;
  identifyingCharacteristics: string;
  status: AnimalStatus;
  statusChangedAt?: string;
  statusReason?: string;
  notes: string;
  registeredBy: string;
  registeredAt: string;
}

export interface AnimalIdentifier {
  id: string;
  animalId: string;
  tagNumber: string;
  normalizedTag: string;
  isCurrent: boolean;
  assignedAt: string;
  retiredAt: string | null;
  retiredReason: string | null;
  assignedBy: string;
}

export type AnimalEventType =
  | 'REGISTRATION'
  | 'BIODATA_UPDATE'
  | 'TAG_CHANGE'
  | 'STATUS_CHANGE'
  | 'HEALTH_EPISODE'
  | 'TREATMENT'
  | 'VACCINATION'
  | 'FEED_ALLOCATION'
  | 'BREEDING'
  | 'CALVING'
  | 'WEIGHT'
  | 'EXPENSE'
  | 'DOCUMENT';

export interface AnimalEvent {
  id: string;
  animalId: string;
  eventDate: string;
  eventType: AnimalEventType;
  title: string;
  summary: string;
  referenceId: string;
  costNgn: number | null;
  recordedBy: string;
}

export type HealthSeverity = 'Low' | 'Moderate' | 'High' | 'Critical' | string;
export type HealthEpisodeStatus = 'Open' | 'Under Treatment' | 'Monitoring' | 'Resolved' | 'Chronic' | string;

export interface HealthEpisode {
  id: string;
  animalId: string;
  reportedDate: string;
  symptoms: string;
  diagnosis: string;
  diagnosisCategory: string;
  severity: HealthSeverity;
  status: HealthEpisodeStatus;
  veterinarian: string;
  outcome: string;
  notes: string;
  recordedBy: string;
}

export type TreatmentOutcome = 'Pending Follow-up' | 'Improved' | 'Recovered' | 'Relapsed' | 'Referred' | string;

export interface Treatment {
  id: string;
  episodeId: string;
  animalId: string;
  treatmentDate: string;
  medicine: string;
  activeIngredient: string;
  dosage: string;
  route: 'Intramuscular (IM)' | 'Subcutaneous (SC)' | 'Intravenous (IV)' | 'Oral' | 'Topical' | 'Intramammary' | string;
  durationDays: number;
  withdrawalMilkDays: number;
  withdrawalMeatDays: number;
  administrator: string;
  veterinarian: string;
  medicineCost: number;
  consultationCost: number;
  otherCost: number;
  totalCost: number;
  followUpDate: string | null;
  outcome: TreatmentOutcome;
  notes: string;
  expenseId: string | null;
}

export interface VaccinationRecord {
  id: string;
  animalId: string;
  dateAdministered: string;
  protocolType: 'Vaccination' | 'Deworming' | 'Routine Check' | 'Hoof Care' | string;
  vaccineOrProduct: string;
  batchNumber: string;
  dosage: string;
  nextDueDate: string;
  veterinarian: string;
  costNgn: number;
  withdrawalDays: number;
  notes: string;
}

export interface WeightRecord {
  id: string;
  animalId: string;
  measurementDate: string;
  weightKg: number;
  bodyConditionScore: number | null; // 1.0 - 5.0
  stage: 'Birth' | 'Weaning' | 'Yearling' | 'Routine' | 'Pre-Breeding' | string;
  recordedBy: string;
  notes: string;
}

export interface WeightWithADG extends WeightRecord {
  previousWeightKg: number | null;
  daysBetween: number | null;
  adgKgPerDay: number | null;
}

export interface BreedingEvent {
  id: string;
  animalId: string;
  heatDate: string;
  inseminationDate: string;
  attemptNumber: number;
  sireIdOrStraw: string;
  sireBreed: string;
  batchNumber: string;
  technician: string;
  pregnancyCheckDate: string | null;
  pregnancyCheckMethod: 'Ultrasound' | 'Rectal Palpation' | 'Blood Test' | 'Pending' | string;
  pregnancyResult: 'Pending' | 'Confirmed Pregnant' | 'Open / Not Pregnant' | string;
  estimatedDueDate: string;
  status: 'Inseminated' | 'Confirmed Pregnant' | 'Calved' | 'Failed / Open' | string;
  costNgn: number;
  notes: string;
}

export interface CalvingEvent {
  id: string;
  damId: string;
  breedingEventId: string | null;
  calvingDate: string;
  outcome: 'Live Single' | 'Live Twins' | 'Stillborn' | 'Assisted Live' | string;
  assistanceRequired: 'None' | 'Minor Pull' | 'Veterinary Intervention' | 'Caesarean' | string;
  calfIds: string[];
  calfTags: string[];
  veterinarian: string;
  notes: string;
  recordedBy: string;
}

export interface FeedProduct {
  id: string;
  name: string;
  category: 'Concentrate' | 'Roughage / Silage' | 'Mineral / Supplement' | 'Calf Milk Replacer' | string;
  unit: 'kg' | string;
  openingStock: number;
  reorderLevel: number;
  standardUnitCostNgn: number;
  storageLocation: string;
}

export interface FeedPurchase {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  productId: string;
  productName: string;
  batchNumber: string;
  quantityOrdered: number;
  quantityReceived: number;
  unit: string;
  unitPriceNgn: number;
  transportCostNgn: number;
  totalCostNgn: number;
  invoiceNumber: string;
  expenseId: string | null;
  notes: string;
  recordedBy: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  movementDate: string;
  movementType: 'RECEIPT' | 'ISSUE' | 'LOSS' | 'ADJUSTMENT';
  quantity: number;
  reason: string;
  referenceId: string;
  recordedBy: string;
}

export type AllocationMethod = 'direct_animal' | 'equal_headcount' | 'animal_days' | 'weight_proportion';

export interface FeedIssue {
  id: string;
  issueDate: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: 'kg' | string;
  targetType: 'Animal' | 'Group';
  targetAnimalId: string | null;
  targetGroup: string | null;
  allocationMethod: AllocationMethod;
  wastageKg: number;
  unitCostNgn: number;
  totalCostNgn: number;
  responsibleStaff: string;
  notes: string;
}

export type ExpenseCategory =
  | 'Animal Purchase'
  | 'Feed & Nutrition'
  | 'Veterinary & Treatment'
  | 'Breeding & AI'
  | 'Transport & Logistics'
  | 'Farm Labour'
  | 'Utilities & Fuel'
  | 'Equipment & Repairs'
  | 'Other Operations'
  | string;

export interface Expense {
  id: string;
  transactionCode: string;
  expenseDate: string;
  amountNgn: number;
  // Optional quantity-based pricing (e.g. "5 Bags at NGN 12,000 each").
  // Left null for fixed expenses that don't involve a measurable quantity.
  quantity?: number | null;
  unit?: string | null;
  pricePerUnitNgn?: number | null;
  category: ExpenseCategory;
  description: string;
  supplierId: string | null;
  supplierName: string;
  paymentStatus: 'Paid' | 'Partially Paid' | 'Unpaid';
  paymentMethod: 'Bank Transfer' | 'POS / Card' | 'Cash' | 'Cheque' | 'Credit' | string;
  invoiceNumber: string;
  linkedEntityType: 'Animal' | 'Treatment' | 'FeedPurchase' | 'Breeding' | 'General';
  linkedEntityId: string | null;
  linkedAnimalId: string | null;
  approvalStatus: 'Approved' | 'Pending Approval' | 'Rejected';
  enteredBy: string;
  approvedBy: string | null;
  isReversed: boolean;
  reversalReason: string | null;
}

export interface ExpenseAllocation {
  id: string;
  expenseId: string | null;
  feedIssueId: string | null;
  animalId: string;
  allocationDate: string;
  allocationCategory: 'Direct Treatment' | 'Direct Purchase' | 'Direct Breeding' | 'Shared Feed' | 'Shared Group Care' | string;
  allocationMethod: 'Direct 100%' | 'Equal Headcount' | 'Animal-Days' | 'Weight Proportion' | string;
  amountNgn: number;
  notes: string;
}

export interface Payment {
  id: string;
  expenseId: string;
  paymentDate: string;
  amountNgn: number;
  paymentMethod: 'Bank Transfer' | 'POS / Card' | 'Cash' | 'Cheque' | string;
  referenceNumber: string;
  recordedBy: string;
  notes: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: 'Feed & Grain' | 'Veterinary & Pharma' | 'Livestock Breeder' | 'Equipment & Logistics' | string;
  phone: string;
  email: string;
  address: string;
  bankDetails: string;
}

export interface FarmTask {
  id: string;
  title: string;
  category:
    | 'Treatment Follow-up'
    | 'Vaccination / Protocol'
    | 'Pregnancy Check'
    | 'Estimated Calving'
    | 'Low Feed Stock'
    | 'Open Health Case'
    | 'Expense Approval'
    | 'Incomplete Record'
    | string;
  dueDate: string;
  priority: 'High' | 'Medium' | 'Low';
  assignedTo: string;
  animalId: string | null;
  animalTag: string | null;
  referenceId: string | null;
  status: 'Pending' | 'Overdue' | 'Completed' | 'Dismissed';
  completionNotes: string;
  completedAt: string | null;
}

export interface StaffUser {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  title: string;
  canApproveExpenses: boolean;
  status: 'Active' | 'Suspended';
  lastActive: string;
  password?: string;
  supabaseUserId?: string;
  deleted?: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: StaffRole;
  action: string;
  entityType: string;
  entityId: string;
  animalTag: string | null;
  summary: string;
  previousValue: string | null;
  newValue: string | null;
  previousHash?: string | null;
  integrityHash?: string;
}

export interface AttachmentRecord {
  id: string;
  animalId: string | null;
  entityType: 'Animal' | 'HealthEpisode' | 'Treatment' | 'Expense' | 'Breeding';
  entityId: string;
  fileName: string;
  fileType: 'Photo' | 'Veterinary Report' | 'Invoice / Receipt' | 'Pedigree Certificate' | 'Lab Result' | string;
  fileSizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
  notes: string;
  sha256Hash?: string;
  mimeType?: string;
  storageBucket?: string;
  storagePath?: string;
}

export type ReminderSourceType =
  | 'Task'
  | 'Treatment Revisit'
  | 'Vaccination'
  | 'Pregnancy Check'
  | 'Estimated Calving';

export interface DueTomorrowReminderItem {
  id: string;
  sourceType: ReminderSourceType;
  entityId: string;
  title: string;
  details: string;
  dueDate: string;
  animalId: string | null;
  animalTag: string | null;
  assignedStaffName: string;
  recipientEmails: string[];
  dedupKey: string;
}

export interface EmailCsvAttachment {
  fileName: string;
  contentCsv: string;
  rowCount: number;
}

export interface EmailNotificationLog {
  id: string;
  sentAt: string;
  category: 'MONTHLY_REPORT' | 'DUE_REMINDER' | 'BACKUP_ALERT';
  subject: string;
  recipients: string[];
  status: 'Delivered' | 'Queued (Outbox)' | 'Failed';
  transport: 'Resend' | 'SMTP' | 'Local Outbox';
  summaryText: string;
  htmlBody: string;
  attachments: EmailCsvAttachment[];
  dedupKey: string | null;
  triggeredBy: string;
}

export interface NotificationSettings {
  autoMonthlyReportEnabled: boolean;
  monthlyReportDayOfMonth: number;
  autoDailyReminderEnabled: boolean;
  reminderLeadDays: number;
  additionalRecipientEmails: string;
  lastMonthlyReportSentMonth: string | null;
  lastDailyReminderRunDate: string | null;
}

export type BackupTier = 'daily' | 'monthly' | 'manual';

export interface BackupPolicySettings {
  autoBackupEnabled: boolean;
  scheduleHourUtc: number;
  dailyRetentionDays: number;
  monthlyRetentionMonths: number;
  maxRetryAttempts: number;
  immutableObjectLock: boolean;
  objectLockDays: number;
  alertAdminOnFailure: boolean;
  alertRecipientEmail: string;
  lastDailyBackupDate: string | null;
  lastMonthlyBackupMonth: string | null;
}

export interface BackupRunLog {
  id: string;
  snapshotId: string;
  startedAt: string;
  completedAt: string | null;
  tier: BackupTier;
  engine: 'pg_dump_native' | 'serializable_sql_bundle';
  status: 'Succeeded' | 'Failed' | 'Retrying';
  attemptCount: number;
  maxAttempts: number;
  fileName: string;
  uncompressedSizeBytes: number;
  encryptedSizeBytes: number;
  encrypted: boolean;
  cipher: 'AES-256-GCM';
  sha256Checksum: string;
  storageDestinations: Array<'local_vault' | 's3_offsite'>;
  s3Key: string | null;
  immutableProtected: boolean;
  objectLockRetainUntil: string | null;
  retentionExpiresAt: string;
  prunedAt: string | null;
  errorSummary: string | null;
  triggeredBy: string;
}

export interface BackupSnapshotEnvelope {
  snapshotId: string;
  system: 'MAIS_LTD_FARM_MANAGEMENT_SYSTEM';
  schemaVersion: string;
  exportedAt: string;
  exportedBy: string;
  recordCounts: {
    animals: number;
    animalIdentifiers: number;
    healthEpisodes: number;
    treatments: number;
    vaccinations: number;
    feedProducts: number;
    feedPurchases: number;
    feedIssues: number;
    breedingEvents: number;
    calvingEvents: number;
    weightRecords: number;
    expenses: number;
    payments: number;
    tasks: number;
    users: number;
    auditLogs: number;
    attachments: number;
  };
  integrityHash: string;
  sqlDumpSummary?: string;
  state: MaisDatabaseState;
  database: MaisDatabaseState;
}

export interface BackupVerificationCheck {
  checkName: string;
  passed: boolean;
  details: string;
}

export interface BackupVerificationResult {
  valid: boolean;
  snapshotId?: string;
  schemaVersion: string;
  exportedAt: string | null;
  exportedBy: string | null;
  expectedHash: string | null;
  computedHash: string;
  integrityHashExpected?: string | null;
  integrityHashComputed?: string;
  signatureMatched: boolean;
  recordCounts: Record<string, number>;
  checks: BackupVerificationCheck[];
  errors: string[];
}

export interface MaisDatabaseState {
  animals: Animal[];
  animalIdentifiers: AnimalIdentifier[];
  animalEvents: AnimalEvent[];
  healthEpisodes: HealthEpisode[];
  treatments: Treatment[];
  vaccinations: VaccinationRecord[];
  weightRecords: WeightRecord[];
  breedingEvents: BreedingEvent[];
  calvingEvents: CalvingEvent[];
  feedProducts: FeedProduct[];
  feedPurchases: FeedPurchase[];
  inventoryMovements: InventoryMovement[];
  feedIssues: FeedIssue[];
  expenses: Expense[];
  expenseAllocations: ExpenseAllocation[];
  payments: Payment[];
  suppliers: Supplier[];
  tasks: FarmTask[];
  users: StaffUser[];
  auditLogs: AuditLog[];
  attachments: AttachmentRecord[];
  emailLogs?: EmailNotificationLog[];
  notificationSettings?: NotificationSettings;
  backupSettings?: BackupPolicySettings;
  backupRuns?: BackupRunLog[];
}



