# AGENTS.md

## Project
MAIS LTD is an online-only livestock farm management system built around permanent animal identity and complete animal history.

## First Read
At the start of every session, read:
1. `docs/PROJECT_STATUS.md`
2. `docs/PROJECT_BRIEF.md`
3. The relevant specification for the current task.

Do not read every documentation file unless necessary.

## Source of Truth
- `docs/PROJECT_BRIEF.md`: product vision.
- `docs/PRODUCT_REQUIREMENTS.md`: required features.
- `docs/SYSTEM_ARCHITECTURE.md`: technical architecture.
- `docs/DATABASE_SCHEMA.md`: database design.
- `docs/BUSINESS_RULES.md`: business rules and data integrity.
- `docs/USER_ROLES_AND_PERMISSIONS.md`: authorization rules.
- `docs/UI_UX_DESIGN.md`: interface requirements.
- `docs/API_SPECIFICATION.md`: API contracts.
- `docs/BACKUP_AND_DISASTER_RECOVERY.md`: backup and recovery.
- `docs/SECURITY.md`: security requirements.
- `docs/TESTING_AND_ACCEPTANCE.md`: quality checks.
- `docs/DEPLOYMENT.md`: deployment.
- `docs/IMPLEMENTATION_PLAN.md`: development order.
- `docs/PROJECT_STATUS.md`: current progress and next action.

If documentation conflicts with the actual code or verified project configuration, investigate the difference and update the appropriate documentation. Never assume a feature exists because a document describes it.

## Non-Negotiable Rules
1. Every animal has a permanent internal ID.
2. Current and historical tag numbers must resolve to the same animal.
3. Animal history must remain linked when tags or statuses change.
4. Never silently reuse tag numbers.
5. Preserve parentage and relationships between animals.
6. Do not double-count expenses, payments, or inventory movements.
7. Enforce permissions on the backend and through appropriate database policies.
8. The only staff roles are Admin, Farm Manager, and Read-Only Staff.
9. The application is online-only. Do not implement offline synchronization.
10. Never expose secrets in frontend code or Git.
11. Never report a successful save, backup, restore, or test without verification.
12. Do not make destructive production changes without explicit authorization.
13. Use version-controlled migrations for database changes.
14. Prefer small, testable changes over unnecessary rewrites.

## Working Procedure
1. Read the project status and relevant specifications.
2. Inspect the existing implementation.
3. Identify the smallest safe change.
4. Implement the change.
5. Run relevant tests and checks.
6. Fix regressions.
7. Update `docs/PROJECT_STATUS.md`.
8. Record changed files, test results, unresolved risks, and the next task.

Do not claim tests passed unless they were executed.

## Context Management
Use the documentation as persistent project memory. Read only what is relevant. Keep `AGENTS.md` concise. Do not recreate the entire project plan in each session.

## Completion Standard
A task is complete only when its code, data integrity, authorization, error handling, and relevant tests have been addressed. Record any incomplete work explicitly.
