# SlicePie (Slicing Pie Equity Tracker) – Google Sheets + Apps Script

This repository contains a Google Sheets / Google Apps Script implementation of a Slicing Pie–style equity tracking workflow with a **Pending → Approval → Master ledger** pipeline, audit logging, and deterministic verification tests.

## What’s in this repo

- `Code.gs`  
  Primary Apps Script implementation (current production candidate).  
  Includes CR-01/CR-02/CR-03 reservation + idempotency logic and a deterministic test suite.

- `Code_legacy.gs`  
  Archived legacy implementation (kept for reference; **do not** load into the Apps Script project).

- `Engineering Implementation Spec.md` / `Master Requirements Document (MRD).md`  
  Requirements and implementation notes.

- `CR_IMPLEMENTATION_*` / `PHASE_*` docs  
  Evidence bundles and compliance reports.

## Key features

- Pending contributions captured in a `Pending` sheet
- Approval flow with concurrency/idempotency protections:
  - Reservation state machine
  - Canonical re-fetch by RequestId
  - MASTER_WRITTEN skip path to prevent duplicate master writes
  - Pointer validation + bounded retry
- Append-only ledger in `Master` sheet
- Audit trail in `Audit` sheet
- Deterministic verification suite runnable inside Apps Script

## Quick start (Google Apps Script)

### 1) Create a new Apps Script project
- Google Drive → New → More → Google Apps Script

### 2) Add the code
- Copy the contents of `Code.gs` from this repo into the Apps Script editor file `Code.gs`
- IMPORTANT: Do NOT add `Code_legacy.gs` into the Apps Script project (duplicate globals can break compilation)

### 3) Reload the spreadsheet to create menus
- Refresh the Google Sheet
- If the script defines `onOpen()`, it will add custom menu items

### 4) Initialize / migrate schema (if your menu provides it)
Run the initialization/migration actions in your menu (names may vary), typically:
1. Initialize System (create sheets + headers)
2. Enforce / Migrate Schema (ensure new Pending columns exist)
3. Migrate RequestIds (if legacy rows exist without RequestId)

## Verification (must run)

Run the full deterministic test suite:

1. Apps Script editor → select function `RUN_ALL_CR_VERIFICATIONS`
2. Click Run
3. Expected result: all tests PASS

If tests fail, fix before using the workflow in production.

## Common pitfalls

### “approveContribution: pendingRowNum is required”
You ran `approveContribution()` directly without a row number.
Use the menu-driven UI wrapper (e.g., `approveContributionUI_()`) or call `approveContribution(<rowNum>)`.

### “An unknown error has occurred…”
Most commonly caused by duplicate globals across multiple `.gs` files.
Remove `Code_legacy.gs` from the Apps Script project.

## Release workflow (recommended)

1. Create a feature branch
2. Make minimal diffs
3. Open PR
4. Merge after:
   - deterministic tests run in Apps Script
   - review confirms no unrelated refactors
5. Tag the release commit

## License
Add your license here (MIT/Apache-2.0/Proprietary).
