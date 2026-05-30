---
name: Payroll module integration pattern
description: How the Gemini payroll/distribution module is wired into the codebase — key design decisions and integration checklist
---

## Pattern
`server/routes/payroll.ts` and `server/routes/distribution.ts` import `payrollStorage` and `distributionStorage` **directly** from their storage modules, not via the shared `storage` singleton. This avoids the name-collision problem where both modules export `listRuns`, `getRun`, and `createRun`.

## Name collision in Object.assign
Both `payrollStorage` and `distributionStorage` are merged into `DatabaseStorage.prototype` via `Object.assign` in `server/storage/index.ts`. Since `distributionStorage` is assigned last, the distribution versions of `listRuns`/`getRun`/`createRun` win. The IStorage interface uses renamed aliases (`listPayrollRuns`, `getPayrollRun`, etc.) for the payroll side to avoid type conflicts — these aliases exist for type hygiene only and are not callable on the runtime `storage` singleton.

**Why:** Routes call the storage modules directly, so the alias naming in IStorage is irrelevant to runtime correctness.

## Integration checklist for future payroll-related merges
1. Run `drizzle-kit push` to apply any new migrations
2. Add new method signatures to the `IStorage` interface in `server/storage/index.ts` (import types from `@shared/schema` and service modules as needed)
3. If a new service file is added (like `payroll-user-sync.ts`), check the PR comments for where it's supposed to be called — it may not have been wired into the routes
4. `payrollEmployeeType` on the `users` table must flow through the PATCH `/api/users/:id` allowedFields list + trigger `syncUserPayrollEnrollment`

## DB schema note
All payroll monetary amounts are stored as **integer cents** (not decimals) to avoid floating-point drift. The column naming convention is `amountCents`, `grossCents`, `netPayCents`, etc.

## Encryption
SSN and bank account numbers use AES-256-GCM via `server/services/crypto.ts`. Envelope format: `v1:<iv>:<tag>:<ciphertext>`. Display-safe last-4 stored separately. Routes never echo the `ssnEnc` / `bankAccountNumberEnc` fields back to clients.
