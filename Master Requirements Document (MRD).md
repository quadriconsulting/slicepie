# Master Requirements Document (MRD)

Below is a **Master Requirements Document (MRD)**  for the **Slicing Pie Equity Tracking System** implemented in **Google Sheets + Google Apps Script** (with Pending → Approve/Reject → Master ledger). It’s written so you can hand it to an engineer (or another LLM) and get an implementation that is consistent, testable, and “production-safe”.

---

# Slicing Pie Equity Tracking System (Google Sheets + Apps Script)

### Document Control

- **System Name:**  Slicing Pie Equity Tracking System
- **Version:**  v1.0 (Master Requirements)
- **Date:**  2026-02-20
- **Owner:**  Jay (Product/Business Owner)
- **Primary Users:**  Founders / Admin approvers; Contributors (optional self-service submission)

---

## 1. Purpose and Goals

### 1.1 Purpose

Track and manage contributor “slices” (dynamic equity units) using a Slicing Pie-style ledger, with:

- controlled submission of contributions,
- approval workflow (Pending queue),
- immutable Master ledger,
- deterministic recalculation of equity percentages,
- auditability (who approved what and when),
- strong data integrity and fail-fast behavior.

### 1.2 Primary Goals

1. **Correctness:**  Prevent corrupted approvals, double-approvals, schema mismatch issues, and invalid numeric inputs.
2. **Auditability:**  Every approval/rejection must be attributable (actor identity), timestamped, and tamper-evident.
3. **Operational usability:**  Approvers can approve/reject from buttons or menus based on selected row.
4. **Resilience:**  System must detect configuration drift (headers/columns mismatch) and block operations safely.
5. **Transparency:**  Clear status transitions and error messages that allow rapid debugging.

### 1.3 Non-goals (explicit)

- Not a cap-table replacement for legal issuance.
- Not a payroll or invoicing system.
- Not a valuation engine; equity is derived from slice proportions only.

---

## 2. Stakeholders and Roles

### 2.1 Roles

- **Owner/Admin**

  - Initializes system, configures schemas, manages approvers/quorum, can approve/reject.
- **Founder Approver**

  - Can approve/reject Pending rows (subject to quorum rules).
- **Contributor**

  - May submit contributions (via form, UI, or manual entry) depending on implementation.
- **Viewer/Read-only**

  - Can view ledger and reports but cannot mutate.

### 2.2 Permissions (Google)

- Spreadsheet permissions must enforce:

  - Contributors: edit only submission areas (or use Google Form).
  - Approvers: edit Pending and run scripts.
  - Master: ideally protected range or locked to script-only edits.

---

## 3. System Overview

### 3.1 High-level Components

- **Google Spreadsheet**

  - Sheets:

    - ​**Pending**: contribution requests awaiting decision
    - ​**Master**: immutable approved ledger (append-only)
    - ​**Contributors**: directory of contributors (keys, names, roles, metadata)
    - **Config** (optional): configuration values, schema version, parameters
    - **Audit Log** (optional but recommended): structured log entries
    - **Reports/Dashboard** (optional): equity breakdown, slices over time
- **Apps Script Code (Code.gs)**

  - Core business logic:

    - initialize system, validate schema, build column map
    - approveContribution(pendingRowNum)
    - rejectContribution(pendingRowNum, reason)
    - equity recalculation
    - signing / tamper evidence
  - UI glue:

    - approveSelectedPendingRow\_()
    - rejectSelectedPendingRow\_()
    - menus, alerts
  - Diagnostic tools:

    - CHECK\_buttonAssignments()
    - CHECK\_quorumSettings()
    - optional DIAG wrappers

---

## 4. Data Model and Schemas

### 4.1 Global Identifiers

- **ContributorKey** (required, unique): stable identifier (email or internal UUID)
- **RequestId** (required, unique for each submission): prevents replay/dedupe issues
- ​**DecisionSignature**: cryptographic or deterministic signature of decision record
- ​**MasterRowSignature**: signature of finalized master row (tamper evidence)

### 4.2 Pending Sheet (Required Columns)

Minimum required columns (exact names must match `getColMap_` mapping):

- ContributorKey
- ContributorName
- Status (PENDING / APPROVED / REJECTED / etc.)
- SlicesAwarded (numeric)
- RequestId (string)
- SubmittedAt (datetime)  *(recommended)*
- SubmittedBy (actor/email)  *(recommended)*
- ContributionType  *(recommended: CASH/TIME/IP/EXPENSE/OTHER)*
- Description  *(recommended)*
- Amount / Hours / Rate  *(optional depending on slicing method)*
- RejectionReason  *(only for rejected rows; optional)*

**Constraints**

- Status defaults to `PENDING` for new rows.
- RequestId must be unique within Pending and Master.
- SlicesAwarded must be finite number ≥ 0 and within configured sanity bound.

### 4.3 Master Sheet (Append-only Ledger)

Minimum required columns:

- MasterId (auto-increment or UUID)
- RequestId (unique)
- ContributorKey
- ContributorName
- SlicesAwarded
- ApprovedAt (timestamp)
- ApprovedBy (actor/email)
- DecisionSignature
- MasterRowSignature
- Status (APPROVED)
- SourcePendingRow (row number snapshot)  *(optional but useful)*

**Constraints**

- No edits to historical rows except via admin repair tooling (rare).
- Must prevent duplicates by RequestId.

### 4.4 Contributors Sheet (Directory)

- ContributorKey (unique)
- ContributorName
- Role (e.g., FOUNDER, EMPLOYEE, CONTRACTOR)
- ActiveFlag (ACTIVE/INACTIVE)
- StartDate, EndDate (optional)
- Notes (optional)

### 4.5 Configuration Object (`CONFIG`)

Required configuration keys:

- ​`PENDING_SCHEMA`: list defining expected Pending headers
- ​`MASTER_SCHEMA`: list defining expected Master headers
- ​`OWNER_EMAIL`: system owner identity
- ​`FOUNDER_APPROVERS`: list of authorized approver emails
- ​`QUORUM_THRESHOLD`: integer (default 1 unless multi-approver accumulation implemented)
- ​`MAX_SLICES_PER_CONTRIBUTION`: numeric sanity bound (default 100000)
- ​`SCHEMA_VERSION`: string (recommended)
- ​`SIGNING_SECRET`​ or secret reference  *(recommended)*

---

## 5. Core Workflows

### 5.1 Submission Workflow

**Trigger options**

- Manual row entry in Pending (restricted)
- Google Form submission (recommended)
- Custom sidebar UI

**Requirements**

- New contribution creates a Pending row with:

  - Status \= PENDING
  - RequestId generated if not provided (preferred)
  - SubmittedAt \= now
  - SubmittedBy \= actor (if known)

**Validation**

- ContributorKey and ContributorName required
- SlicesAwarded numeric and finite
- RequestId non-empty and unique

### 5.2 Approval Workflow (Happy Path)

1. Approver opens **Pending** sheet.
2. Approver selects any cell in the target row.
3. Approver clicks **Approve** button or menu item calling `approveSelectedPendingRow_()`.
4. System validates:

   - correct sheet
   - valid row number (≥2)
   - schema integrity (header/colMap)
   - row not blank
   - required fields not empty
   - status \=\=\= PENDING
   - slices numeric bounds
   - RequestId present and valid
   - quorum satisfied (current mode: QUORUM\_THRESHOLD \= 1 unless multi-approver is implemented)
5. Confirmation dialog shows contributor, slices, requestId preview.
6. On confirm:

   - Core `approveContribution(rowNum)` executes
   - Append immutable record to Master
   - Update Pending row status to APPROVED (and optionally ApprovedAt/ApprovedBy fields)
7. Success dialog shows key results and signature previews.

**Acceptance criteria**

- Approved row appears exactly once in Master.
- Pending row status transitions to APPROVED.
- Re-approving same row is blocked (status !\= PENDING).
- Duplicated RequestId is blocked.

### 5.3 Rejection Workflow

Similar to approval but:

- Prompt for reason (min length 3)
- Call `rejectContribution(rowNum, reason)`
- Update Pending row status to REJECTED + store reason

**Acceptance criteria**

- Rejected rows cannot be approved without explicit admin override tool.
- Reason is persisted.

### 5.4 Quorum / Multi-Approver Workflow (optional future)

Two valid modes:

**Mode A (Single approver)**

- QUORUM\_THRESHOLD must be 1.

**Mode B (Multi-approver accumulation)**

- Pending row has Approvers list field.
- First approver adds themselves; status remains PENDING\_QUORUM.
- Once approvers count ≥ QUORUM\_THRESHOLD, final approver triggers actual approval.

**Requirement**

- System must not ship “QUORUM\_THRESHOLD \> 1” without Mode B implemented.

---

## 6. Validation and Fail-Fast Policies

### 6.1 Schema Validation (critical)

System must not operate if schema drift detected.

- ​`CONFIG.PENDING_SCHEMA.length` must be integer ≥ 1.
- Width must not exceed sheet max columns.
- Headers for required columns must be present and non-blank.
- ​`getColMap_()` must return indices for required keys within bounds.

**Fail-fast behavior**

- Any drift → throw error with actionable remediation:

  - run Initialize System
  - show available keys in colMap error
  - show expected schema preview

### 6.2 Row Validation

- Row must be within `sheet.getLastRow()` boundary
- Row must not be “blank row” (including whitespace-only cells)
- ContributorKey and ContributorName required, trimmed
- Status must be exactly PENDING (or startsWith(PENDING) if you adopt future workflow)
- SlicesAwarded:

  - must not be Date
  - must be finite number (or blank treated as 0 only if policy allows)
  - must be ≥ 0
  - must be ≤ MAX\_SLICES\_PER\_CONTRIBUTION
- RequestId required unless legacy compatibility policy is enabled

### 6.3 Duplicate / Replay Protection

- RequestId must be unique in Master
- Approval must reject if RequestId already exists in Master
- Optional: store decision signature and verify it matches recomputed signature for tamper detection

---

## 7. Security and Integrity

### 7.1 Actor Identity

Approval/rejection must record approver identity via:

- ​`Session.getEffectiveUser().getEmail()` (primary)
- fallback handling if restricted contexts

### 7.2 Authorization

Only authorized approvers can approve/reject:

- actor must be OWNER\_EMAIL or in FOUNDER\_APPROVERS
- unauthorized actors get clear UI error and no state changes

### 7.3 Tamper Evidence

Minimum:

- DecisionSignature: derived from (RequestId, actor, timestamp, slices, contributorKey, action)
- MasterRowSignature: derived from full master row + signing secret

Recommended:

- Store signatures in Master.
- Optional scheduled audit job verifies signatures for all Master rows and flags drift.

### 7.4 Protected Ranges

- Protect Master sheet from manual edits (owner-only).
- Protect critical headers (row 1) from edits.
- Allow script to write via Apps Script owner privileges.

---

## 8. Reporting Requirements

### 8.1 Equity Calculation

Equity percent for each contributor:

- Equity% \= contributor\_total\_slices / total\_slices \* 100

Reports to provide:

- Current equity distribution (topline table)
- Slices over time (optional chart)
- Contribution ledger filtered by contributor, date range, type

### 8.2 Operational Metrics

- Count pending approvals
- Average time pending
- Rejection rate
- Duplicate/replay attempts (if logged)

---

## 9. UI/UX Requirements

### 9.1 Menus

Custom menu “Slicing Pie” with items:

- Initialize System
- Approve Selected Pending Row
- Reject Selected Pending Row
- Diagnostics:

  - CHECK\_buttonAssignments
  - CHECK\_quorumSettings
  - Verify Ledger Signatures (optional)

### 9.2 Buttons

Buttons on Pending sheet:

- Approve (calls `approveSelectedPendingRow_`)
- Reject (calls `rejectSelectedPendingRow_`)

**Requirement**

- No buttons should call `approveContribution()` directly (rowNum parameter risk).

### 9.3 Error Messaging

Errors must be:

- specific (what failed, where, why)
- actionable (how to fix)
- safe (no secret disclosure)
- include colMap keys when schema mismatch occurs

---

## 10. Logging and Audit

### 10.1 Execution Logs

- Use `Logger.log()` for developer/debug logs.

### 10.2 Audit Sheet (recommended)

For every approve/reject:

- timestamp
- actor
- action (APPROVE/REJECT)
- requestId
- contributorKey
- pendingRow
- outcome (SUCCESS/FAIL)
- error message (if fail)
- decisionSignature

This becomes your operational audit trail independent of Apps Script logs.

---

## 11. Initialization and Maintenance

### 11.1 Initialize System

Must:

- create required sheets if missing
- set headers exactly matching schema objects
- apply formatting / protected ranges
- backfill missing RequestIds if policy enabled
- set schema version and configuration sanity checks

### 11.2 Migration / Schema Evolution

- Maintain `SCHEMA_VERSION`
- On schema update:

  - update CONFIG schemas
  - run migration function that:

    - adds missing columns
    - preserves existing data
    - re-applies protections

---

## 12. Non-Functional Requirements

### 12.1 Reliability

- All critical operations are atomic as much as Apps Script allows.
- Use `LockService` around approve/reject to avoid simultaneous approvals on the same row.

### 12.2 Performance

- Approve/reject should execute within Apps Script limits.
- Avoid full-sheet scans in hot paths.
- Use cached column maps if safe.

### 12.3 Maintainability

- Single source of truth for schemas (CONFIG)
- Central helper functions for:

  - schema validation
  - row validation
  - authorization
  - signature generation

---

## 13. Testing Requirements

### 13.1 Test Cases (minimum)

- Approve valid pending row → Master append + status update
- Reject valid pending row → status update + reason persisted
- Approve header row → blocked
- Approve blank row → blocked
- Approve row with status APPROVED → blocked
- Approve with invalid slices (text/date/negative/too large) → blocked
- Approve with missing RequestId → blocked (unless legacy policy enabled)
- Duplicate RequestId in Master → blocked
- Schema drift: missing header/colMap mismatch → blocked with actionable error
- Quorum threshold \> 1 in single-approver mode → diagnostic flags critical issue
- Unauthorized actor tries approve/reject → blocked

### 13.2 Smoke Test Checklist (release)

- Run Initialize System
- Submit one pending entry
- Approve via button
- Verify Master row, signatures, and report outputs

---

## 14. Deployment and Operations

### 14.1 Deployment

- Apps Script project bound to spreadsheet
- Version tagged in header comment
- Only Owner deploys changes
- Maintain a rollback copy or GitHub export of script

### 14.2 Operational Runbook (minimum)

- If approvals fail: run diagnostics

  - CHECK\_buttonAssignments
  - CHECK\_quorumSettings
  - schema validation check
- If schema drift: run Initialize System
- If duplicates: inspect RequestId generation policy

---

## 15. Acceptance Criteria Summary

System is “production-ready” when:

- Approvals/rejections are safe from wrong-sheet, wrong-row, blank-row, schema drift, and invalid types.
- Master ledger is append-only and deduped by RequestId.
- Actor identity is recorded for every decision.
- Quorum config cannot silently block all approvals.
- Diagnostics reliably detect common operational failures.

---

## 16. Future Enhancements (Roadmap)

- Multi-approver quorum accumulation workflow (PENDING\_QUORUM)
- Contributor self-service submission via Form + validation
- Signature verification job + integrity dashboard
- Automatic RequestId generation + legacy backfill mode
- Export to cap table / investor-friendly summaries
- Integration with email notifications (approval required, decision made)

---

‍
