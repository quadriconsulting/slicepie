# Engineering Implementation Spec

# Slicing Pie Equity Tracking System (Google Sheets + Apps Script)

**Spec Version:**  v1.0  
**Date:**  2026-02-20  
**Primary File:**  `Code.gs`​ (bound Apps Script)  
**Primary Sheets:**  `Pending`​, `Master`​, `Contributors`​, `Audit`​ (optional but recommended), `Config` (optional)

---

## 0) Design Constraints (Non-Negotiable)

1. **Master is append-only.**  No in-place edits to historical records except explicit admin repair tooling (out of scope for v1).
2. **Pending decisions are idempotent and replay-safe** via `RequestId` uniqueness in Master.
3. **Fail-fast on schema drift**: if required headers/columns are missing or mis-mapped, block with actionable error.
4. **Buttons MUST NOT call core functions directly** (no parameters). Buttons call `approveSelectedPendingRow_()`​ / `rejectSelectedPendingRow_()`.
5. **Concurrency safe approvals** via `LockService`.
6. **Actor authorization enforced** (OWNER_EMAIL or FOUNDER_APPROVERS).
7. **Deterministic signatures** recorded in Master (DecisionSignature + MasterRowSignature).

---

## 1) Exact Sheet Schemas (Final Header Lists)

> All headers are **case-sensitive** and must match exactly.  
> Column order is fixed for v1. Any changes require a schema migration function and SCHEMA_VERSION bump.

### 1.1 Sheet: `Pending`

**Row 1 headers (A → O):**

1. ​`RequestId`​  *(required, unique per request)*
2. ​`SubmittedAt`​  *(required; set by script / form)*
3. ​`SubmittedBy`​  *(recommended; actor email if available)*
4. ​`ContributorKey`​  *(required; stable key, typically email or UUID)*
5. ​`ContributorName`​  *(required)*
6. ​`ContributionType`​  *(recommended; enum-like string: CASH|TIME|IP|EXPENSE|OTHER)*
7. ​`Description`​  *(recommended; free text)*
8. ​`Amount`​  *(optional; numeric; meaning depends on type)*
9. ​`Hours`​  *(optional; numeric)*
10. ​`Rate`​  *(optional; numeric)*
11. ​`SlicesAwarded`​  *(required numeric policy; blank treated as 0 ONLY if allowed)*
12. ​`Status`​  *(required; PENDING/APPROVED/REJECTED)*
13. ​`DecisionAt`​  *(set on approve/reject)*
14. ​`DecisionBy`​  *(set on approve/reject)*
15. ​`RejectionReason`​  *(set on reject)*

**Required for approval path:**  `RequestId`​, `ContributorKey`​, `ContributorName`​, `SlicesAwarded`​, `Status`​  
**Required for rejection path:**  `RequestId`​, `ContributorKey`​, `ContributorName`​, `Status`​  
**Status policy (v1):**  must be exactly `PENDING` for approve/reject.

---

### 1.2 Sheet: `Master` (Append-only Ledger)

**Row 1 headers (A → N):**

1. ​`MasterId`​  *(required; UUID or monotonic ID)*
2. ​`ApprovedAt`​  *(required)*
3. ​`ApprovedBy`​  *(required)*
4. ​`RequestId`​  *(required; unique; used for dedupe/anti-replay)*
5. ​`ContributorKey`​  *(required)*
6. ​`ContributorName`​  *(required)*
7. ​`ContributionType`​  *(optional copy from Pending)*
8. ​`Description`​  *(optional copy from Pending)*
9. ​`Amount`​  *(optional copy from Pending)*
10. ​`Hours`​  *(optional copy from Pending)*
11. ​`Rate`​  *(optional copy from Pending)*
12. ​`SlicesAwarded`​  *(required; numeric)*
13. ​`DecisionSignature`​  *(required; tamper-evident)*
14. ​`MasterRowSignature`​  *(required; tamper-evident)*

**Uniqueness constraint:**  `RequestId` must be unique across all Master rows.

---

### 1.3 Sheet: `Contributors` (Directory)

**Row 1 headers (A → H):**

1. ​`ContributorKey`​  *(required, unique)*
2. ​`ContributorName`​  *(required)*
3. ​`Role`​  *(optional; FOUNDER|EMPLOYEE|CONTRACTOR|ADVISOR|OTHER)*
4. ​`ActiveFlag`​  *(required; ACTIVE|INACTIVE)*
5. ​`StartDate`​  *(optional)*
6. ​`EndDate`​  *(optional)*
7. ​`Notes`​  *(optional)*
8. ​`LastUpdatedAt`​  *(optional; set by script if it edits contributors)*

---

### 1.4 Sheet: `Audit` (Recommended)

**Row 1 headers (A → L):**

1. ​`AuditId`
2. ​`At`
3. ​`Actor`
4. ​`Action`​  *(APPROVE|REJECT|INIT|MIGRATE|ERROR)*
5. ​`Outcome`​  *(SUCCESS|FAIL)*
6. ​`RequestId`
7. ​`ContributorKey`
8. ​`PendingRow`
9. ​`MasterRow`
10. ​`DecisionSignature`
11. ​`ErrorMessage`
12. ​`ContextJson`​  *(stringified JSON; keep small)*

---

### 1.5 Optional Sheet: `Config` (If you prefer sheet-based config)

**Row 1 headers:**  `Key`​, `Value`​, `Notes`

> For v1, config is assumed in `CONFIG`​ constant in `Code.gs`​. `Config` sheet is optional.

---

## 2) Configuration Contract (`CONFIG`)

Minimum required keys in `Code.gs`:

```js
const CONFIG = {
  SCHEMA_VERSION: 'v1.0',
  OWNER_EMAIL: 'owner@example.com',
  FOUNDER_APPROVERS: ['a@example.com', 'b@example.com'],
  QUORUM_THRESHOLD: 1, // v1 requires 1
  MAX_SLICES_PER_CONTRIBUTION: 100000,

  // Schemas must match headers exactly
  PENDING_SCHEMA: [
    'RequestId','SubmittedAt','SubmittedBy','ContributorKey','ContributorName',
    'ContributionType','Description','Amount','Hours','Rate','SlicesAwarded',
    'Status','DecisionAt','DecisionBy','RejectionReason'
  ],
  MASTER_SCHEMA: [
    'MasterId','ApprovedAt','ApprovedBy','RequestId','ContributorKey','ContributorName',
    'ContributionType','Description','Amount','Hours','Rate','SlicesAwarded',
    'DecisionSignature','MasterRowSignature'
  ],
  CONTRIBUTORS_SCHEMA: [
    'ContributorKey','ContributorName','Role','ActiveFlag','StartDate','EndDate','Notes','LastUpdatedAt'
  ],
  AUDIT_SCHEMA: [
    'AuditId','At','Actor','Action','Outcome','RequestId','ContributorKey','PendingRow',
    'MasterRow','DecisionSignature','ErrorMessage','ContextJson'
  ],

  // Signing
  SIGNING_SECRET_PROPERTY_KEY: 'SLICING_PIE_SIGNING_SECRET', // stored in PropertiesService
};
```

‍

‍

**Signing secret requirement:**

- The secret must be stored in `PropertiesService.getScriptProperties()`​ under `SIGNING_SECRET_PROPERTY_KEY`.
- Never hardcode secrets in source.

---

## 3) Public Function Contracts (Apps Script Entry Points)

### 3.1 Initialization / Migration

#### `onOpen()`

**Purpose:**  Add custom menu.  
**Inputs:**  none  
**Side effects:**  Adds `Slicing Pie`​ menu.  
**Failure mode:**  should not throw; log errors.

#### `initializeSystem_()`

**Purpose:**  Create missing sheets, set headers, apply protections, set schema version, seed signing secret check.  
**Inputs:**  none (UI-driven)  
**Output:**  `{ ok: true }`​ or throws Error  
**Idempotent:**  Yes (safe to re-run)

**Acceptance:**  After run, all required sheets exist with correct headers and protected header row.

---

### 3.2 UI Actions (Buttons / Menus)

#### `approveSelectedPendingRow_()`

**Purpose:**  Approve currently selected Pending row (button-safe).  
**Inputs:**  none  
**Output:**  void (UI alerts), logs error and throws internally (caught)  
**Guards:**

- Active sheet is `Pending`
- Selection exists and is on `Pending`
- Row \>\= 2
- Schema validated and colMap valid
- Row not blank
- Required cells valid
- Status \=\= `PENDING`
- Authorization check passes
- Lock acquired
- Dedupe by `RequestId`

**Calls:**  `approveContribution(rowNum)`

#### `rejectSelectedPendingRow_()`

**Purpose:**  Reject selected row with reason prompt.  
**Inputs:**  none  
**Output:**  void (UI alerts)  
**Guards:**  similar to approve; status must be `PENDING`​  
**Calls:**  `rejectContribution(rowNum, reason)`

---

### 3.3 Core Mutators (Not for buttons)

#### `approveContribution(pendingRowNum, opts)`

**Purpose:**  Atomically approve a Pending row and append to Master.  
**Inputs:**

- ​`pendingRowNum`​  *(number; required;*   *>=2)*
- ​`opts`​  *(optional object)* :

  - ​`skipHighValueCheck`​  *(bool; default false)*
  - ​`bypassRequestIdCheck`​  *(bool; default false; only for admin repair tooling, normally false)*

**Output (object):**

```js
{
  requestId: string,
  contributorKey: string,
  contributorName: string,
  slicesAwarded: number,
  equityPercent: string, // e.g. "3.42%" (optional if report calc is separate)
  decisionSignature: string,
  masterRowSignature: string,
  masterRowNum: number
}
```

**Atomicity requirement:**  Under lock, perform:

1. Read Pending row snapshot
2. Validate again (defense in depth)
3. Dedupe: check Master contains RequestId
4. Append Master row
5. Update Pending row fields: Status\=APPROVED, DecisionAt, DecisionBy
6. Write audit record SUCCESS

On any error:

- Write audit FAIL (best-effort)
- Must not leave partially written Master row without corresponding Pending update.  
  **Strategy:**  If Master append succeeded but Pending update failed, system must surface “inconsistent state” and provide remediation instructions (manual repair or admin repair tool). Prefer ordering to minimize this (see §4 locking + transaction notes).

#### `rejectContribution(pendingRowNum, reason, opts)`

**Purpose:**  Reject Pending row with reason, without Master append.  
**Inputs:**

- ​`pendingRowNum`​  *(number; required;*   *>=2)*
- ​`reason`​  *(string; required; min length 3)*
- ​`opts`​  *(optional)* : future

**Output (object):**

```js
{
  requestId: string,
  contributorKey: string,
  contributorName: string,
  decisionSignature: string
}
```

**Actions:**  Update Pending: Status\=REJECTED, DecisionAt, DecisionBy, RejectionReason; write audit.

---

### 3.4 Diagnostics (Public)

#### `CHECK_buttonAssignments()`

Scans drawings for direct assignments to core functions. Logs remediation.

#### `CHECK_quorumSettings()`

Validates quorum config matches implemented mode (v1 must be 1). Logs remediation.

#### `verifyLedgerSignatures_()`​  *(recommended public admin tool)*

Iterates Master rows, recomputes signatures, flags mismatches (log + optional Audit).  
**Must be read-only** (except writing Audit).

---

## 4) Internal Helper Function Contracts (Must Exist)

> These are not menu/button entry points, but are required building blocks.

### 4.1 Sheet Access

- ​`getSheet_(name) -> Sheet`  
  Throws if missing.

### 4.2 Schema and Column Mapping

- ​`getColMap_(sheet, schema) -> Object<string, number>`​  
  Maps header names to 0-based indices.  
  **Hard requirement:**  mapping keys must include required fields as-is (case-sensitive).
- ​`validateSchema_(sheet, schema, requiredKeys) -> { width, colMap, headers }`  
  Fail-fast:

  - schema length valid
  - within sheet max columns
  - header cells not blank (policy: either strict-all or required-only)
  - requiredKeys present and indices in range

### 4.3 Authorization

- ​`getActorEmail_() -> string`  
  Prefer effective user email; fallback to session.
- ​`assertAuthorizedApprover_(actorEmail)`​  
  Throws if not OWNER or in FOUNDER\_APPROVERS.

### 4.4 RequestId + Dedupe

- ​`assertRequestIdUnique_(requestId, masterSheet, masterColMap)`  
  Efficient strategy: maintain hidden index or scan RequestId column (acceptable for small/med ledgers).  
  For scale, implement caching/indexing later.

### 4.5 Validation

- ​`parseSlices_(value) -> number`​  
  Reject Date, reject non-finite, enforce \>\=0, enforce \<\= MAX\_SLICES\_PER\_CONTRIBUTION.
- ​`isBlankRow_(rowValues) -> boolean`  
  Treat whitespace-only as blank.

### 4.6 Signatures

- ​`getSigningSecret_() -> string`  
  Read from ScriptProperties; throw if missing.
- ​`computeDecisionSignature_(payload, secret) -> string`
- ​`computeMasterRowSignature_(masterRowArray, secret) -> string`​  
  Implementation should use SHA-256 (`Utilities.computeDigest`) and stable serialization.

### 4.7 Audit

- ​`appendAudit_(auditObj)`  
  Best-effort, never blocks core success unless explicitly required.

---

## 5) Locking Strategy (LockService)

### 5.1 Lock Type

Use **Document Lock** for all approve/reject operations:

- ​`const lock = LockService.getDocumentLock();`

### 5.2 Acquisition

- ​`lock.waitLock(30 * 1000)` (30s)  
  If cannot acquire:
- show UI error: “System busy—try again.”
- write audit FAIL with action APPROVE/REJECT outcome FAIL (best-effort)

### 5.3 Lock Scope (Critical Section)

For `approveContribution`​ and `rejectContribution`:

- Acquire lock at the beginning of the core mutator.
- Within lock:

  - Re-read Pending row (don’t trust pre-validated data)
  - Check status still PENDING (prevents double click / race)
  - Dedupe check on Master
  - Write operations (append/update)
- Release lock in `finally`.

### 5.4 Ordering to Minimize Inconsistent States

**Preferred approval write ordering (under lock):**

1. Validate + dedupe
2. Append to Master
3. Update Pending decision fields

This ensures ledger is primary source of truth.  
**BUT** it risks “Master appended but Pending not updated” if update fails.

Mitigation:

- After Master append, immediately attempt Pending update.
- If Pending update fails, throw an error that includes:

  - MasterRowNum
  - RequestId
  - remediation steps (manual set Pending status to APPROVED + fill DecisionAt/DecisionBy)

Optional improvement (v1.1):

- Write a “DecisionInProgress” marker to Pending before Master append, then finalize.

---

## 6) Definition of Done (DoD) Checklist (Engineering)

### 6.1 Schema + Initialization

- [ ] ​`initializeSystem_()` creates missing sheets: Pending, Master, Contributors, (Audit optional) with exact headers in row 1.
- [ ] Header row is protected (owner-only).
- [ ] Master sheet is protected against manual edits (owner-only; script can write).
- [ ] ​`CONFIG.*_SCHEMA` matches sheet headers exactly.
- [ ] ​`SCHEMA_VERSION` recorded (Config sheet or ScriptProperties).

### 6.2 UI Wiring

- [ ] Custom menu `Slicing Pie` appears on open with: Initialize, Approve Selected, Reject Selected, Diagnostics.
- [ ] Pending sheet has buttons assigned ONLY to:

  - ​`approveSelectedPendingRow_`
  - ​`rejectSelectedPendingRow_`
- [ ] ​`CHECK_buttonAssignments()` detects any misassigned drawing buttons and logs fixes.

### 6.3 Approval Path Correctness

- [ ] Approving a valid Pending row:

  - [ ] Acquires lock
  - [ ] Verifies authorization
  - [ ] Verifies schema/colMap
  - [ ] Verifies status \=\= PENDING
  - [ ] Validates RequestId present
  - [ ] Validates slices numeric and within bounds
  - [ ] Dedupe check prevents duplicate RequestId in Master
  - [ ] Appends exactly one row to Master
  - [ ] Updates Pending row: Status\=APPROVED, DecisionAt, DecisionBy
  - [ ] Writes audit SUCCESS
- [ ] Double-approval attempt (same row) is blocked.

### 6.4 Rejection Path Correctness

- [ ] Rejecting prompts for reason, enforces min length.
- [ ] Updates Pending: Status\=REJECTED, DecisionAt, DecisionBy, RejectionReason.
- [ ] No Master append occurs.
- [ ] Writes audit SUCCESS.

### 6.5 Fail-Fast + Error Quality

- [ ] Schema drift causes hard failure with actionable message.
- [ ] Missing colMap key errors include available keys (truncated).
- [ ] Wrong sheet / no selection / header row selected are handled with UI alerts (no mutations).
- [ ] Invalid slices (Date/text/negative/too large) are blocked with clear UI message.
- [ ] Lock acquisition failure yields “system busy” message.

### 6.6 Signatures + Integrity

- [ ] Signing secret stored in ScriptProperties and required to run approval.
- [ ] DecisionSignature and MasterRowSignature are computed deterministically and stored in Master.
- [ ] Optional: `verifyLedgerSignatures_()` identifies signature mismatches.

### 6.7 Concurrency + Idempotency

- [ ] LockService used for approve/reject core mutators.
- [ ] Master RequestId uniqueness enforced under lock.
- [ ] If partial failure occurs (Master append succeeded but Pending update failed), system:

  - [ ] surfaces remediation steps
  - [ ] writes Audit FAIL with context

### 6.8 Tests (Manual + Automated Where Possible)

- [ ] Manual smoke test script documented:

  - initialize
  - create pending entry
  - approve
  - verify Master + Pending update
  - reject another entry
- [ ] At least 10 explicit test cases pass (from MRD test list).

---

## 7) Notes for the Implementer

- Prefer **0-based indices** in `colMap`, but be consistent throughout.
- Avoid `getLastColumn()` for schema width; use schema length and header completeness checks.
- Use batch reads/writes where possible (`getRange(...).getValues()`​ and `setValues()`).
- Keep UI output concise; put deep detail in logs and Audit.

---

## 8) Minimal Public API Surface (Final)

**Public (menu/button/ops):**

- ​`onOpen`
- ​`initializeSystem_`
- ​`approveSelectedPendingRow_`
- ​`rejectSelectedPendingRow_`
- ​`approveContribution`
- ​`rejectContribution`
- ​`CHECK_buttonAssignments`
- ​`CHECK_quorumSettings`
- ​`verifyLedgerSignatures_`​  *(recommended)*

Everything else must be internal helpers.

---

‍
