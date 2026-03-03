# 🤖 COPY-PASTE AI PROMPT (Ready to Use)

**Copy everything below this line and paste into your next AI assistant:**

---

You are a Staff-Level Google Apps Script Developer working on the "Slicing Pie" equity allocation system. 

**CONTEXT:**
- Repository: https://github.com/quadriconsulting/slicepie
- Branch: feature/pr1-menu-consolidation (NOT main)
- Local directory: /home/user/webapp/slicepie
- Latest commit: b30cd85
- Main file: Code.gs (4,594 lines)

**YOUR TASK:**
Modernize the `renameContributorUI_()` function (currently at line 3252 in Code.gs) by replacing sequential ui.prompt() calls with a professional HTML dialog, following the exact pattern of the recently created `AddContributorForm.html` (365 lines).

**WHAT TO DELIVER:**
1. New file: `RenameContributorForm.html` (~350 lines)
2. Update Code.gs with 3 functions:
   - `getContributorsList()` - Fetch contributors for dropdown (NEW)
   - `processRenameContributor(formData)` - Backend handler (NEW)
   - `renameContributorUI_()` - Refactor to use HTML dialog (MODIFY)

**KEY REQUIREMENTS:**
- Material Design styling matching AddContributorForm.html exactly
- Contributor dropdown (populated from Contributors sheet, sorted Active-first)
- Current name display (read-only field that auto-populates on selection)
- New name input (text field, required validation)
- Loading state with spinner
- Success message format: "John Doe → Jane Smith"
- Auto-close after 2 seconds
- All error messages must be actionable (tell user what to do)

**CRITICAL CONSTRAINTS (NON-NEGOTIABLE):**
- DO NOT modify lines 1786-1850, 3124-3150, 3223-3250 (CR-01/02/03 signature logic)
- Contributors schema has 7 columns: [ContributorKey, Name, Email, Role, JoinDate, Status, Notes]
- Update only Name column (column 2, array index 1)
- ContributorKey must NEVER change
- All menu handlers must be parameterless
- After changes, RUN_ALL_CR_VERIFICATIONS() must still pass (6/6 tests)

**STARTING COMMANDS:**
```bash
cd /home/user/webapp/slicepie
git status
cat AddContributorForm.html  # Study this as your reference
grep -n "^function renameContributorUI_" Code.gs  # Find function to replace
```

**REFERENCE FILE TO STUDY:**
Read `/home/user/webapp/slicepie/AddContributorForm.html` carefully. Your RenameContributorForm.html should follow the same structure with these changes:
- Add dropdown populated via `google.script.run.withSuccessHandler(populateDropdown).getContributorsList()`
- Add onChange event to show current name when contributor selected
- Remove Role/Status fields (not needed for rename)
- Change button text to "Rename Contributor"

**GIT WORKFLOW (MANDATORY AFTER CODING):**
```bash
git add RenameContributorForm.html Code.gs
git commit -m "feat(pr1): Modernize Rename Contributor with HTML dialog

- Created RenameContributorForm.html with Material Design
- Added getContributorsList() to fetch contributors for dropdown
- Added processRenameContributor() backend handler
- Refactored renameContributorUI_() to use HTML dialog
- Dropdown shows Active contributors first, sorted alphabetically
- Current name auto-displays on selection
- Success message shows old → new name transformation

Testing:
- All validation works (empty fields, missing selection)
- Successful rename updates Name column only
- ContributorKey remains unchanged
- Dialog auto-closes after success
- RUN_ALL_CR_VERIFICATIONS() passes 6/6"

git push origin feature/pr1-menu-consolidation
```

**TESTING CHECKLIST (verify all before completing):**
- [ ] Open dialog shows dropdown with contributors (Active first)
- [ ] Select contributor → current name appears in read-only field
- [ ] Enter new name → submit → success message shows "Old → New"
- [ ] Dialog auto-closes after 2 seconds
- [ ] Contributors sheet shows updated Name in column B
- [ ] ContributorKey in column A remains unchanged
- [ ] Empty new name shows validation error
- [ ] Cancel button closes dialog without saving
- [ ] Run `RUN_ALL_CR_VERIFICATIONS()` in Apps Script → 6/6 PASS

**COLOR SCHEME (match exactly):**
- Primary: #1a73e8
- Text: #202124
- Secondary text: #5f6368
- Error: #d93025
- Success: #34a853

**COMPREHENSIVE GUIDE AVAILABLE:**
Read `/home/user/webapp/slicepie/AI_HANDOFF_PROMPT.md` for full details (29KB, very comprehensive).
Read `/home/user/webapp/slicepie/QUICK_REFERENCE.md` for quick patterns (6KB, cheat sheet).

**SUCCESS CRITERIA:**
When done, you should have:
- RenameContributorForm.html created (~350 lines)
- Code.gs updated with 3 functions (~120 new lines)
- All 8 test cases passing
- Git committed with descriptive message
- Git pushed to feature/pr1-menu-consolidation branch
- PR link provided: https://github.com/quadriconsulting/slicepie/compare/main...feature/pr1-menu-consolidation

**START BY READING:**
1. `cat AddContributorForm.html` (your reference implementation)
2. `sed -n '3252,3298p' Code.gs` (current function to replace)
3. `grep -A10 "CONTRIBUTORS_SCHEMA" Code.gs` (schema to work with)

Begin implementation now. Follow the AddContributorForm.html pattern exactly. Focus on dropdown population, current name display, and form validation. Good luck! 🚀

---

**END OF COPY-PASTE PROMPT**
