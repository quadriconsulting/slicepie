# Slicing Pie (Google Sheets + Apps Script)

This repo contains a Google Sheets implementation of a **Slicing Pie** equity tracker:
- Contributors record time/cash/expenses into a **Pending** ledger
- Founders approve contributions (with GBP quorum rules)
- Approved contributions are written to an append-only **Master** ledger
- An **Audit Log** provides tamper-evident tracking (hash chain + signatures)
- Optional admin sheets: **Config**, **Rate Card**, **Investor Export**

## Project Files

- `Code.gs` — **Primary Apps Script implementation** (current)
- `Code_legacy.gs` — Archived/legacy script (do not deploy alongside Code.gs unless all entrypoints are renamed)
- `Engineering Implementation Spec.md` — Technical design notes
- `Master Requirements Document (MRD).md` — Business requirements

## Key Sheets

- **Pending** — new contributions awaiting approval
- **Master** — append-only approved contribution ledger
- **Audit Log** — security/audit event stream
- **Config** — system settings (optional)
- **Rate Card** — role-based hourly rates (optional)
- **Investor Export** — cap table / investor view (optional)

## Approval + Quorum Rules (GBP)

- For contributions below the threshold: **1 founder approval** finalizes.
- For contributions at/above the threshold: **quorum approval** is required (e.g., **2 founders**).

(Threshold and quorum are configured in `CONFIG`.)

## How to Deploy / Run (Manual)

1. Create or open your target Google Sheet.
2. Open **Extensions → Apps Script**.
3. Paste the contents of `Code.gs` into the Apps Script editor (or upload as a file).
4. Set `CONFIG.OWNER_EMAIL` and `CONFIG.FOUNDER_APPROVERS` in `Code.gs`.
5. Save, then refresh the spreadsheet to load the menu (`onOpen`).
6. Run: **Slicing Pie → Initialize System**
   - Creates/verifies required sheets and schemas
   - Applies protections
   - Initializes signature secret

## Workflow

### Record a Contribution
Use the menu option **Record Contribution** (or the provided UI function, if enabled).
A new row is created in **Pending** with status/state set for approval.

### Approve a Contribution
Use **Slicing Pie → Workflow → Approve (Prompt)** and enter the Pending row number (≥2).
- If quorum is not yet met: status becomes `PENDING_QUORUM`
- When quorum is met: row is finalized and written to **Master**

### Verification
Use **Slicing Pie → Verification** menu items:
- Verify Protections
- Verify Audit Chain
- Verify Row Signatures
- Verify Decision Signatures

## Development Notes

### IMPORTANT: Google Apps Script Namespace Collisions
All `.gs` files share a global namespace. If two files define the same function name
(e.g., `onOpen`, `approveContribution`), behavior is undefined/last-loaded-wins.
If you keep `Code_legacy.gs` in the project, rename its entrypoints or remove it.

## License
Internal project – add license if/when needed.
