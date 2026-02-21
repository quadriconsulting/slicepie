# Slicing Pie Equity Tracking (Google Sheets + Apps Script)

A Google Sheets–bound Apps Script implementation of a Slicing Pie–style equity tracker with:
- Pending → Approval/Reject → Master ledger workflow
- Quorum-based approvals (for high-value contributions)
- HMAC-backed decision integrity + audit logging
- Deterministic verification suite for critical correctness properties

## Repository Layout

- `Code.gs` — **current production script** (promoted from `code_gbp_quorum_FIXED2.gs`)
- `Code_legacy.gs` — archived legacy script (previous `Code.gs`)
- `Engineering Implementation Spec.md` — technical implementation guidance
- `Master Requirements Document (MRD).md` — product/business requirements
- `CR_IMPLEMENTATION_*.md` / `PHASE_*.md` — evidence bundles, coverage, verification, and reports

## Quick Start (Manual Test in Google Sheets)

1. Create a new Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Paste the contents of `Code.gs` into the editor (or replace the file contents).
4. **Save** and reload the spreadsheet tab.
5. Confirm a custom menu appears: **Slicing Pie**.

### Initialize the system
From the spreadsheet:
- **Slicing Pie → Initialize System**

This creates/repairs required sheets (e.g., Pending, Master, Audit Log) and enforces schema.

### Approve a Pending row (IMPORTANT)
Do **NOT** run `approveContribution()` directly with no arguments.

Use the menu-driven wrapper:
- **Slicing Pie → Workflow → Approve (Prompt)**

It will ask you for the Pending sheet row number (must be **≥ 2**).

If you run `approveContribution()` from the Apps Script editor without an argument,
you will see:
> `approveContribution: pendingRowNum is required (null/undefined received)...`

This is expected and is a safety guard.

### Reject a Pending row
- **Slicing Pie → Workflow → Reject (Prompt)**

## Verification Suite (Deterministic)

Run the full verification suite from the Apps Script editor:
- Select function: `RUN_ALL_CR_VERIFICATIONS`
- Click **Run**

Expected:
- UI alert indicates all tests passed
- Execution logs show PASS for all CR tests

## What’s Implemented (CR-01/02/03)

The current `Code.gs` includes the reservation/state-machine and correctness protections:

- CR-01: post-reservation re-fetch + MASTER_WRITTEN skip + row identity safety
- CR-02: invalid timestamp produces clean RESERVED record (no FAILED+mixed metadata)
- CR-03: master pointer validation on skip path + bounded retry behavior

## Development / PR Workflow

Recommended PR pattern:
- PR-0: documentation-only (plan, coverage, verify notes)
- PR-1: code changes + tests + minimal diff
- Merge only after manual menu-driven validation in a Sheet and after `RUN_ALL_CR_VERIFICATIONS()` passes

## Notes

- This project is designed to be run as a **spreadsheet-bound** Apps Script project.
- Menu-driven workflow is the intended operational path for approvals/rejections.
