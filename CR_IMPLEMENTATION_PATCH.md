# PHASE B: PATCH (UNIFIED DIFF)

## Summary of Changes

**Target File**: `code_gbp_quorum_FIXED2.gs`  
**Original Lines**: 3541  
**Modified Lines**: 3630  
**Net Change**: +89 lines

---

## Unified Diff

### Change 1: CR-01 - Add reservation, re-fetch, and MASTER_WRITTEN skip logic to approveContribution

**Location**: Lines 1777-1780 (after quorum check)  
**Changes**: +76 lines

```diff
@@ -1772,6 +1778,82 @@ function approveContribution(...) {
     pendingSheet.getRange(rowNum, colMap.Approvers + 1).setValue(normalizedApprovers);
     const approvers = mergedApprovers;
 
+    // ========================================================================
+    // CR-01: RESERVE DECISION AND CHECK FOR CONCURRENT MASTER_WRITTEN
+    // ========================================================================
+    
+    // CR-01: Step 1 - Reserve decision first
+    const reserveResult = reserveDecision_(requestId, rowNum, 'APPROVE', actor);
+    Logger.log(`[approveContribution] Decision reserved: ${requestId}, state=${reserveResult.state}`);
+    
+    // CR-01: Step 2 - Re-fetch canonical decision to detect concurrent writes
+    const canonicalDecision = getDecisionByRequestId_(requestId);
+    if (!canonicalDecision) {
+      throw new Error(`Decision not found after reservation: ${requestId}`);
+    }
+    
+    // CR-01: Step 3 - If already MASTER_WRITTEN, validate pointers and skip
+    if (canonicalDecision.state === 'MASTER_WRITTEN') {
+      Logger.log(`[approveContribution] Detected MASTER_WRITTEN state, validating pointers...`);
+      
+      // CR-03: Validate master pointers before skipping
+      const validation = validateMasterPointers_(
+        canonicalDecision.masterRowNum,
+        canonicalDecision.masterRowSignature
+      );
+      
+      if (!validation.isValid) {
+        // CR-03: Invalid pointers - mark FAILED, reset, and retry
+        Logger.log(`[approveContribution] Pointer validation failed: ${validation.reason}`);
+        
+        pendingSheet.getRange(rowNum, colMap.State + 1).setValue('FAILED');
+        pendingSheet.getRange(rowNum, colMap.Notes + 1).setValue(`Master pointer validation failed: ${validation.reason}`);
+        
+        logAuditEvent_('MASTER_POINTER_VALIDATION_FAILED', actor, {
+          requestId: requestId,
+          pendingRow: rowNum,
+          reason: validation.reason,
+          masterRowNum: canonicalDecision.masterRowNum,
+          masterRowSignature: canonicalDecision.masterRowSignature
+        });
+        
+        // CR-03: Reset state to PENDING and clear master pointers for retry
+        pendingSheet.getRange(rowNum, colMap.State + 1).setValue('PENDING');
+        pendingSheet.getRange(rowNum, colMap.MasterRowNum + 1).setValue('');
+        pendingSheet.getRange(rowNum, colMap.MasterRowSignature + 1).setValue('');
+        
+        logAuditEvent_('RETRY_APPROVAL_AFTER_VALIDATION_FAILURE', actor, {
+          requestId: requestId,
+          pendingRow: rowNum
+        });
+        
+        Logger.log(`[approveContribution] State reset to PENDING, proceeding with retry (master write)...`);
+        // Fall through to normal master write flow below
+      } else {
+        // CR-01: Valid pointers - skip master write and return existing data
+        Logger.log(`[approveContribution] Pointers valid, skipping master write`);
+        
+        logAuditEvent_('MASTER_WRITE_SKIPPED_ALREADY_WRITTEN', actor, {
+          requestId: requestId,
+          pendingRow: rowNum,
+          masterRowNum: canonicalDecision.masterRowNum,
+          masterRowSignature: canonicalDecision.masterRowSignature
+        });
+        
+        return {
+          success: true,
+          skipped: true,
+          contributorKey: contributorKey,
+          slicesAwarded: slicesAwarded,
+          masterRowNum: canonicalDecision.masterRowNum,
+          masterRowSignature: canonicalDecision.masterRowSignature
+        };
+      }
+    }
+    
+    // ========================================================================
+    // NORMAL MASTER WRITE FLOW (if not skipped above)
+    // ========================================================================
     
     // Compute decision signature
```

---

### Change 2: CR-01 - Mark MASTER_WRITTEN after successful master write

**Location**: Lines 1810-1822 (after applyEquityDelta_)  
**Changes**: +5 lines

```diff
@@ -1814,6 +1896,11 @@ function approveContribution(...) {
       notes
     );
     
+    // CR-01: Mark decision as MASTER_WRITTEN with pointers
+    pendingSheet.getRange(rowNum, colMap.State + 1).setValue('MASTER_WRITTEN');
+    pendingSheet.getRange(rowNum, colMap.MasterRowNum + 1).setValue(result.masterRowNum);
+    pendingSheet.getRange(rowNum, colMap.MasterRowSignature + 1).setValue(result.signature);
+    
     logAuditEvent_('CONTRIBUTION_APPROVED', actor, {
       pendingRow: rowNum,
       requestId: requestId,
```

---

### Change 3: CR-02 - Fix timestamp check and clear Notes field in reserveDecision_

**Location**: Lines 3036-3060 in reserveDecision_  
**Changes**: 3 lines modified

```diff
@@ -3036,14 +3118,17 @@ function reserveDecision_(...) {
   }
   
-  // CR-02: Check for invalid timestamp (handle gracefully)
-  const existingTimestamp = rowData[colMap.ReservedTimestamp];
-  if (existingTimestamp && !(existingTimestamp instanceof Date) && isNaN(new Date(existingTimestamp).getTime())) {
+  // CR-02: Check for invalid timestamp (handle gracefully)
+  // Must check Pending.Timestamp (submission timestamp), not ReservedTimestamp
+  const submissionTimestamp = rowData[colMap.Timestamp]; // Column 1
+  if (submissionTimestamp && !(submissionTimestamp instanceof Date) && isNaN(new Date(submissionTimestamp).getTime())) {
     // CR-02: Produce clean RESERVED record (not FAILED)
     const cleanTimestamp = new Date();
     pendingSheet.getRange(pendingRow, colMap.State + 1).setValue('RESERVED');
     pendingSheet.getRange(pendingRow, colMap.ReservedActor + 1).setValue(actor);
     pendingSheet.getRange(pendingRow, colMap.ReservedTimestamp + 1).setValue(cleanTimestamp);
+    // CR-02: Clear error fields (Notes)
+    pendingSheet.getRange(pendingRow, colMap.Notes + 1).setValue('');
     
     logAuditEvent_('DECISION_RESERVED_INVALID_TIMESTAMP_CLEANED', actor, {
       requestId: requestId,
       pendingRow: pendingRow,
       decision: decision,
-      invalidTimestamp: String(existingTimestamp)
+      invalidTimestamp: String(submissionTimestamp)
     });
```

---

### Change 4: CR-02 - Update verification test to check Notes clearing

**Location**: Lines 3412-3456 in VERIFY_CR02_InvalidTimestampReserved  
**Changes**: 5 lines modified

```diff
@@ -3412,19 +3495,22 @@ function VERIFY_CR02_InvalidTimestampReserved() {
 /**
- * VERIFY_CR02_InvalidTimestampReserved: Test invalid timestamp produces RESERVED, not FAILED.
+ * VERIFY_CR02_InvalidTimestampReserved: Test invalid timestamp produces RESERVED, not FAILED.
+ * CR-02: Must check Pending.Timestamp (column 1), clear Notes field, set RESERVED state.
  */
 function VERIFY_CR02_InvalidTimestampReserved() {
   Logger.log('=== VERIFY_CR02_InvalidTimestampReserved START ===');
   
   try {
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const pendingSheet = ss.getSheetByName('Pending');
     
-    // Setup: Create test row with invalid timestamp in ReservedTimestamp column
+    // Setup: Create test row with invalid timestamp in Pending.Timestamp (column 1)
+    // and error message in Notes field (column 10)
     const testRequestId = 'TEST_' + Utilities.getUuid();
     const testRow = [
-      new Date(), 'test@example.com', 'Test User', 'TIME', 2, 1000, 10, 20000,
-      'http://example.com', 'Test notes', 'PENDING', '', '', '', testRequestId,
-      'PENDING', null, '', '', 'INVALID_TIMESTAMP_STRING'
+      'INVALID_DATE_STRING', 'test@example.com', 'Test User', 'TIME', 2, 1000, 10, 20000,
+      'http://example.com', 'Previous error message', 'PENDING', '', '', '', testRequestId,
+      '', null, '', '', ''
     ];
     
     pendingSheet.appendRow(testRow);
@@ -3436,14 +3522,16 @@ function VERIFY_CR02_InvalidTimestampReserved() {
     // Verify: State should be RESERVED, not FAILED
     const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
     const finalState = pendingSheet.getRange(testRowNum, colMap.State + 1).getValue();
+    const finalNotes = pendingSheet.getRange(testRowNum, colMap.Notes + 1).getValue();
     
     const pass1 = reservation.state === 'RESERVED';
     const pass2 = String(finalState).trim().toUpperCase() === 'RESERVED';
     const pass3 = reservation.timestamp instanceof Date;
+    const pass4 = String(finalNotes).trim() === ''; // CR-02: Notes must be cleared
     
     // Cleanup
     pendingSheet.deleteRow(testRowNum);
     
-    const result = pass1 && pass2 && pass3;
+    const result = pass1 && pass2 && pass3 && pass4;
     Logger.log(`VERIFY_CR02_InvalidTimestampReserved: ${result ? 'PASS' : 'FAIL'}`);
     Logger.log(`  - reserveDecision_ returns RESERVED: ${pass1}`);
     Logger.log(`  - Sheet State is RESERVED: ${pass2}`);
     Logger.log(`  - Timestamp is valid Date: ${pass3}`);
+    Logger.log(`  - Notes field cleared: ${pass4}`);
     
     return result;
```

---

## Summary of Modifications

### Functions Modified
1. **approveContribution** (lines 1667-1858):
   - Added CR-01 reservation and re-fetch logic (+76 lines)
   - Added CR-03 pointer validation with retry (+in above)
   - Added MASTER_WRITTEN state marking (+5 lines)

2. **reserveDecision_** (lines 3008-3082):
   - Fixed CR-02 timestamp check to use Pending.Timestamp instead of ReservedTimestamp (1 line)
   - Added CR-02 Notes field clearing (1 line)
   - Updated audit event to log correct timestamp (1 line)

3. **VERIFY_CR02_InvalidTimestampReserved** (lines 3412-3464):
   - Updated test to use invalid Pending.Timestamp (+2 lines)
   - Added Notes field verification (+5 lines)

### No New Functions Added
All required helper functions already existed:
- `reserveDecision_()` - Line 3008
- `getDecisionByRequestId_()` - Line 3090
- `validateMasterPointers_()` - Line 3132

---

## Change Statistics

**Total Changes**: 89 lines
- CR-01: +81 lines (reservation + skip + MASTER_WRITTEN marking)
- CR-02: +3 lines (fix timestamp check + clear Notes)
- CR-03: +0 lines (integrated with CR-01)
- Verification updates: +5 lines

**Complexity**: Minimal
- No refactoring
- No renaming
- No unrelated changes
- All changes directly implement CR-IDs

---

**END OF PATCH**
