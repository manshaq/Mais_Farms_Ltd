# MAIS LTD — Livestock Management System

<div align="center">
  <h2>Enterprise Farm Operations, Veterinary Compliance, Feed Milling & Financial Accounting</h2>
  <p><strong>Commercial Dairy, Beef Cattle & Dedicated Calf Rearing in Nigeria (NGN / ₦)</strong></p>
</div>

---

## 1. Primary Invariant
> ### ONE ANIMAL = ONE PERMANENT IDENTITY = ONE COMPLETE HISTORY
> Every animal receives an immutable permanent internal ID (`ANM-1001` / UUID) upon registration. Physical ear tags (`currentTag`) provide convenient visual identification in pens and pastures. Ear tags may change due to tag loss, re-tagging, or breed renumbering, but **tag changes never sever or fragment the animal's permanent clinical, reproductive, weight, feed, or financial history**. Historical ear tags remain permanently indexed and searchable.

---

## 2. Key Operational Modules

1. **Livestock Registry & Tag Management**:
   - Permanent UUID tracking, deterministic tag normalization, and duplicate tag prevention.
   - Lineage linking with maternal (`damId`) and paternal (`sireId`) connections.
   - Lifecycle status governance: `Active`, `Sold`, `Transferred`, `Deceased`, `Missing`, `Culled`.
2. **Health, Veterinary Care & Food Safety Quarantine**:
   - Two-tier clinical tracking: Illness Episodes (`HealthEpisode`) separate from Clinical Treatments (`Treatment`).
   - Active milk withdrawal (`withdrawalMilkDays`) and meat withdrawal (`withdrawalMeatDays`) tracking. Animals on active hold display warning badges, blocking milk dispatch and slaughter.
   - Preventive care protocols for vaccinations, deworming, and routine health boosters.
3. **Feed Milling & Herd Cost Allocation**:
   - Stock conservation balance: $\text{Closing} = \text{Opening} + \text{Receipts} - \text{Issues} - \text{Losses} \pm \text{Adjustments}$.
   - Four transparent group feed allocation algorithms: `direct_animal`, `equal_headcount`, `animal_days`, `weight_proportion`.
   - Automated remainder absorption ensuring 100.00% cost reconciliation.
4. **Breeding, Gestation & Calves**:
   - Artificial insemination (AI) service logging with semen straw batch and technician tracking.
   - Strict 283-day bovine gestation formula for estimated calving dates.
   - Calving delivery registration automatically creating calf records with lineage linkage.
5. **Growth Ledger & Average Daily Gain (ADG)**:
   - Chronological body weight ledger with automated ADG ($\text{kg/day}$) calculation and Body Condition Score (BCS 1.0–5.0).
6. **Financial Ledger & Multi-Tier Approvals**:
   - Denominated strictly in Nigerian Naira (**NGN / ₦**).
   - Farm Managers can approve expenses up to ₦200,000; expenses exceeding ₦200,000 require Administrator approval.
   - Strict anti-double-counting ledger separation between bulk expenses and per-animal cost allocations.
7. **Tamper-Evident Cryptographic Audit Logging**:
   - SHA-256 hash chaining connecting every state mutation (`integrityHash = SHA-256(previousHash + ...)`).
8. **Disaster Recovery Vault & S3 WORM Retention**:
   - Automated daily snapshots encrypted with AES-256-GCM.
   - Offsite sync to S3-compatible object storage with 30-day immutable WORM Object Lock.

---

## 3. Technology Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React, Motion.
- **Backend API**: Node.js Express 4 modular REST router under `/api/*`.
- **Database Architecture**:
  - *Primary Engine*: Crash-resilient atomic JSON persistence (`server/db/store.ts` -> `data/mais_db.json`).
  - *Relational Enterprise Storage*: PostgreSQL managed via Supabase (`supabase/migrations/`).
- **Security & Cryptography**:
  - SHA-256 tamper-evident hash chaining.
  - AES-256-GCM envelope encryption with Gzip compression (`server/backup/cryptoVault.ts`).
  - S3 Object Lock client (`server/backup/s3OffsiteClient.ts`).
- **AI Analytics**: Google GenAI SDK (`@google/genai`) for conversational herd intelligence.

---

## 4. User Roles & RBAC Matrix

The system enforces **exactly three staff roles**:
- **Admin**: Full authority, user management, system configuration, unlimited expense approvals, audit log inspection, and backup/recovery orchestration.
- **Farm Manager**: Operational management (livestock, health, feed, breeding, tasks) and expense approvals up to ₦200,000.
- **Read-Only Staff**: Field inquiry, searching animals by current or historical tag, reviewing medical records and schedules.

---

## 5. Quick Start & Local Development

### Prerequisites
- Node.js v20+ (tested on v24.14.1)
- npm v10+

### Installation & Run
```bash
# 1. Clone the repository
git clone <REPO_URL> mais-ltd
cd mais-ltd

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your secrets

# 4. Start the development server (Vite + Express API on port 3000)
npm run dev
```

Visit `http://localhost:3000` in your browser. Default Admin credentials:
- **Email**: `belloaliyu808@gmail.com`
- **Password**: `admin123`

---

## 6. Verification & Automated Testing

```bash
# Run all automated test suites (domain, crypto, API)
npm test

# Run isolated domain rules tests
npm run test:domain

# Run isolated cryptographic vault tests
npm run test:crypto

# Run isolated API security and route tests
npm run test:api

# Typecheck the entire codebase with strict compiler flags
npm run type-check

# Compile production frontend bundle
npm run build
```

---

## 7. Backup & Disaster Recovery Commands

```bash
# Execute an instantaneous encrypted snapshot and sync offsite
npm run backup:run

# Verify cryptographic checksum and decryptability of the latest backup
npm run backup:verify

# Inspect local vault files and offsite S3 connectivity
npm run backup:status

# Safely prune expired non-monthly snapshots exceeding 30-day retention
npm run backup:prune
```

---

## 8. Master Documentation Index (`docs/`)

Comprehensive technical and operational specifications are available in `docs/`:

1. [Project Brief](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/PROJECT_BRIEF.md) — Farm background, mission statement, and operational context in Nigeria.
2. [Product Requirements Document (PRD)](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/PRODUCT_REQUIREMENTS.md) — Functional specifications for all 10 application modules.
3. [System Architecture](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/SYSTEM_ARCHITECTURE.md) — High-level and low-level architectural topology, diagrams, and request lifecycles.
4. [Database Schema](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/DATABASE_SCHEMA.md) — PostgreSQL DDL, tables, constraints, foreign keys, and indexes.
5. [Business Rules & Invariants](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/BUSINESS_RULES.md) — Mathematical formulas, gestation math, feed allocation, and withdrawal rules.
6. [User Roles & Permissions](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/USER_ROLES_AND_PERMISSIONS.md) — RBAC matrix, authorization tokens, and brute-force protection.
7. [UI/UX Design Standards](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/UI_UX_DESIGN.md) — Tailwind CSS v4 design tokens, color palette, and modal workflows.
8. [API Specification](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/API_SPECIFICATION.md) — OpenAPI REST endpoints, request/response bodies, and HTTP status codes.
9. [Backup & Disaster Recovery](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/BACKUP_AND_DISASTER_RECOVERY.md) — RTO/RPO targets, AES-256-GCM vault, and step-by-step restoration runbook.
10. [Security Architecture](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/SECURITY.md) — STRIDE threat model, SHA-256 audit chaining, and secret management.
11. [Testing Strategy & Acceptance](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/TESTING_AND_ACCEPTANCE.md) — Test criteria, verification commands, and Definition of Done.
12. [Production Deployment Guide](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/DEPLOYMENT.md) — Docker, Docker Compose, Nginx reverse proxy, and environment provisioning.
13. [Implementation Plan](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/IMPLEMENTATION_PLAN.md) — 7-phase roadmap, milestones, and deliverables.
14. [Project Status & Scorecard](file:///Users/macbook/antigravity/MAIS-LTD-Livestock-Management-System/docs/PROJECT_STATUS.md) — Current implementation metrics, test results, and next recommended tasks.