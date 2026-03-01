# Quick Reference Card - Slicing Pie PR-1 Modernization

## 🎯 Current Task
**Modernize `renameContributorUI_()` with HTML dialog (following AddContributorForm.html pattern)**

---

## 📍 Key Locations

```
Repository: https://github.com/quadriconsulting/slicepie
Branch: feature/pr1-menu-consolidation
Latest Commit: b30cd85
Local Path: /home/user/webapp/slicepie

Files:
├── Code.gs (4,594 lines)
├── AddContributorForm.html (365 lines) ← REFERENCE
└── RenameContributorForm.html (TO CREATE)

Functions to Modify/Create:
├── renameContributorUI_() - Line 3252 (REFACTOR)
├── getContributorsList() - NEW
└── processRenameContributor() - NEW
```

---

## 🚨 DO NOT TOUCH (Critical Lines)

```
CR-01: Lines 1786-1850 (signature generation)
CR-02: Lines 3124-3150 (audit chain)
CR-03: Lines 3223-3250 (state machine)
Integration: Lines 1807-1840
```

---

## 📋 Schemas (Read-Only Reference)

```javascript
CONTRIBUTORS_SCHEMA: [
  ContributorKey,  // Column 0 (A)
  Name,            // Column 1 (B) ← UPDATE THIS
  Email,           // Column 2 (C)
  Role,            // Column 3 (D)
  JoinDate,        // Column 4 (E)
  Status,          // Column 5 (F)
  Notes            // Column 6 (G)
]
```

---

## 🎨 Material Design Colors

```css
Primary: #1a73e8
Primary Hover: #1765cc
Text Primary: #202124
Text Secondary: #5f6368
Error: #d93025
Success: #34a853
Border: #dadce0
```

---

## 📝 Implementation Checklist

### Phase 1: HTML Form (RenameContributorForm.html)
- [ ] Copy AddContributorForm.html as starting point
- [ ] Change title to "Rename Contributor"
- [ ] Replace form fields:
  - [ ] Contributor dropdown (populated from backend)
  - [ ] Current Name (read-only display)
  - [ ] New Name (text input, required)
- [ ] Add `window.onload` to fetch contributors
- [ ] Add dropdown `onChange` to update current name
- [ ] Update submit handler to call `processRenameContributor()`
- [ ] Modify success message: "OldName → NewName"

### Phase 2: Backend Functions (Code.gs)
- [ ] Create `getContributorsList()` after line 3304
  - Fetch Contributors sheet
  - Return array: `[{key, name, status, display}]`
  - Sort: Active first, then alphabetical
- [ ] Create `processRenameContributor(formData)` 
  - Validate contributorKey and newName
  - Find row in Contributors sheet
  - Update Name column (column 2, index 1)
  - Return {success, contributorKey, oldName, newName}
- [ ] Refactor `renameContributorUI_()` at line 3252
  - Use `HtmlService.createHtmlOutputFromFile('RenameContributorForm')`
  - Set width: 450, height: 500
  - Show modal dialog

### Phase 3: Testing
- [ ] Dropdown shows contributors (Active first)
- [ ] Current name auto-populates on selection
- [ ] Successful rename updates sheet
- [ ] ContributorKey stays unchanged
- [ ] Validation prevents empty new name
- [ ] Cancel button closes without saving
- [ ] Success message shows "Old → New"
- [ ] Dialog auto-closes after 2 seconds
- [ ] `RUN_ALL_CR_VERIFICATIONS()` passes 6/6

### Phase 4: Git Workflow
- [ ] `git add RenameContributorForm.html Code.gs`
- [ ] `git commit -m "feat(pr1): Modernize Rename Contributor with HTML dialog"`
- [ ] `git fetch origin main`
- [ ] `git rebase origin/main` (if needed)
- [ ] `git push origin feature/pr1-menu-consolidation`
- [ ] Provide PR link to user

---

## 💡 Quick Commands

```bash
# Navigate
cd /home/user/webapp/slicepie

# Check state
git status && git log --oneline -3

# Read reference
cat AddContributorForm.html | grep -A5 "function onSuccess"

# Find function
grep -n "renameContributorUI_" Code.gs

# Test verification
# (In Apps Script editor) Run: RUN_ALL_CR_VERIFICATIONS()

# Commit workflow
git add . && git commit -m "feat(pr1): ..." && git push origin feature/pr1-menu-consolidation
```

---

## 🔧 Common Patterns

### Backend Function Template
```javascript
function processRenameContributor(formData) {
  try {
    // 1. Validate input
    if (!formData) throw new Error('Invalid form data');
    const key = String(formData.contributorKey || '').trim();
    
    // 2. Get sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Contributors');
    if (!sheet) throw new Error('Contributors sheet not found. Please run "Initialize System"');
    
    // 3. Process data
    const data = sheet.getDataRange().getValues();
    // ... find and update
    
    // 4. Return success
    return { success: true, ... };
    
  } catch (err) {
    console.error('processRenameContributor error:', err);
    throw new Error('Failed to rename: ' + err.message);
  }
}
```

### HTML Form Submit Template
```javascript
document.getElementById('form').addEventListener('submit', function(e) {
  e.preventDefault();
  
  // Validate
  const contributorKey = document.getElementById('contributorKey').value;
  if (!contributorKey) { /* show error */ return; }
  
  // Disable & show loading
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('loading').classList.add('show');
  
  // Submit
  google.script.run
    .withSuccessHandler(onSuccess)
    .withFailureHandler(onError)
    .processRenameContributor({ contributorKey, newName });
});
```

---

## 📊 Expected File Sizes

```
RenameContributorForm.html: ~350 lines
Code.gs additions: ~120 lines (3 functions)
Total impact: ~470 lines added
```

---

## ✅ Success = All Green

- ✅ HTML dialog opens with populated dropdown
- ✅ Current name shows when contributor selected
- ✅ Rename updates Name column correctly
- ✅ ContributorKey never changes
- ✅ Material Design matches AddContributorForm
- ✅ All validation works (empty fields, errors)
- ✅ Success message auto-closes
- ✅ RUN_ALL_CR_VERIFICATIONS() = 6/6 PASS
- ✅ Git committed & pushed
- ✅ PR link provided

---

## 🆘 Emergency Contacts

**If stuck:** Read AI_HANDOFF_PROMPT.md (comprehensive guide)  
**If tests fail:** Check lines 1786-1850, 3124-3150, 3223-3250 untouched  
**If schema errors:** Verify 7 columns in CONTRIBUTORS_SCHEMA  
**If dropdown empty:** Debug getContributorsList() return value

---

**You got this! Follow AddContributorForm.html pattern. 🚀**
