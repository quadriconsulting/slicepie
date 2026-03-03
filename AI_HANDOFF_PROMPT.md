# AI Developer Handoff: Slicing Pie Equity System - PR-1 Continuation

## 🎯 Mission Statement

You are now the **Staff-Level Google Apps Script Developer** for the "Slicing Pie" equity allocation system (v6.0.34j-PRODUCTION-FINAL). Your mission is to continue modernizing the UI/UX by replacing sequential `ui.prompt()` dialogs with professional HTML forms while maintaining strict backward compatibility and preserving critical business logic.

---

## 📋 Project Context

### What is Slicing Pie?

A Google Sheets-based equity allocation system that tracks contributions, approvals, and equity distribution for startups using the Slicing Pie methodology. The system implements:

- **Contribution Tracking:** Pending contributions → Master ledger via approval workflow
- **Cryptographic Security:** HMAC-SHA256 signatures for audit integrity (CR-01)
- **Audit Chain:** Immutable append-only log with signature verification (CR-02)
- **State Machine:** PENDING → APPROVED/REJECTED with quorum support (CR-03)
- **Concurrency Control:** Document-level locks with `withDocLock_()` wrapper
- **Schema Enforcement:** Strict column ordering via `CONFIG.*_SCHEMA` constants

### Repository Details

- **Repository:** https://github.com/quadriconsulting/slicepie
- **Current Branch:** `feature/pr1-menu-consolidation`
- **Base Branch:** `main`
- **Latest Commit:** `b30cd85` - Modern HTML dialog for Add Contributor
- **Primary File:** `Code.gs` (4,594 lines)
- **Secondary Files:** `AddContributorForm.html` (365 lines - recently created)
- **Local Path:** `/home/user/webapp/slicepie`

### Project Structure

```
slicepie/
├── Code.gs                      # Main Apps Script file (4,594 lines)
├── AddContributorForm.html      # Modern Material Design form (NEW)
├── README.md                    # Project documentation
├── CLAUDE.md                    # Claude-specific instructions
├── CR_*.md                      # Critical requirement documents
└── PR1_PATCH.diff              # Historical patch file
```

---

## 🎨 Current State: What We Just Completed

### Recently Implemented (Commit `b30cd85`)

**Feature:** Replaced `addContributorUI_()` sequential prompts with modern HTML dialog

**Changes Made:**
1. ✅ Created `AddContributorForm.html` (365 lines)
   - Material Design styling matching Google Workspace
   - Single unified form with Name, Email, Role dropdown, Status dropdown
   - Client-side validation with inline error messages
   - Loading states and success feedback
   - Auto-closes after 2 seconds on success

2. ✅ Refactored `addContributorUI_()` in `Code.gs` (lines 3191-3211)
   - Changed from sequential `ui.prompt()` calls to `HtmlService.createHtmlOutputFromFile()`
   - Opens 450x550px modal dialog
   - Proper error handling

3. ✅ Created `processNewContributor(formData)` backend handler (lines 3220-3304)
   - Receives form data from HTML via `google.script.run`
   - Validates all inputs server-side
   - Generates unique `ContributorKey` (NAME_TIMESTAMP format)
   - Appends row matching `CONFIG.CONTRIBUTORS_SCHEMA`: `[ContributorKey, Name, Email, Role, JoinDate, Status, Notes]`
   - Returns success object with contributor details

**Impact:**
- UX improvement: 1 unified dialog vs 4 sequential prompts
- Status field: Now user-selectable (Active/Separated) instead of hardcoded to 'Active'
- Better validation: Client-side + server-side with descriptive errors
- Professional appearance: Material Design with proper colors, shadows, animations

---

## 🚨 Critical Constraints (NON-NEGOTIABLE)

### 1. **Preserve CR-01/02/03 Logic** ⚠️ ABSOLUTE PRIORITY

**DO NOT TOUCH THESE LINES:**
- **CR-01:** Lines 1786-1850 (signature generation)
- **CR-02:** Lines 3124-3150 (audit chain integrity)
- **CR-03:** Lines 3223-3250 (state consistency)
- **Integration:** Lines 1807-1840 (CR interaction points)

**Why Critical:**
- These implement cryptographic signatures and audit chain integrity
- Changes break existing data verification
- System has 6 verification tests that MUST pass: `RUN_ALL_CR_VERIFICATIONS()`
- Production data depends on these signatures

### 2. **Schema Compliance** 🔒

All sheet operations MUST match these schemas exactly:

```javascript
CONFIG.PENDING_SCHEMA: [
  Timestamp, ContributorKey, ContributorName, ContributionType, 
  Multiplier, BaseValue, Quantity, SlicesAwarded, EvidenceURL, 
  Notes, Status, Approvers, DecisionSignature, DecisionTimestamp, 
  RequestId, Approver1, Approver2, Approver3, QuorumCount, ApprovalStatus
] // 20 columns

CONFIG.MASTER_SCHEMA: [
  ContributorKey, ContributorName, ContributionType, Multiplier, 
  BaseValue, Quantity, SlicesAwarded, DateApproved, Signature
] // 9 columns

CONFIG.CONTRIBUTORS_SCHEMA: [
  ContributorKey, Name, Email, Role, JoinDate, Status, Notes
] // 7 columns

CONFIG.AUDIT_LOG_SCHEMA: [
  Timestamp, Actor, Action, Details, Signature
] // 5 columns

CONFIG.RATE_CARD_SCHEMA: [
  ContributionType, Multiplier, BaseValue, Description
] // 4 columns
```

**Key Rule:** Never insert columns mid-schema. Always append new columns to the end if expansion is needed.

### 3. **Menu Structure** 📋

Current menu hierarchy (DO NOT BREAK):

```
Slicing Pie (Root Menu)
├── Record Contribution → recordContributionUI_()
├── View Cap Table → viewCapTableUI_()
├── Rotate Signature Secret → rotateSignatureSecret_()
├── Manual Audit Flush → manualFlushAuditQueue_()
├── Admin (Submenu)
│   ├── Initialize System → initializeSystem_()
│   ├── Approve Contributions → approveSelectedPendingRowUI_()
│   ├── Add Contributor → addContributorUI_() [JUST MODERNIZED]
│   ├── Rename Contributor → renameContributorUI_() [NEXT TARGET]
│   ├── Generate Investor Export → generateInvestorExportUI_()
│   ├── Apply Protections → applyProtectionsUI_()
│   ├── Audit Protections → auditProtectionsUI_()
│   ├── Verify Audit Chain → verifyAuditChainUI_()
│   ├── Rebuild Pending Queue (Stub) → rebuildPendingQueueUI_()
│   └── Rebuild Master Totals (Stub) → rebuildMasterTotalsUI_()
├── Workflow (Submenu)
│   ├── Approve (Prompt) → approveContributionUI_()
│   └── Reject (Prompt) → rejectContributionUI_()
├── Migration (Submenu)
│   ├── Migrate Pending RequestIds → migratePendingRequestIds_()
│   └── Re-sign Existing Decisions → resignExistingDecisions_()
└── Verification (Submenu)
    ├── Verify Protections → verifyProtections_()
    ├── Verify Row Signatures → verifyRowSignaturesUI_()
    └── Verify Decision Signatures → verifyDecisionSignaturesUI_()
```

**Rules:**
- All menu handlers MUST be parameterless functions
- UI wrappers validate inputs then call core business logic functions
- Keep menu structure intact (locations, labels, function names)

### 4. **Error Handling Standards** ⚠️

**Bad (DO NOT DO):**
```javascript
throw new Error('Unknown error occurred');
ui.alert('Error', 'Something went wrong', ui.ButtonSet.OK);
```

**Good (ALWAYS DO):**
```javascript
throw new Error('Contributors sheet not found. Please run "Initialize System" first.');
ui.alert('Error', 'Failed to add contributor.\n\nError: ' + err.message + '\n\nPlease ensure...', ui.ButtonSet.OK);
```

**Requirements:**
- Every error message must be actionable (tell user what to do)
- Include context (what operation failed, what state is invalid)
- Use try-catch blocks in ALL UI wrapper functions
- Log errors to console: `console.error('functionName error:', err);`

### 5. **Git Workflow** 🔄

**MANDATORY AFTER EVERY CODE CHANGE:**

```bash
# 1. Stage changes
git add <files>

# 2. Commit immediately (descriptive message)
git commit -m "feat(pr1): [what you did]"

# 3. Fetch latest remote
git fetch origin main

# 4. Rebase if needed (resolve conflicts prioritizing remote code)
git rebase origin/main

# 5. Push to feature branch
git push origin feature/pr1-menu-consolidation

# 6. Provide PR link to user
# https://github.com/quadriconsulting/slicepie/compare/main...feature/pr1-menu-consolidation
```

**Conflict Resolution:**
- Always prefer remote (main branch) code when in doubt
- Only keep local changes if they're essential to the feature
- Use `git status` to identify conflicted files
- After resolving: `git add <file>` → `git rebase --continue`

---

## 🎯 Your Next Task: Modernize `renameContributorUI_()`

### Current Implementation (Lines 3252-3298 in Code.gs)

```javascript
function renameContributorUI_() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Prompt for ContributorKey
    const keyResponse = ui.prompt('Rename Contributor', 'Enter ContributorKey:', ui.ButtonSet.OK_CANCEL);
    if (keyResponse.getSelectedButton() !== ui.Button.OK) return;
    const contributorKey = keyResponse.getResponseText().trim();
    if (!contributorKey) {
      ui.alert('Error', 'ContributorKey cannot be empty.', ui.ButtonSet.OK);
      return;
    }
    
    // Prompt for new name
    const nameResponse = ui.prompt('Rename Contributor', 'Enter new name:', ui.ButtonSet.OK_CANCEL);
    if (nameResponse.getSelectedButton() !== ui.Button.OK) return;
    const newName = nameResponse.getResponseText().trim();
    if (!newName) {
      ui.alert('Error', 'Name cannot be empty.', ui.ButtonSet.OK);
      return;
    }
    
    // Get Contributors sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Contributors');
    if (!sheet) {
      ui.alert('Error', 'Contributors sheet not found. Please run "Initialize System" first.', ui.ButtonSet.OK);
      return;
    }
    
    // Find and update contributor
    const data = sheet.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === contributorKey) {
        sheet.getRange(i + 1, 2).setValue(newName); // Update Name column (index 1)
        found = true;
        break;
      }
    }
    
    if (found) {
      ui.alert('Success', 'Contributor renamed successfully!\n\nContributorKey: ' + contributorKey + '\nNew Name: ' + newName, ui.ButtonSet.OK);
    } else {
      ui.alert('Error', 'ContributorKey not found: ' + contributorKey, ui.ButtonSet.OK);
    }
  } catch (err) {
    console.error('renameContributorUI_ error:', err);
    SpreadsheetApp.getUi().alert('Error', 'Failed to rename contributor.\n\nError: ' + err.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
```

### Problems with Current Implementation

1. **Terrible UX:** 2 sequential prompts (ContributorKey, then Name)
2. **No Discovery:** User must know exact ContributorKey (e.g., "JOHN_DOE_1709161234567")
3. **No Validation:** ContributorKey is free-text (typos common)
4. **No Preview:** Can't see current name before changing
5. **Outdated UI:** Plain prompts don't match modern HTML form pattern

### Your Goal: Modern HTML Dialog

**Create `RenameContributorForm.html` following the pattern of `AddContributorForm.html`**

**Required Features:**

1. **Contributor Dropdown (Smart Selection):**
   - Fetch existing contributors from Contributors sheet
   - Display as: `"John Doe (JOHN_DOE_1709161234567)"` format
   - Dropdown shows all Active contributors first, then Separated
   - Required field with validation

2. **Current Name Display (Read-Only):**
   - After selecting contributor, show current name in a disabled/read-only field
   - Label: "Current Name"
   - Helps user confirm they selected correct person

3. **New Name Input:**
   - Text input field
   - Required, non-empty validation
   - Placeholder: "Enter new name"

4. **Material Design Styling:**
   - Match `AddContributorForm.html` styling exactly
   - Same color scheme (#1a73e8 primary, #202124 text, etc.)
   - Same button styles (primary blue, secondary white)
   - Same loading spinner and success message pattern

5. **Form Validation:**
   - Contributor selection required
   - New name required and non-empty
   - Client-side validation before submission
   - Inline error messages (red text below fields)

6. **Loading & Success States:**
   - Disable form during submission
   - Show spinner: "Renaming contributor..."
   - Success message: "Contributor renamed successfully! John Doe → Jane Smith"
   - Auto-close after 2 seconds

**Backend Changes Required:**

1. **Create `getContributorsList()` function:**
   ```javascript
   /**
    * Retrieves list of contributors for dropdown population
    * @returns {Array<Object>} Array of {key, name, status, display}
    */
   function getContributorsList() {
     // Fetch from Contributors sheet
     // Return sorted array (Active first, then alphabetical)
     // Format: [{key: "JOHN_DOE_123", name: "John Doe", status: "Active", display: "John Doe (JOHN_DOE_123)"}]
   }
   ```

2. **Create `processRenameContributor(formData)` function:**
   ```javascript
   /**
    * Backend handler for rename form submission
    * @param {Object} formData - {contributorKey, newName}
    * @returns {Object} - {success, contributorKey, oldName, newName}
    */
   function processRenameContributor(formData) {
     // Validate inputs
     // Find contributor in sheet
     // Update Name column (index 1)
     // Return success with old/new names
   }
   ```

3. **Refactor `renameContributorUI_()`:**
   ```javascript
   function renameContributorUI_() {
     // Use HtmlService.createHtmlOutputFromFile('RenameContributorForm')
     // Set width: 450px, height: 500px
     // Show modal dialog
   }
   ```

---

## 🛠️ Implementation Template (Your Starting Point)

### Step 1: Read Existing Files First

```bash
cd /home/user/webapp/slicepie

# Read the Add Contributor form as reference
cat AddContributorForm.html

# Read current renameContributorUI_ function
grep -A50 "^function renameContributorUI_" Code.gs

# Check Contributors schema
grep -A10 "CONTRIBUTORS_SCHEMA" Code.gs

# Verify current git state
git status
git log --oneline -5
```

### Step 2: Create RenameContributorForm.html

**Key Differences from AddContributorForm.html:**
- Add `<select id="contributorKey">` dropdown (populated via `google.script.run.withSuccessHandler(populateDropdown).getContributorsList()`)
- Add `<input type="text" id="currentName" disabled>` read-only field
- Change form title to "Rename Contributor"
- Adjust button text to "Rename Contributor"
- Modify success message to show "John Doe → Jane Smith" format

**JavaScript Changes:**
```javascript
// On page load, fetch contributors
window.onload = function() {
  google.script.run
    .withSuccessHandler(populateDropdown)
    .withFailureHandler(onLoadError)
    .getContributorsList();
};

function populateDropdown(contributors) {
  const select = document.getElementById('contributorKey');
  contributors.forEach(c => {
    const option = document.createElement('option');
    option.value = c.key;
    option.textContent = c.display; // "Name (KEY)"
    option.dataset.currentName = c.name;
    select.appendChild(option);
  });
}

// On contributor selection, update currentName field
document.getElementById('contributorKey').addEventListener('change', function(e) {
  const selectedOption = e.target.selectedOptions[0];
  if (selectedOption && selectedOption.dataset.currentName) {
    document.getElementById('currentName').value = selectedOption.dataset.currentName;
  }
});
```

### Step 3: Update Code.gs

**Location:** After `processNewContributor()` function (around line 3305)

**Add These Functions:**

```javascript
/**
 * Retrieves list of contributors for rename dropdown
 * @returns {Array<Object>} Sorted array of contributor objects
 */
function getContributorsList() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Contributors');
    
    if (!sheet) {
      throw new Error('Contributors sheet not found');
    }
    
    const data = sheet.getDataRange().getValues();
    const contributors = [];
    
    // Skip header row (index 0)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // Schema: [ContributorKey, Name, Email, Role, JoinDate, Status, Notes]
      if (row[0]) { // If ContributorKey exists
        contributors.push({
          key: String(row[0]),
          name: String(row[1] || ''),
          email: String(row[2] || ''),
          role: String(row[3] || ''),
          status: String(row[5] || 'Active'),
          display: `${row[1]} (${row[0]})`
        });
      }
    }
    
    // Sort: Active first, then alphabetical by name
    contributors.sort((a, b) => {
      if (a.status === 'Active' && b.status !== 'Active') return -1;
      if (a.status !== 'Active' && b.status === 'Active') return 1;
      return a.name.localeCompare(b.name);
    });
    
    return contributors;
    
  } catch (err) {
    console.error('getContributorsList error:', err);
    throw new Error('Failed to fetch contributors: ' + err.message);
  }
}

/**
 * Backend handler for rename contributor form submission
 * @param {Object} formData - {contributorKey, newName}
 * @returns {Object} Success result with old/new names
 */
function processRenameContributor(formData) {
  try {
    // Validate input
    if (!formData || typeof formData !== 'object') {
      throw new Error('Invalid form data received');
    }
    
    const contributorKey = String(formData.contributorKey || '').trim();
    const newName = String(formData.newName || '').trim();
    
    if (!contributorKey) {
      throw new Error('ContributorKey is required');
    }
    
    if (!newName) {
      throw new Error('New name is required');
    }
    
    // Get Contributors sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Contributors');
    if (!sheet) {
      throw new Error('Contributors sheet not found. Please run "Initialize System" first.');
    }
    
    // Find contributor and update
    const data = sheet.getDataRange().getValues();
    let oldName = null;
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === contributorKey) {
        oldName = String(data[i][1] || '');
        rowIndex = i + 1; // Sheet rows are 1-indexed
        break;
      }
    }
    
    if (rowIndex === -1) {
      throw new Error(`ContributorKey not found: ${contributorKey}`);
    }
    
    // Update Name column (column 2, index 1 in schema)
    sheet.getRange(rowIndex, 2).setValue(newName);
    
    console.log(`Contributor renamed: ${contributorKey} | ${oldName} → ${newName}`);
    
    return {
      success: true,
      contributorKey: contributorKey,
      oldName: oldName,
      newName: newName
    };
    
  } catch (err) {
    console.error('processRenameContributor error:', err);
    throw new Error('Failed to rename contributor: ' + err.message);
  }
}
```

**Replace `renameContributorUI_()` at line 3252:**

```javascript
/**
 * UI wrapper to rename a contributor (parameterless, safe for menu)
 * Uses modern HTML dialog instead of sequential prompts
 */
function renameContributorUI_() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('RenameContributorForm')
      .setWidth(450)
      .setHeight(500)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);
    
    SpreadsheetApp.getUi().showModalDialog(html, 'Rename Contributor');
  } catch (err) {
    console.error('renameContributorUI_ error:', err);
    SpreadsheetApp.getUi().alert(
      'Error',
      'Failed to open Rename Contributor dialog.\n\nError: ' + err.message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}
```

### Step 4: Testing Checklist

After implementation, verify:

```javascript
// Test 1: Dropdown Population
// - Open dialog
// - Verify dropdown shows contributors in format "Name (KEY)"
// - Verify Active contributors appear first
// - Verify dropdown is sorted alphabetically within each status group

// Test 2: Current Name Display
// - Select a contributor from dropdown
// - Verify "Current Name" field auto-populates with correct name
// - Verify field is disabled/read-only

// Test 3: Successful Rename
// - Select contributor
// - Enter new name
// - Submit
// - Verify success message shows "Old Name → New Name"
// - Verify dialog auto-closes after 2 seconds
// - Verify Contributors sheet shows updated name
// - Verify ContributorKey remains unchanged

// Test 4: Validation - Empty New Name
// - Select contributor
// - Leave new name empty
// - Submit
// - Verify red error message: "New name is required"

// Test 5: Validation - No Contributor Selected
// - Leave dropdown on "Select a contributor..."
// - Enter new name
// - Submit
// - Verify error: "Contributor selection required"

// Test 6: Error Handling - Missing Sheet
// - Delete Contributors sheet
// - Open dialog
// - Verify dropdown fetch shows error: "Contributors sheet not found"

// Test 7: Cancel Button
// - Open dialog
// - Select contributor and enter new name
// - Click Cancel
// - Verify dialog closes, no changes saved

// Test 8: CR Verification
// - Run RUN_ALL_CR_VERIFICATIONS()
// - Verify all 6 tests still pass
```

---

## 📚 Reference Materials

### Key Functions You May Need to Call

```javascript
// Get spreadsheet and sheets
SpreadsheetApp.getActiveSpreadsheet()
ss.getSheetByName('Contributors')

// Read data
sheet.getDataRange().getValues() // Returns 2D array
sheet.getRange(row, col).getValue()

// Write data
sheet.getRange(row, col).setValue(value)
sheet.appendRow([val1, val2, ...])

// HTML Service
HtmlService.createHtmlOutputFromFile('FileName')
  .setWidth(450)
  .setHeight(500)
  .setSandboxMode(HtmlService.SandboxMode.IFRAME)

SpreadsheetApp.getUi().showModalDialog(html, 'Title')

// Error handling
try { ... } catch (err) {
  console.error('functionName error:', err);
  throw new Error('Descriptive message: ' + err.message);
}
```

### CONFIG Object Structure (Reference Only - DO NOT MODIFY)

```javascript
const CONFIG = {
  OWNER_EMAIL: 'owner@example.com',
  FOUNDER_APPROVERS: ['founder1@example.com', 'founder2@example.com'],
  
  CONTRIBUTORS_SCHEMA: [
    { name: 'ContributorKey', type: 'string' },
    { name: 'Name', type: 'string' },
    { name: 'Email', type: 'string' },
    { name: 'Role', type: 'string' },
    { name: 'JoinDate', type: 'date' },
    { name: 'Status', type: 'string' },
    { name: 'Notes', type: 'string' }
  ],
  
  // Other schemas...
};
```

### Material Design Color Palette

```css
/* Primary Colors */
--primary-blue: #1a73e8;
--primary-blue-hover: #1765cc;
--primary-blue-active: #1557b0;

/* Text Colors */
--text-primary: #202124;
--text-secondary: #5f6368;
--text-disabled: #80868b;

/* State Colors */
--error-red: #d93025;
--success-green: #34a853;
--warning-yellow: #f9ab00;

/* Background Colors */
--bg-white: #ffffff;
--bg-light-gray: #f8f9fa;
--border-gray: #dadce0;
```

---

## 🚧 Common Pitfalls & How to Avoid Them

### Pitfall 1: Breaking CR Logic
**Problem:** Accidentally modifying signature generation or audit chain  
**Solution:** Use `grep -n` to find function locations, avoid editing lines 1786-1850, 3124-3150, 3223-3250

### Pitfall 2: Schema Mismatch
**Problem:** Appending wrong number of columns to sheet  
**Solution:** Always reference `CONFIG.*_SCHEMA.length` and map columns by index

### Pitfall 3: Generic Error Messages
**Problem:** `throw new Error('Error occurred')`  
**Solution:** Always include context: `throw new Error('Contributors sheet not found. Please run "Initialize System" first.')`

### Pitfall 4: Not Testing CR Verification
**Problem:** Breaking signatures without realizing  
**Solution:** Run `RUN_ALL_CR_VERIFICATIONS()` after every change

### Pitfall 5: Forgetting Git Workflow
**Problem:** Making changes without committing  
**Solution:** After every file edit: `git add` → `git commit` → `git push`

### Pitfall 6: Menu Handler Parameters
**Problem:** Adding parameters to menu handler functions  
**Solution:** Menu handlers MUST be parameterless. Use UI wrappers that prompt/validate, then call core functions with params.

### Pitfall 7: Direct Sheet Access from HTML
**Problem:** Trying to call `SpreadsheetApp` from HTML file  
**Solution:** Use `google.script.run.withSuccessHandler(callback).serverFunction()` pattern

### Pitfall 8: Not Sanitizing Inputs
**Problem:** Trusting user input directly  
**Solution:** Always `String(input).trim()` and validate in backend

---

## 🎓 Learning from AddContributorForm.html

**Study this file carefully before implementing RenameContributorForm.html:**

Key patterns to replicate:
1. **CSS Structure:** Copy the entire `<style>` block (with minor color adjustments if needed)
2. **Form Layout:** `.form-group` divs with `<label>` + `<input>`/`<select>` + `.error-message`
3. **Button Container:** Two-button layout (Cancel + Primary action)
4. **Loading Indicator:** `.loading` div with `.spinner` animation
5. **Success Message:** `.success-message` div that shows/hides with `.show` class
6. **Form Validation:** `addEventListener('submit')` with validation checks
7. **Google Script Integration:** `google.script.run.withSuccessHandler().withFailureHandler().backendFunction(data)`
8. **Success Flow:** Show success message → `setTimeout(() => google.script.host.close(), 2000)`

**Differences for RenameContributorForm:**
- Add dropdown population on page load
- Add onChange handler for contributor selection
- Show current name in read-only field
- Different form fields (dropdown + current + new vs all new fields)
- Different success message format ("Old → New" instead of listing all fields)

---

## 📊 Success Criteria

Your implementation is complete when:

- ✅ `RenameContributorForm.html` created (300-400 lines expected)
- ✅ `getContributorsList()` function added to Code.gs
- ✅ `processRenameContributor(formData)` function added to Code.gs
- ✅ `renameContributorUI_()` refactored to use HTML dialog
- ✅ All 8 test cases pass (see Step 4 checklist above)
- ✅ Material Design styling matches `AddContributorForm.html`
- ✅ Dropdown shows contributors sorted (Active first, then alphabetical)
- ✅ Current name auto-populates when contributor selected
- ✅ Success message shows "OldName → NewName" format
- ✅ Dialog auto-closes after 2 seconds on success
- ✅ Error messages are actionable and descriptive
- ✅ `RUN_ALL_CR_VERIFICATIONS()` returns 6/6 PASS
- ✅ Changes committed with descriptive message
- ✅ Changes pushed to `feature/pr1-menu-consolidation` branch
- ✅ PR link provided to user

---

## 🤖 Your First Commands

When you take over, execute these commands first:

```bash
# 1. Navigate to project directory
cd /home/user/webapp/slicepie

# 2. Check current state
git status
git log --oneline -3

# 3. Verify you're on correct branch
git branch --show-current  # Should show: feature/pr1-menu-consolidation

# 4. Read reference implementation
cat AddContributorForm.html | head -50

# 5. Find function to replace
grep -n "^function renameContributorUI_" Code.gs

# 6. Read current implementation
sed -n '3252,3298p' Code.gs

# 7. Check Contributors schema
grep -A10 "CONTRIBUTORS_SCHEMA" Code.gs

# 8. Count current lines
wc -l Code.gs AddContributorForm.html
```

---

## 🆘 When You Need Help

### If Tests Fail:
- Check `RUN_ALL_CR_VERIFICATIONS()` output for specific failure
- Verify you didn't modify lines 1786-1850, 3124-3150, 3223-3250
- Check console logs: `console.error()` statements in catch blocks

### If Schema Issues:
- Count columns: `CONFIG.CONTRIBUTORS_SCHEMA.length` should be 7
- Verify array order: `[ContributorKey, Name, Email, Role, JoinDate, Status, Notes]`
- Check getValues() returns match expected schema

### If HTML Dialog Won't Open:
- Verify file name matches: `HtmlService.createHtmlOutputFromFile('RenameContributorForm')`
- Check HTML file has no syntax errors (unclosed tags, missing quotes)
- Verify `google.script.run` calls use correct function names

### If Dropdown Won't Populate:
- Check `getContributorsList()` returns array of objects
- Verify sheet name is exactly 'Contributors' (case-sensitive)
- Console.log the returned data in `populateDropdown()` function

---

## 📞 Handoff Summary

**You are inheriting:**
- ✅ Working repository on branch `feature/pr1-menu-consolidation`
- ✅ Recent commit `b30cd85` with modern Add Contributor form
- ✅ Pattern established for HTML dialogs with Material Design
- ✅ Backend handler pattern for form processing
- ✅ All CR verification tests passing (6/6)

**Your task:**
- 🎯 Modernize `renameContributorUI_()` following the same pattern
- 🎯 Create `RenameContributorForm.html` with smart contributor dropdown
- 🎯 Add `getContributorsList()` and `processRenameContributor()` backend functions
- 🎯 Maintain all tests passing and commit/push when done

**Expected time:** 2-3 hours (1 hour coding, 1 hour testing, 1 hour documentation)

**Output deliverable:**
1. `RenameContributorForm.html` file
2. Updated `Code.gs` with 3 modified/new functions
3. Git commit message following established pattern
4. Testing summary confirming all test cases pass
5. PR link ready for review

---

## 🎬 You're Ready to Start!

Follow the implementation template in Step 1-4 above. Study `AddContributorForm.html` carefully as your reference. Maintain the same code quality, styling consistency, and error handling patterns.

Remember: **Minimal changes only. Preserve CR logic. Test thoroughly. Commit immediately.**

Good luck! 🚀
