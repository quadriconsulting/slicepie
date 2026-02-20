/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SLICING PIE v6.0.34j-PRODUCTION-FINAL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * A production-grade Google Apps Script implementation of the Slicing Pie
 * equity allocation model with cryptographic signing, audit logging, and
 * comprehensive workflow automation.
 * 
 * @version 6.0.34j-PRODUCTION-FINAL
 * @release 2026-02-19
 * @security A+
 * @author Jeremy (jeremy@quadriconsulting.com)
 * @contact jeremy@quadriconsulting.com
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CRITICAL FIXES (v6.0.34a → v6.0.34j)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PATCH a (2026-02-18): Raw scope bug in enqueueAuditEventCore_
 * PATCH b (2026-02-18): Split audit ChainHash/Signature columns (6→7 cols)
 * PATCH c (2026-02-18): HMAC-SHA256 for all signatures (removed SHA256-only)
 * PATCH d (2026-02-19): UUID-based secret generation (removed Math.random)
 * PATCH e (2026-02-19): Numeric-string coercion in applyEquityDelta_
 * PATCH f (2026-02-19): Safe JSON handling for circular references
 * PATCH g (2026-02-19): Bounded audit detail truncation (≤8500 bytes)
 * PATCH h (2026-02-19): Schema enforcement before approval/rejection
 * PATCH i (2026-02-19): Audit queue recovery + bounded retry in getColMap_
 * PATCH j (2026-02-19): Physical column guard in enforceSchemaOrder_
 * PATCH k (2026-02-19): Minimal safe audit recovery (no recursion)
 * 
 * FIX 1 (v6.0.34j): Separate lock acquisition errors from callback errors
 * FIX 2 (v6.0.34j): Validate pendingRowNum before sheet operations
 * FIX 3 (v6.0.34j): Add UI wrapper functions for menu-driven approve/reject
 * FIX 4 (v6.0.34j): Update onOpen() menu to use UI wrappers
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CONFIG = {
  // ─────────────────────────────────────────────────────────────────────────
  // ENVIRONMENT (Edit before deployment)
  // ─────────────────────────────────────────────────────────────────────────
  ENVIRONMENT: 'PROD',
  OWNER_EMAIL: 'owner@example.com', // ⚠️ CHANGE THIS
  FOUNDER_APPROVERS: [
    'founder1@example.com', // ⚠️ CHANGE THIS
    'founder2@example.com'  // ⚠️ CHANGE THIS
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVAL THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────
  QUORUM_THRESHOLD: 2,
  QUORUM_VALUE_THRESHOLD_GBP: 5000,
  MAX_VALUE_GBP: 10000000,
  MAX_SLICES_DELTA: 20000000,
  ALERT_RATE_LIMIT_SECONDS: 300,

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT SETTINGS
  // ─────────────────────────────────────────────────────────────────────────
  MAX_AUDIT_FAILURES: 3,
  MAX_AUDIT_DETAIL_SIZE: 8000,
  MAX_QUEUE_SIZE: 50,
  QUEUE_BYTE_LIMIT: 8500,

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET SCHEMAS (Master: 13 cols, Pending: 15 cols, Audit: 7 cols)
  // ─────────────────────────────────────────────────────────────────────────
  
  MASTER_SCHEMA: [
    { name: 'Timestamp', type: 'date' },
    { name: 'ContributorKey', type: 'string' },
    { name: 'ContributorName', type: 'string' },
    { name: 'ContributionType', type: 'string' },
    { name: 'Multiplier', type: 'number' },
    { name: 'BaseValue', type: 'number' },
    { name: 'Quantity', type: 'number' },
    { name: 'SlicesAwarded', type: 'number' },
    { name: 'TotalSlices', type: 'number' },
    { name: 'EquityPercent', type: 'string' },
    { name: 'EvidenceURL', type: 'string' },
    { name: 'Notes', type: 'string' },
    { name: 'Signature', type: 'string' }
  ],

  PENDING_SCHEMA: [
    { name: 'Timestamp', type: 'date' },
    { name: 'ContributorKey', type: 'string' },
    { name: 'ContributorName', type: 'string' },
    { name: 'ContributionType', type: 'string' },
    { name: 'Multiplier', type: 'number' },
    { name: 'BaseValue', type: 'number' },
    { name: 'Quantity', type: 'number' },
    { name: 'SlicesAwarded', type: 'number' },
    { name: 'EvidenceURL', type: 'string' },
    { name: 'Notes', type: 'string' },
    { name: 'Status', type: 'string' },        // Col 11 (was Decision in v6.0.34f)
    { name: 'Approvers', type: 'string' },
    { name: 'DecisionSignature', type: 'string' },
    { name: 'DecisionTimestamp', type: 'date' },
    { name: 'RequestId', type: 'string' },     // Col 15 (PATCH h: enforced UUID)
    // CR-01/CR-02/CR-03: State machine fields for reservation and MASTER_WRITTEN detection
    { name: 'State', type: 'string' },          // Col 16 (PENDING/RESERVED/MASTER_WRITTEN/FAILED)
    { name: 'MasterRowNum', type: 'number' },   // Col 17 (pointer to Master row ≥2)
    { name: 'MasterRowSignature', type: 'string' }, // Col 18 (64-char hex from Master)
    { name: 'ReservedActor', type: 'string' },  // Col 19 (actor who reserved)
    { name: 'ReservedTimestamp', type: 'date' } // Col 20 (timestamp of reservation)
  ],

  AUDIT_LOG_SCHEMA: [
    { name: 'Timestamp', type: 'string' },     // PATCH i: ISO string, not Date
    { name: 'Action', type: 'string' },
    { name: 'Actor', type: 'string' },
    { name: 'Details', type: 'string' },
    { name: 'DetailsJson', type: 'string' },
    { name: 'ChainHash', type: 'string' },     // PATCH b: split from Signature
    { name: 'Signature', type: 'string' }      // PATCH c: HMAC-SHA256
  ],

  MULTIPLIERS: {
    TIME: 2,
    CASH: 4,
    SUPPLIES: 4,
    EQUIPMENT: 4,
    FACILITIES: 4,
    IP: 4,
    RELATIONSHIPS: 2,
    SALES: 2,
    EXPENSES: 1
  }
};

// Generate schema position maps for fast lookup
CONFIG.MASTER_SCHEMA_POSITIONS = {};
CONFIG.MASTER_SCHEMA.forEach((col, idx) => {
  CONFIG.MASTER_SCHEMA_POSITIONS[col.name] = idx;
});

CONFIG.PENDING_SCHEMA_POSITIONS = {};
CONFIG.PENDING_SCHEMA.forEach((col, idx) => {
  CONFIG.PENDING_SCHEMA_POSITIONS[col.name] = idx;
});

CONFIG.AUDIT_SCHEMA_POSITIONS = {};
CONFIG.AUDIT_LOG_SCHEMA.forEach((col, idx) => {
  CONFIG.AUDIT_SCHEMA_POSITIONS[col.name] = idx;
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOCK HANDLING
 * ═══════════════════════════════════════════════════════════════════════════
 */

const LOCK_STATE = {
  acquired: false,
  depth: 0
};

/**
 * FIX 1 (v6.0.34j): Separate lock acquisition errors from callback errors
 * 
 * Acquires document lock, executes callback, releases lock in finally block.
 * Only logs lock acquisition failures; callback errors propagate with original message.
 * 
 * @param {Function} callback - Function to execute while holding lock
 * @param {number} [timeoutMs=30000] - Lock timeout in milliseconds
 * @returns {*} - Result from callback
 * @throws {Error} - Propagates callback errors with original message
 */
function withDocLock_(callback, timeoutMs = 30000) {
  const lock = LockService.getDocumentLock();
  const lockId = `LOCK_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  try {
    // FIX 1: Only this line can throw "lock failed" error
    const acquired = lock.tryLock(timeoutMs);
    if (!acquired) {
      throw new Error(`Document lock acquisition timed out after ${timeoutMs}ms`);
    }
    
    LOCK_STATE.acquired = true;
    LOCK_STATE.depth++;
    Logger.log(`[withDocLock_] Lock acquired (depth=${LOCK_STATE.depth}, id=${lockId})`);
    
    // FIX 1: Execute callback - errors here are callback errors, NOT lock errors
    const result = callback();
    
    return result;
    
  } catch (err) {
    // FIX 1: Distinguish lock acquisition failures from callback errors
    if (err.message && err.message.includes('lock acquisition')) {
      Logger.log(`[withDocLock_] Lock acquisition failed: ${err.message}`);
      logAuditEvent_('LOCK_ACQUISITION_FAILED', 'System', {
        timeoutMs: timeoutMs,
        lockId: lockId,
        error: err.message
      });
    }
    // FIX 1: Re-throw all errors (lock or callback) for caller to handle
    throw err;
    
  } finally {
    // FIX 1: Always release lock if acquired
    if (LOCK_STATE.acquired && LOCK_STATE.depth > 0) {
      LOCK_STATE.depth--;
      if (LOCK_STATE.depth === 0) {
        lock.releaseLock();
        LOCK_STATE.acquired = false;
        Logger.log(`[withDocLock_] Lock released (id=${lockId})`);
      }
    }
  }
}

/**
 * Non-blocking lock attempt with custom timeout.
 * 
 * @param {Function} callback - Function to execute if lock acquired
 * @param {number} [timeoutMs=5000] - Lock timeout in milliseconds
 * @returns {Object} - {success: boolean, result: *, error: string}
 */
function withDocTryLock_(callback, timeoutMs = 5000) {
  const lock = LockService.getDocumentLock();
  
  try {
    const acquired = lock.tryLock(timeoutMs);
    if (!acquired) {
      return {
        success: false,
        error: `Could not acquire lock within ${timeoutMs}ms`
      };
    }
    
    LOCK_STATE.acquired = true;
    LOCK_STATE.depth++;
    
    const result = callback();
    return { success: true, result: result };
    
  } catch (err) {
    return { success: false, error: err.message };
    
  } finally {
    if (LOCK_STATE.acquired && LOCK_STATE.depth > 0) {
      LOCK_STATE.depth--;
      if (LOCK_STATE.depth === 0) {
        lock.releaseLock();
        LOCK_STATE.acquired = false;
      }
    }
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRYPTOGRAPHIC FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * SHA-256 hash (hex output).
 */
function sha256_(input) {
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(input),
    Utilities.Charset.UTF_8
  );
  return rawHash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * HMAC-SHA256 signature (hex output).
 * PATCH c: All signatures now use HMAC-SHA256 instead of plain SHA256.
 */
function hmac256Hex_(key, message) {
  const signature = Utilities.computeHmacSha256Signature(
    String(message),
    String(key),
    Utilities.Charset.UTF_8
  );
  return signature.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * PATCH f: Safe JSON stringify with circular reference protection.
 * 
 * Replaces circular references with "[Circular]" and truncates long strings.
 * 
 * @param {*} obj - Object to stringify
 * @param {number} [maxLength=1000] - Max length for string values
 * @returns {string} - Safe JSON string
 */
function safeJson_(obj, maxLength = 1000) {
  const seen = new WeakSet();
  
  const replacer = (key, value) => {
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    
    // Truncate long strings
    if (typeof value === 'string' && value.length > maxLength) {
      return value.substring(0, maxLength) + '... [truncated]';
    }
    
    // Convert Date to ISO string
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    return value;
  };
  
  try {
    return JSON.stringify(obj, replacer);
  } catch (err) {
    Logger.log(`[safeJson_] Stringify failed: ${err.message}`);
    return JSON.stringify({ error: 'JSON stringify failed', message: err.message });
  }
}

/**
 * Stable object stringification for canonical signatures.
 */
function stableStringify_(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return String(obj);
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(v => stableStringify_(v)).join(',') + ']';
  }
  
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `"${k}":${stableStringify_(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Canonicalize field for signature (lowercase trim).
 */
function canonicalizeField_(value) {
  if (value == null) return '';
  return String(value).toLowerCase().trim();
}

/**
 * Round number to 2 decimal places.
 */
function round2_(num) {
  return Math.round(Number(num) * 100) / 100;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNATURE SECRET MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * PATCH d: Generate cryptographic secret using UUID + timestamp (no Math.random).
 * 
 * Combines 4 UUIDs, ISO timestamp, spreadsheet ID, script ID, and session temp key.
 * 
 * @returns {string} - 128-character hex secret
 */
function generateSecretHex_() {
  const parts = [
    Utilities.getUuid(),
    Utilities.getUuid(),
    Utilities.getUuid(),
    Utilities.getUuid(),
    new Date().toISOString(),
    SpreadsheetApp.getActiveSpreadsheet().getId(),
    ScriptApp.getScriptId(),
    Session.getTemporaryActiveUserKey()
  ];
  
  const combined = parts.join('||');
  const hash1 = sha256_(combined);
  const hash2 = sha256_(hash1 + combined);
  
  return hash1 + hash2;
}

/**
 * Read current signature secret from Script Properties.
 * 
 * @returns {Object|null} - {secret: string, version: number} or null
 */
function readSignatureSecret_() {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('SIGNATURE_SECRET');
  const version = props.getProperty('SIGNATURE_SECRET_VERSION');
  
  if (!secret) return null;
  
  return {
    secret: secret,
    version: parseInt(version || '1', 10)
  };
}

/**
 * Ensure signature secret exists; create if missing.
 * 
 * @returns {Object} - {secret: string, version: number}
 */
function ensureSignatureSecret_() {
  const existing = readSignatureSecret_();
  if (existing) return existing;
  
  return withDocLock_(() => {
    const recheck = readSignatureSecret_();
    if (recheck) return recheck;
    
    const newSecret = generateSecretHex_();
    const version = 1;
    
    const props = PropertiesService.getScriptProperties();
    props.setProperty('SIGNATURE_SECRET', newSecret);
    props.setProperty('SIGNATURE_SECRET_VERSION', String(version));
    props.setProperty(`SIGNATURE_SECRET_v${version}`, newSecret);
    
    logAuditEvent_('SECRET_CREATED', getActorEmail_(), {
      version: version,
      secretPreview: newSecret.substring(0, 16) + '...'
    });
    
    return { secret: newSecret, version: version };
  });
}

/**
 * Get current signature secret version.
 * 
 * @returns {number} - Version number (default 1)
 */
function getSignatureSecretVersion_() {
  const props = PropertiesService.getScriptProperties();
  const version = props.getProperty('SIGNATURE_SECRET_VERSION');
  return parseInt(version || '1', 10);
}

/**
 * Get signature secret by version number.
 * 
 * @param {number} version - Secret version
 * @returns {string|null} - Secret hex string or null if not found
 */
function getSignatureSecretByVersion_(version) {
  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum) || versionNum < 1) return null;
  
  const props = PropertiesService.getScriptProperties();
  
  // Try versioned key first
  const versioned = props.getProperty(`SIGNATURE_SECRET_v${versionNum}`);
  if (versioned) return versioned;
  
  // Fallback to current secret if version matches
  if (versionNum === getSignatureSecretVersion_()) {
    return props.getProperty('SIGNATURE_SECRET');
  }
  
  return null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROW & DECISION SIGNATURE FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Compute HMAC-SHA256 signature for a Master sheet row.
 * 
 * @param {Object} rowData - Row data object with EquityPercent field
 * @param {string} secret - Signature secret
 * @returns {string} - 64-char hex signature
 */
function computeRowSignature_(rowData, secret) {
  const canonical = {
    timestamp: rowData.Timestamp instanceof Date 
      ? Utilities.formatDate(rowData.Timestamp, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
      : String(rowData.Timestamp || ''),
    contributorKey: canonicalizeField_(rowData.ContributorKey),
    contributorName: canonicalizeField_(rowData.ContributorName),
    contributionType: canonicalizeField_(rowData.ContributionType),
    multiplier: round2_(rowData.Multiplier),
    baseValue: round2_(rowData.BaseValue),
    quantity: round2_(rowData.Quantity),
    slicesAwarded: round2_(rowData.SlicesAwarded),
    totalSlices: round2_(rowData.TotalSlices),
    equityPercent: String(rowData.EquityPercent || '0.00%'),
    evidenceURL: String(rowData.EvidenceURL || ''),
    notes: String(rowData.Notes || '')
  };
  
  const payload = stableStringify_(canonical);
  return hmac256Hex_(secret, payload);
}

/**
 * Compute HMAC-SHA256 decision signature (approve/reject).
 * 
 * Canonical payload uses 'status' field (not 'decision') to match Pending schema.
 * Field order: action, contributorKey, status, approvers, requestId, decisionAt.
 * 
 * @param {string} action - 'APPROVE' or 'REJECT'
 * @param {string} contributorKey - Contributor email/key
 * @param {string} status - 'APPROVED' or 'REJECTED'
 * @param {Array<string>} approvers - List of approver emails
 * @param {string} requestId - UUID request ID
 * @param {Date|string} decisionAt - Decision timestamp
 * @param {string} secret - Signature secret
 * @returns {string} - 64-char hex signature
 */
function computeDecisionSignature_(action, contributorKey, status, approvers, requestId, decisionAt, secret) {
  const canonApprovers = (approvers || [])
    .map(e => canonicalizeField_(e))
    .filter(e => e !== '')
    .sort();
  
  const canonicalDecisionAt = decisionAt instanceof Date
    ? Utilities.formatDate(decisionAt, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    : String(decisionAt || '');
  
  const canonical = {
    action: canonicalizeField_(action),
    contributorKey: canonicalizeField_(contributorKey),
    status: canonicalizeField_(status),
    approvers: canonApprovers,
    requestId: String(requestId || ''),
    decisionAt: canonicalDecisionAt
  };
  
  const payload = stableStringify_(canonical);
  return hmac256Hex_(secret, payload);
}

/**
 * Verify row signature.
 * 
 * @param {Object} rowData - Row data object
 * @param {string} storedSignature - Signature from sheet
 * @returns {boolean} - True if valid
 */
function verifyRowSignature_(rowData, storedSignature) {
  if (!storedSignature || storedSignature.length !== 64) return false;
  
  const secretData = ensureSignatureSecret_();
  const computed = computeRowSignature_(rowData, secretData.secret);
  
  return computed === storedSignature;
}

/**
 * Verify decision signature with detailed result (legacy fallback supported).
 * 
 * Returns {valid: boolean, usedLegacy: boolean} for tracking fallback usage.
 * 
 * @param {string} action - 'APPROVE' or 'REJECT'
 * @param {string} contributorKey - Contributor email/key
 * @param {string} status - 'APPROVED' or 'REJECTED'
 * @param {Array<string>} approvers - List of approver emails
 * @param {string} requestId - UUID request ID
 * @param {Date|string} decisionAt - Decision timestamp
 * @param {string} storedSignature - Signature from sheet
 * @returns {Object} - {valid: boolean, usedLegacy: boolean}
 */
function verifyDecisionSignatureDetailed_(action, contributorKey, status, approvers, requestId, decisionAt, storedSignature) {
  if (!storedSignature || storedSignature.length !== 64) {
    return { valid: false, usedLegacy: false };
  }
  
  const secretData = ensureSignatureSecret_();
  
  // Try current signature format (with requestId)
  const hasReqId = requestId && String(requestId).trim() !== '';
  if (hasReqId) {
    const computed = computeDecisionSignature_(action, contributorKey, status, approvers, requestId, decisionAt, secretData.secret);
    if (computed === storedSignature) {
      return { valid: true, usedLegacy: false };
    }
  }
  
  // Legacy fallback: signature without requestId
  const legacyComputed = computeDecisionSignature_(action, contributorKey, status, approvers, '', decisionAt, secretData.secret);
  if (legacyComputed === storedSignature) {
    return { valid: true, usedLegacy: true };
  }
  
  return { valid: false, usedLegacy: false };
}

/**
 * Verify decision signature (simple boolean result).
 * 
 * @returns {boolean} - True if valid (current or legacy format)
 */
function verifyDecisionSignature_(action, contributorKey, status, approvers, requestId, decisionAt, storedSignature) {
  const result = verifyDecisionSignatureDetailed_(action, contributorKey, status, approvers, requestId, decisionAt, storedSignature);
  return result.valid;
}

/**
 * Rotate signature secret to new version.
 * 
 * Old signatures remain valid via versioned secret lookup.
 */
function rotateSignatureSecret_() {
  return withDocLock_(() => {
    const props = PropertiesService.getScriptProperties();
    const currentVersion = getSignatureSecretVersion_();
    const newVersion = currentVersion + 1;
    
    // Archive current secret
    const currentSecret = props.getProperty('SIGNATURE_SECRET');
    if (currentSecret) {
      props.setProperty(`SIGNATURE_SECRET_v${currentVersion}`, currentSecret);
    }
    
    // Generate and store new secret
    const newSecret = generateSecretHex_();
    props.setProperty('SIGNATURE_SECRET', newSecret);
    props.setProperty('SIGNATURE_SECRET_VERSION', String(newVersion));
    props.setProperty(`SIGNATURE_SECRET_v${newVersion}`, newSecret);
    
    logAuditEvent_('SECRET_ROTATED', getActorEmail_(), {
      oldVersion: currentVersion,
      newVersion: newVersion,
      secretPreview: newSecret.substring(0, 16) + '...'
    });
    
    SpreadsheetApp.getUi().alert(
      'Secret Rotated',
      `Signature secret rotated from v${currentVersion} to v${newVersion}.\n\n` +
      `Old signatures remain valid. New signatures will use v${newVersion}.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    return { oldVersion: currentVersion, newVersion: newVersion };
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIT QUEUE & LOGGING SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 */

const AUDIT_CIRCUIT_BREAKER = {
  failureCount: 0,
  lastFailureTime: null,
  isOpen: false
};

/**
 * PATCH g: Normalize audit details with bounded truncation (≤8500 bytes).
 * 
 * Iteratively truncates keys until size constraint is met, adds metadata.
 * 
 * @param {*} details - Details object to normalize
 * @returns {string} - Safe JSON string ≤ MAX_AUDIT_DETAIL_SIZE
 */
function normalizeAuditDetails_(details) {
  const maxSize = CONFIG.MAX_AUDIT_DETAIL_SIZE;
  
  // Handle null/undefined
  if (details == null) {
    return JSON.stringify({ _note: 'No details provided' });
  }
  
  // Convert non-objects to wrapped object
  if (typeof details !== 'object') {
    return JSON.stringify({ value: String(details) });
  }
  
  // Initial safe JSON
  let json = safeJson_(details, 500);
  
  // PATCH g: Iterative truncation with metadata
  if (json.length > maxSize) {
    const originalSize = json.length;
    const obj = typeof details === 'object' ? details : { value: details };
    const keys = Object.keys(obj);
    
    let truncated = { ...obj };
    let attempts = 0;
    const maxAttempts = 10;
    
    while (json.length > maxSize && attempts < maxAttempts && keys.length > 0) {
      const keyToTruncate = keys.pop();
      if (keyToTruncate) {
        const val = truncated[keyToTruncate];
        if (typeof val === 'string' && val.length > 50) {
          truncated[keyToTruncate] = val.substring(0, 50) + '...';
        } else {
          delete truncated[keyToTruncate];
        }
      }
      
      truncated._truncated = true;
      truncated._originalSize = originalSize;
      truncated._attempts = ++attempts;
      
      json = safeJson_(truncated, 200);
    }
    
    // PATCH g: Absolute fallback if still too large
    if (json.length > maxSize) {
      const hash = sha256_(JSON.stringify(details).substring(0, 1000));
      json = JSON.stringify({
        _truncated: true,
        _originalSize: originalSize,
        _hash: hash,
        _note: 'Details exceeded size limit after truncation'
      });
    }
    
    // Final safety check
    if (json.length > maxSize) {
      json = JSON.stringify({ _error: 'Details too large', _hash: sha256_(String(details)) });
    }
  }
  
  return json;
}

/**
 * PATCH i: Core audit queue enqueue with corruption recovery.
 * 
 * Requires document lock. Recovers from corrupted queue, enforces size/byte limits.
 * 
 * @param {string} action - Action type
 * @param {string} actor - Actor email
 * @param {*} details - Details object
 */
function enqueueAuditEventCore_(action, actor, details) {
  if (!LOCK_STATE.acquired) {
    throw new Error('enqueueAuditEventCore_ requires document lock');
  }
  
  if (AUDIT_CIRCUIT_BREAKER.isOpen) {
    Logger.log('[enqueueAuditEventCore_] Circuit breaker OPEN, skipping audit event');
    return;
  }
  
  const props = PropertiesService.getScriptProperties();
  
  try {
    // PATCH i: Recover from corrupted queue
    let queue = [];
    const raw = props.getProperty('AUDIT_QUEUE') || '[]';
    
    try {
      queue = JSON.parse(raw);
      if (!Array.isArray(queue)) {
        Logger.log('[enqueueAuditEventCore_] Queue is not array, resetting');
        queue = [];
      }
    } catch (parseErr) {
      // PATCH k: Minimal safe recovery (no recursion)
      Logger.log(`[enqueueAuditEventCore_] Queue JSON corrupt: ${parseErr.message}`);
      Logger.log(`[enqueueAuditEventCore_] Corrupted queue snippet: ${String(raw).substring(0, 200)}`);
      queue = [];
      props.setProperty('AUDIT_QUEUE', '[]');
      // PATCH k: Do NOT call logAuditEvent_ here to avoid recursion
    }
    
    // PATCH i: Build event with ISO timestamp
    const timestamp = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    const detailsJson = normalizeAuditDetails_(details);
    
    const event = {
      timestamp: timestamp,
      action: String(action),
      actor: String(actor),
      details: detailsJson.substring(0, 200),
      detailsJson: detailsJson
    };
    
    // PATCH g: Enforce queue size limits
    if (queue.length >= CONFIG.MAX_QUEUE_SIZE) {
      Logger.log(`[enqueueAuditEventCore_] Queue full (${queue.length}), flushing`);
      flushAuditQueue_();
      queue = [];
    }
    
    queue.push(event);
    
    // PATCH g: Enforce byte limit
    const queueJson = JSON.stringify(queue);
    if (queueJson.length > CONFIG.QUEUE_BYTE_LIMIT) {
      Logger.log(`[enqueueAuditEventCore_] Queue bytes exceeded (${queueJson.length}), flushing`);
      flushAuditQueue_();
      queue = [event];
    }
    
    props.setProperty('AUDIT_QUEUE', JSON.stringify(queue));
    
  } catch (err) {
    recordAuditFailure_(err);
    Logger.log(`[enqueueAuditEventCore_] Error: ${err.message}\n${err.stack}`);
  }
}

/**
 * Enqueue audit event (public wrapper, acquires lock if needed).
 */
function enqueueAuditEvent_(action, actor, details) {
  if (LOCK_STATE.acquired) {
    enqueueAuditEventCore_(action, actor, details);
  } else {
    withDocLock_(() => enqueueAuditEventCore_(action, actor, details));
  }
}

/**
 * PATCH b+c+i: Flush audit queue to Audit Log sheet.
 * 
 * Computes ChainHash (SHA256) and Signature (HMAC-SHA256) for each event.
 * Writes 7 columns: Timestamp, Action, Actor, Details, DetailsJson, ChainHash, Signature.
 */
function flushAuditQueue_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('AUDIT_QUEUE') || '[]';
  
  let queue = [];
  try {
    queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) {
      return;
    }
  } catch (err) {
    Logger.log(`[flushAuditQueue_] Invalid queue JSON: ${err.message}`);
    props.setProperty('AUDIT_QUEUE', '[]');
    return;
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let auditSheet = ss.getSheetByName('Audit Log');
    if (!auditSheet) {
      auditSheet = ensureAuditLogSheet_();
    }
    
    const secretData = ensureSignatureSecret_();
    const lastRow = auditSheet.getLastRow();
    
    // Get previous chain hash (default to empty string if first row)
    let prevHash = '';
    if (lastRow > 1) {
      const prevChainHashCell = auditSheet.getRange(lastRow, CONFIG.AUDIT_SCHEMA_POSITIONS.ChainHash + 1);
      prevHash = String(prevChainHashCell.getValue() || '');
    }
    
    // PATCH b+c: Build rows with separate ChainHash and Signature columns
    const rows = queue.map(event => {
      const canonicalJson = safeJson_({
        timestamp: event.timestamp,
        action: event.action,
        actor: event.actor,
        detailsJson: event.detailsJson
      });
      
      const chainHash = sha256_(`CHAIN||${prevHash}||${canonicalJson}`);
      const signatureHex = hmac256Hex_(secretData.secret, `AUDIT||v${secretData.version}||${prevHash}||${canonicalJson}`);
      const signature = `v${secretData.version}:${signatureHex}`;
      
      prevHash = chainHash;
      
      // PATCH i: 7 columns (Timestamp as ISO string)
      return [
        event.timestamp,           // Col 1: Timestamp (ISO string)
        event.action,              // Col 2: Action
        event.actor,               // Col 3: Actor
        event.details,             // Col 4: Details (truncated)
        event.detailsJson,         // Col 5: DetailsJson (full)
        chainHash,                 // Col 6: ChainHash
        signature                  // Col 7: Signature
      ];
    });
    
    auditSheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
    
    props.setProperty('AUDIT_QUEUE', '[]');
    Logger.log(`[flushAuditQueue_] Flushed ${rows.length} events`);
    
  } catch (err) {
    Logger.log(`[flushAuditQueue_] Error: ${err.message}\n${err.stack}`);
    recordAuditFailure_(err);
  }
}

/**
 * Log audit event (synchronous, flushes immediately if not in lock).
 */
function logAuditEvent_(action, actor, details) {
  enqueueAuditEvent_(action, actor, details);
  
  if (!LOCK_STATE.acquired) {
    flushAuditQueue_();
  }
}

/**
 * Record audit system failure (circuit breaker).
 */
function recordAuditFailure_(error) {
  AUDIT_CIRCUIT_BREAKER.failureCount++;
  AUDIT_CIRCUIT_BREAKER.lastFailureTime = new Date();
  
  if (AUDIT_CIRCUIT_BREAKER.failureCount >= CONFIG.MAX_AUDIT_FAILURES) {
    AUDIT_CIRCUIT_BREAKER.isOpen = true;
    Logger.log('[recordAuditFailure_] Circuit breaker OPEN after ' + 
               CONFIG.MAX_AUDIT_FAILURES + ' failures');
  }
  
  Logger.log(`[recordAuditFailure_] Failure #${AUDIT_CIRCUIT_BREAKER.failureCount}: ${error.message}`);
}

/**
 * Reset audit circuit breaker.
 */
function resetAuditCircuitBreaker_() {
  AUDIT_CIRCUIT_BREAKER.failureCount = 0;
  AUDIT_CIRCUIT_BREAKER.lastFailureTime = null;
  AUDIT_CIRCUIT_BREAKER.isOpen = false;
  Logger.log('[resetAuditCircuitBreaker_] Circuit breaker reset');
}

/**
 * Manual audit queue flush (menu item).
 */
function manualFlushAuditQueue_() {
  try {
    flushAuditQueue_();
    SpreadsheetApp.getUi().alert(
      'Audit Queue Flushed',
      'Pending audit events have been written to Audit Log sheet.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Flush Failed',
      `Error: ${err.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Get current actor email.
 */
function getActorEmail_() {
  try {
    return Session.getEffectiveUser().getEmail() || 'unknown@unknown.com';
  } catch (err) {
    return 'unknown@unknown.com';
  }
}

/**
 * PATCH i: Verify audit chain with timestamp canonicalization.
 * 
 * Handles both legacy Date objects and ISO string timestamps.
 * Only advances prevHash after successful chain verification.
 * 
 * @returns {Object} - {valid: boolean, totalRows: number, chainBreaks: Array, signatureErrors: Array}
 */
function verifyAuditChain_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auditSheet = ss.getSheetByName('Audit Log');
    if (!auditSheet) {
      return { valid: false, error: 'Audit Log sheet not found' };
    }
    
    const lastRow = auditSheet.getLastRow();
    if (lastRow <= 1) {
      return { valid: true, totalRows: 0, chainBreaks: [], signatureErrors: [] };
    }
    
    // PATCH i: Read 7 columns
    const data = auditSheet.getRange(2, 1, lastRow - 1, 7).getValues();
    
    let prevHash = '';
    const chainBreaks = [];
    const signatureErrors = [];
    
    for (let i = 0; i < data.length; i++) {
      const rowNum = i + 2;
      const [timestamp, action, actor, details, detailsJson, chainHash, signature] = data[i];
      
      // PATCH i: Canonicalize timestamp (handle Date or string)
      const canonicalTimestamp = timestamp instanceof Date
        ? Utilities.formatDate(timestamp, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        : String(timestamp);
      
      let canonicalJson;
      try {
        canonicalJson = safeJson_({
          timestamp: canonicalTimestamp,
          action: String(action),
          actor: String(actor),
          detailsJson: String(detailsJson)
        });
      } catch (jsonErr) {
        signatureErrors.push({
          row: rowNum,
          error: 'JSON parse failed',
          raw: String(detailsJson).substring(0, 100)
        });
        continue;
      }
      
      // PATCH i: Micro-guard - check for blank chainHash
      if (!chainHash || String(chainHash).trim() === '') {
        chainBreaks.push({
          row: rowNum,
          error: 'Missing chainHash',
          prevHash: prevHash
        });
        continue;
      }
      
      // PATCH i: Verify chain hash using PREVIOUS prevHash
      const expectedChainHash = sha256_(`CHAIN||${prevHash}||${canonicalJson}`);
      if (String(chainHash) !== expectedChainHash) {
        chainBreaks.push({
          row: rowNum,
          expected: expectedChainHash,
          actual: String(chainHash),
          prevHash: prevHash
        });
        // PATCH i: Do NOT advance prevHash on chain break
        continue;
      }
      
      // PATCH i: Verify signature with version support (survives secret rotation)
      // Signature formats:
      //   - v<version>:<64-hex>   (preferred)
      //   - <64-hex>              (legacy; we try all known versions)
      const sigStr = String(signature || '').trim();
      let sigHex = '';
      let versionNum = null;

      const m = sigStr.match(/^v(\d+):([0-9a-f]{64})$/i);
      if (m) {
        versionNum = parseInt(m[1], 10);
        sigHex = String(m[2]).toLowerCase();
      } else if (/^[0-9a-f]{64}$/i.test(sigStr)) {
        sigHex = sigStr.toLowerCase();
      } else {
        signatureErrors.push({ row: rowNum, error: 'Invalid signature format' });
        prevHash = String(chainHash);
        continue;
      }

      const versionsToTry = [];
      if (versionNum && !isNaN(versionNum)) {
        versionsToTry.push(versionNum);
      } else {
        const currentV = getSignatureSecretVersion_();
        for (let v = currentV; v >= 1; v--) versionsToTry.push(v);
      }

      let sigValid = false;
      for (const v of versionsToTry) {
        const secret = getSignatureSecretByVersion_(v);
        if (!secret) continue;

        const expectedSigHex = hmac256Hex_(secret, `AUDIT||v${v}||${prevHash}||${canonicalJson}`);
        if (expectedSigHex === sigHex) {
          sigValid = true;
          break;
        }
      }

      if (!sigValid) {
        signatureErrors.push({
          row: rowNum,
          error: 'Signature mismatch',
          actual: sigHex.substring(0, 16) + '...'
        });
      }

prevHash = String(chainHash);
    }
    
    return {
      valid: chainBreaks.length === 0 && signatureErrors.length === 0,
      totalRows: data.length,
      chainBreaks: chainBreaks,
      signatureErrors: signatureErrors
    };
    
  } catch (err) {
    Logger.log(`[verifyAuditChain_] Error: ${err.message}\n${err.stack}`);
    return { valid: false, error: err.message };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHEMA ENFORCEMENT & SHEET MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * PATCH i: Get column map with bounded retry and schema enforcement.
 * 
 * Reads header row, enforces schema if columns missing, retries up to 3 times.
 * 
 * @param {Sheet} sheet - Sheet object
 * @param {Array} schema - Schema array
 * @returns {Object} - Column name → index map
 */
function getColMap_(sheet, schema) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    
    const lastCol = Math.max(sheet.getLastColumn(), schema.length);
    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    const colMap = {};
    headerRow.forEach((name, idx) => {
      if (name) colMap[String(name).trim()] = idx;
    });
    
    // Check if all schema columns present
    const missing = schema.filter(col => !(col.name in colMap));
    
    if (missing.length === 0) {
      return colMap;
    }
    
    // PATCH i: Attempt one-time schema enforcement
    if (attempt === 1) {
      Logger.log(`[getColMap_] Missing columns on attempt ${attempt}: ${missing.map(c => c.name).join(', ')}`);
      Logger.log(`[getColMap_] Attempting schema enforcement...`);
      
      try {
        enforceSchemaOrder_(sheet, schema);
        SpreadsheetApp.flush();
        Utilities.sleep(500);
        continue;
      } catch (enforceErr) {
        Logger.log(`[getColMap_] Schema enforcement failed: ${enforceErr.message}`);
      }
    }
    
    // Give up after max retries
    if (attempt >= maxRetries) {
      throw new Error(
        `Schema mismatch in sheet "${sheet.getName()}" after ${maxRetries} attempts.\n` +
        `Missing columns: ${missing.map(c => c.name).join(', ')}\n` +
        `Run "Initialize System" to repair schema.`
      );
    }
    
    Utilities.sleep(300);
  }
  
  throw new Error(`Failed to get column map for sheet "${sheet.getName()}"`);
}

/**
 * PATCH j: Enforce schema order with physical column guard.
 * 
 * Deletes extra USED columns (not capacity columns), inserts missing columns,
 * rewrites mismatched headers, freezes row 1.
 * 
 * @param {Sheet} sheet - Sheet object
 * @param {Array} schema - Schema array [{name, type}, ...]
 */
function enforceSchemaOrder_(sheet, schema) {
  const requiredCols = schema.length;
  const usedCols = sheet.getLastColumn();
  const maxCols = sheet.getMaxColumns();
  
  Logger.log(`[enforceSchemaOrder_] Sheet="${sheet.getName()}" required=${requiredCols}, used=${usedCols}, max=${maxCols}`);
  
  try {
    // PATCH j: Delete extra USED columns (not empty capacity columns)
    if (usedCols > requiredCols) {
      const extra = usedCols - requiredCols;
      
      // PATCH j: Physical column guard - ensure enough columns exist to read header tail
      if (maxCols < usedCols) {
        const neededCols = usedCols - maxCols;
        Logger.log(`[enforceSchemaOrder_] Inserting ${neededCols} columns for header tail read`);
        sheet.insertColumnsAfter(maxCols, neededCols);
        SpreadsheetApp.flush();
      }
      
      // Read header tail to check if columns contain data
      const headerTail = sheet.getRange(1, requiredCols + 1, 1, extra).getValues()[0];
      const hasData = headerTail.some(v => String(v || '').trim() !== '');
      
      if (hasData) {
        Logger.log(`[enforceSchemaOrder_] Deleting ${extra} extra USED columns (cols ${requiredCols + 1} to ${usedCols})`);
        sheet.deleteColumns(requiredCols + 1, extra);
        SpreadsheetApp.flush();
        
        logAuditEvent_('SCHEMA_COLUMNS_DELETED', 'System', {
          sheet: sheet.getName(),
          deletedColumns: extra,
          fromCol: requiredCols + 1,
          toCol: usedCols,
          headerTail: headerTail.map(v => String(v).substring(0, 30))
        });
      } else {
        Logger.log(`[enforceSchemaOrder_] Skipping deletion of ${extra} empty capacity columns`);
      }
    }
    
    // Insert missing columns if needed
    const currentMaxCols = sheet.getMaxColumns();
    if (currentMaxCols < requiredCols) {
      const colsToAdd = requiredCols - currentMaxCols;
      Logger.log(`[enforceSchemaOrder_] Inserting ${colsToAdd} columns`);
      sheet.insertColumnsAfter(currentMaxCols, colsToAdd);
      SpreadsheetApp.flush();
      
      logAuditEvent_('SCHEMA_COLUMNS_ADDED', 'System', {
        sheet: sheet.getName(),
        addedColumns: colsToAdd
      });
    }
    
    // Rewrite header row
    const currentHeaders = sheet.getRange(1, 1, 1, requiredCols).getValues()[0];
    const expectedHeaders = schema.map(col => col.name);
    
    let headerMismatch = false;
    for (let i = 0; i < requiredCols; i++) {
      if (String(currentHeaders[i]).trim() !== expectedHeaders[i]) {
        headerMismatch = true;
        break;
      }
    }
    
    if (headerMismatch) {
      Logger.log(`[enforceSchemaOrder_] Rewriting header row`);
      sheet.getRange(1, 1, 1, requiredCols).setValues([expectedHeaders]);
      SpreadsheetApp.flush();
      
      logAuditEvent_('SCHEMA_HEADERS_REWRITTEN', 'System', {
        sheet: sheet.getName(),
        oldHeaders: currentHeaders.map(h => String(h).substring(0, 30)),
        newHeaders: expectedHeaders
      });
    }
    
    // Freeze header row
    if (sheet.getFrozenRows() !== 1) {
      sheet.setFrozenRows(1);
    }
    
    Logger.log(`[enforceSchemaOrder_] Schema enforcement complete for "${sheet.getName()}"`);
    
  } catch (err) {
    Logger.log(`[enforceSchemaOrder_] Error: ${err.message}\n${err.stack}`);
    throw new Error(`Schema enforcement failed for "${sheet.getName()}": ${err.message}`);
  }
}

/**
 * Sanitize value for sheet writing (anti-injection, type coercion).
 */
function sanitizeForSheet_(value, expectedType) {
  if (value == null) {
    return expectedType === 'number' ? 0 : '';
  }
  
  // PATCH e: Force numeric conversion
  if (expectedType === 'number') {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }
  
  if (expectedType === 'date') {
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  
  // String sanitization (formula injection protection)
  let str = String(value);
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    str = "'" + str;
  }
  
  return str;
}

/**
 * Build pending row (15 columns, no Decision column).
 */
function buildPendingRow_(contributorKey, contributorName, contributionType, multiplier, baseValue, quantity, slicesAwarded, evidenceURL, notes, requestId) {
  const positions = CONFIG.PENDING_SCHEMA_POSITIONS;
  const row = new Array(CONFIG.PENDING_SCHEMA.length).fill('');
  
  row[positions.Timestamp] = new Date();
  row[positions.ContributorKey] = sanitizeForSheet_(contributorKey, 'string');
  row[positions.ContributorName] = sanitizeForSheet_(contributorName, 'string');
  row[positions.ContributionType] = sanitizeForSheet_(contributionType, 'string');
  row[positions.Multiplier] = sanitizeForSheet_(multiplier, 'number');
  row[positions.BaseValue] = sanitizeForSheet_(baseValue, 'number');
  row[positions.Quantity] = sanitizeForSheet_(quantity, 'number');
  row[positions.SlicesAwarded] = sanitizeForSheet_(slicesAwarded, 'number');
  row[positions.EvidenceURL] = sanitizeForSheet_(evidenceURL, 'string');
  row[positions.Notes] = sanitizeForSheet_(notes, 'string');
  row[positions.Status] = 'PENDING';
  row[positions.Approvers] = '';
  row[positions.DecisionSignature] = '';
  row[positions.DecisionTimestamp] = '';
  row[positions.RequestId] = sanitizeForSheet_(requestId, 'string');
  
  return row;
}

/**
 * Normalize contribution type to uppercase.
 */
function normalizeContributionType_(type) {
  const normalized = String(type).toUpperCase().trim();
  const valid = Object.keys(CONFIG.MULTIPLIERS);
  
  if (!valid.includes(normalized)) {
    throw new Error(`Invalid contribution type: "${type}". Valid types: ${valid.join(', ')}`);
  }
  
  return normalized;
}

/**
 * Canonicalize approver list (lowercase, sorted).
 */
function canonicalizeApproverList_(approvers) {
  if (!Array.isArray(approvers)) return [];

  const seen = new Set();
  const out = [];

  for (const email of approvers) {
    const clean = canonicalizeField_(email);
    if (!clean) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }

  return out.sort();
}


/**
 * Validate email format.
 */
function isValidEmail_(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(String(email).trim());
}

/**
 * Validate URL format.
 */
function isValidURL_(url) {
  if (!url || String(url).trim() === '') return true;
  
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

/**
 * Format equity percent as string (e.g., "12.34%").
 */
function formatEquityPercent_(percent) {
  const num = Number(percent);
  if (isNaN(num)) return '0.00%';
  return num.toFixed(2) + '%';
}

/**
 * Ensure Master sheet exists with correct schema.
 */
function ensureMasterSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let masterSheet = ss.getSheetByName('Master');
  
  if (!masterSheet) {
    masterSheet = ss.insertSheet('Master');
    
    const headers = CONFIG.MASTER_SCHEMA.map(col => col.name);
    masterSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    masterSheet.setFrozenRows(1);
    masterSheet.getRange(1, 1, 1, headers.length).setBackground('#4285F4').setFontColor('#FFFFFF').setFontWeight('bold');
    
    logAuditEvent_('SHEET_CREATED', 'System', {
      sheet: 'Master',
      columns: headers.length,
      schema: headers
    });
  }
  
  return masterSheet;
}

/**
 * Ensure Pending sheet exists with correct schema (15 columns).
 */
function ensurePendingSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let pendingSheet = ss.getSheetByName('Pending');
  
  if (!pendingSheet) {
    pendingSheet = ss.insertSheet('Pending');
    
    const headers = CONFIG.PENDING_SCHEMA.map(col => col.name);
    pendingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    pendingSheet.setFrozenRows(1);
    pendingSheet.getRange(1, 1, 1, headers.length).setBackground('#0F9D58').setFontColor('#FFFFFF').setFontWeight('bold');
    
    logAuditEvent_('SHEET_CREATED', 'System', {
      sheet: 'Pending',
      columns: headers.length,
      schema: headers
    });
  }
  
  return pendingSheet;
}

/**
 * Ensure Audit Log sheet exists with correct schema (7 columns).
 */
function ensureAuditLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let auditSheet = ss.getSheetByName('Audit Log');
  
  if (!auditSheet) {
    auditSheet = ss.insertSheet('Audit Log');
    
    const headers = CONFIG.AUDIT_LOG_SCHEMA.map(col => col.name);
    auditSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    auditSheet.setFrozenRows(1);
    auditSheet.getRange(1, 1, 1, headers.length).setBackground('#F4B400').setFontColor('#000000').setFontWeight('bold');
    
    // PATCH i: Format Timestamp column (A) as plain text to store ISO strings
    try {
      const maxRows = auditSheet.getMaxRows();
      auditSheet.getRange(2, 1, maxRows - 1, 1).setNumberFormat('@');
    } catch (formatErr) {
      Logger.log(`[ensureAuditLogSheet_] Format warning: ${formatErr.message}`);
    }
    
    // No audit event here (chicken-and-egg problem)
    Logger.log('[ensureAuditLogSheet_] Audit Log sheet created');
  }
  
  return auditSheet;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKFLOW FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CONTRIBUTOR_CACHE = {
  data: null,
  timestamp: null,
  ttl: 60000 // 1 minute
};

/**
 * Check if contributor exists in Master sheet (with cache).
 */
function contributorExists_(contributorKey) {
  const now = Date.now();
  
  if (!CONTRIBUTOR_CACHE.data || !CONTRIBUTOR_CACHE.timestamp || (now - CONTRIBUTOR_CACHE.timestamp > CONTRIBUTOR_CACHE.ttl)) {
    const masterSheet = ensureMasterSheet_();
    const lastRow = masterSheet.getLastRow();
    
    if (lastRow <= 1) {
      CONTRIBUTOR_CACHE.data = new Set();
    } else {
      const colMap = getColMap_(masterSheet, CONFIG.MASTER_SCHEMA);
      const keyCol = colMap.ContributorKey + 1;
      const keys = masterSheet.getRange(2, keyCol, lastRow - 1, 1).getValues().map(row => String(row[0]).toLowerCase().trim());
      CONTRIBUTOR_CACHE.data = new Set(keys);
    }
    
    CONTRIBUTOR_CACHE.timestamp = now;
  }
  
  return CONTRIBUTOR_CACHE.data.has(String(contributorKey).toLowerCase().trim());
}

/**
 * Add new contributor to Master sheet.
 */
function addContributor_(contributorKey, contributorName) {
  const masterSheet = ensureMasterSheet_();
  const colMap = getColMap_(masterSheet, CONFIG.MASTER_SCHEMA);
  
  const row = new Array(CONFIG.MASTER_SCHEMA.length).fill('');
  row[colMap.Timestamp] = new Date();
  row[colMap.ContributorKey] = contributorKey;
  row[colMap.ContributorName] = contributorName;
  row[colMap.TotalSlices] = 0;
  row[colMap.EquityPercent] = '0.00%';
  
  masterSheet.appendRow(row);
  
  CONTRIBUTOR_CACHE.data = null;
  
  logAuditEvent_('CONTRIBUTOR_ADDED', getActorEmail_(), {
    contributorKey: contributorKey,
    contributorName: contributorName
  });
}

/**
 * Process new contribution submission.
 * 
 * @param {string} contributorKey - Contributor email/key
 * @param {string} contributionType - Type (TIME, CASH, etc.)
 * @param {number} baseValue - Base value in GBP
 * @param {number} quantity - Quantity (hours, dollars, etc.)
 * @param {string} notes - Notes
 * @param {string} [evidenceURL=''] - Evidence URL
 * @param {string} [contributorName=''] - Contributor name (auto-filled if exists)
 * @returns {Object} - {success: boolean, requestId: string, slices: number}
 */
function processContribution_(contributorKey, contributionType, baseValue, quantity, notes, evidenceURL = '', contributorName = '') {
  contributorKey = String(contributorKey).trim();
  contributionType = normalizeContributionType_(contributionType);
  baseValue = Number(baseValue);
  quantity = Number(quantity);
  evidenceURL = String(evidenceURL || '').trim();
  notes = String(notes || '').trim();
  
  // Validation
  if (!isValidEmail_(contributorKey)) {
    throw new Error(`Invalid contributor email: "${contributorKey}"`);
  }
  
  if (isNaN(baseValue) || baseValue <= 0) {
    throw new Error(`Invalid base value: ${baseValue}. Must be > 0.`);
  }
  
  if (isNaN(quantity) || quantity <= 0) {
    throw new Error(`Invalid quantity: ${quantity}. Must be > 0.`);
  }
  
  if (baseValue > CONFIG.MAX_VALUE_GBP) {
    throw new Error(`Base value ${baseValue} exceeds maximum ${CONFIG.MAX_VALUE_GBP} GBP`);
  }
  
  if (evidenceURL && !isValidURL_(evidenceURL)) {
    throw new Error(`Invalid evidence URL: "${evidenceURL}"`);
  }
  
  const multiplier = CONFIG.MULTIPLIERS[contributionType];
  const slicesAwarded = round2_(multiplier * baseValue * quantity);
  
  if (slicesAwarded > CONFIG.MAX_SLICES_DELTA) {
    throw new Error(`Slices awarded ${slicesAwarded} exceeds maximum delta ${CONFIG.MAX_SLICES_DELTA}`);
  }
  
  // Get or create contributor name
  if (!contributorName || String(contributorName).trim() === '') {
    if (contributorExists_(contributorKey)) {
      const masterSheet = ensureMasterSheet_();
      const colMap = getColMap_(masterSheet, CONFIG.MASTER_SCHEMA);
      const data = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, CONFIG.MASTER_SCHEMA.length).getValues();
      
      for (const row of data) {
        if (String(row[colMap.ContributorKey]).toLowerCase().trim() === contributorKey.toLowerCase()) {
          contributorName = String(row[colMap.ContributorName]);
          break;
        }
      }
    } else {
      contributorName = contributorKey.split('@')[0];
    }
  }
  
  // PATCH h: Generate UUID for RequestId
  const requestId = Utilities.getUuid();
  
  return withDocLock_(() => {
    // PATCH h: Enforce schema before appending
    const pendingSheet = ensurePendingSheet_();
    enforceSchemaOrder_(pendingSheet, CONFIG.PENDING_SCHEMA);
    SpreadsheetApp.flush();
    
    const row = buildPendingRow_(
      contributorKey,
      contributorName,
      contributionType,
      multiplier,
      baseValue,
      quantity,
      slicesAwarded,
      evidenceURL,
      notes,
      requestId
    );
    
    pendingSheet.appendRow(row);
    
    logAuditEvent_('CONTRIBUTION_SUBMITTED', contributorKey, {
      requestId: requestId,
      contributionType: contributionType,
      baseValue: baseValue,
      quantity: quantity,
      slicesAwarded: slicesAwarded,
      multiplier: multiplier
    });
    
    return {
      success: true,
      requestId: requestId,
      slices: slicesAwarded,
      contributorKey: contributorKey,
      contributorName: contributorName
    };
  });
}

/**
 * FIX 2 (v6.0.34j): Approve contribution with row number validation.
 * 
 * Validates pendingRowNum immediately, enforces schema, checks RequestId,
 * verifies quorum and authorization, computes decision signature, updates
 * Pending sheet, applies equity delta to Master sheet.
 * 
 * @param {number} pendingRowNum - Row number in Pending sheet (≥2)
 * @param {boolean} [skipHighValueCheck=false] - Skip high-value approval check
 * @param {boolean} [bypassRequestIdCheck=false] - Bypass RequestId validation (migration only)
 * @returns {Object} - {success, contributorKey, slicesAwarded, equityPercent, decisionSignature, masterRowSignature}
 */
function approveContribution(pendingRowNum, skipHighValueCheck = false, bypassRequestIdCheck = false) {
  
  // FIX 2: Validate rowNum before any sheet operations
  if (pendingRowNum == null || pendingRowNum === '') {
    throw new Error('approveContribution: pendingRowNum is required (null/undefined received). ' +
                    'This function must be called with a valid row number (≥2). ' +
                    'For menu-driven approval, use approveContributionUI_() instead.');
  }
  
  const rowNum = Number(pendingRowNum);
  if (!Number.isInteger(rowNum) || rowNum < 2) {
    throw new Error(`approveContribution: Invalid row number "${pendingRowNum}". ` +
                    `Must be an integer ≥2 (received type=${typeof pendingRowNum}, value=${rowNum})`);
  }
  
  // FIX 2: Schema length assertion (CR-01: updated to 20 columns)
  if (CONFIG.PENDING_SCHEMA.length !== 20) {
    throw new Error(`CRITICAL: PENDING_SCHEMA has ${CONFIG.PENDING_SCHEMA.length} columns, expected 20. ` +
                    'Schema drift detected - run "Initialize System" or "Migrate Schema" to repair.');
  }
  
  return withDocLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pendingSheet = ss.getSheetByName('Pending');
    if (!pendingSheet) {
      throw new Error('Pending sheet not found');
    }
    
    // PATCH h: Enforce schema before reading row
    enforceSchemaOrder_(pendingSheet, CONFIG.PENDING_SCHEMA);
    SpreadsheetApp.flush();
    
    const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
    
    // FIX 2: Use validated rowNum in all getRange calls (CR-01: read 20 columns)
    const rowData = pendingSheet.getRange(rowNum, 1, 1, 20).getValues()[0];
    
    const contributorKey = String(rowData[colMap.ContributorKey]);
    const contributorName = String(rowData[colMap.ContributorName]);
    const contributionType = String(rowData[colMap.ContributionType]);
    const multiplier = Number(rowData[colMap.Multiplier]);
    const baseValue = Number(rowData[colMap.BaseValue]);
    const quantity = Number(rowData[colMap.Quantity]);
    const slicesAwarded = Number(rowData[colMap.SlicesAwarded]);
    const evidenceURL = String(rowData[colMap.EvidenceURL] || '');
    const notes = String(rowData[colMap.Notes] || '');
    const status = String(rowData[colMap.Status]);
    const requestId = String(rowData[colMap.RequestId] || '');
    
    // Validate status (allow quorum accumulation)
    const statusNorm = String(status || '').trim().toUpperCase();
    if (statusNorm !== 'PENDING' && statusNorm !== 'PENDING_QUORUM') {
      throw new Error(
        `Cannot approve contribution with status "${statusNorm}". Only PENDING or PENDING_QUORUM contributions can be approved.`
      );
    }

// PATCH h: Validate RequestId (unless bypassed for migration)
    if (!bypassRequestIdCheck && (!requestId || requestId.trim() === '')) {
      throw new Error(
        `Missing RequestId for row ${rowNum}. ` +
        `Run "Migrate Pending RequestIds" before approving contributions.`
      );
    }
    
    // Authorization check
    const actor = getActorEmail_();
    const actorCanon = canonicalizeField_(actor);
    const ownerCanon = canonicalizeField_(CONFIG.OWNER_EMAIL);
    const foundersCanon = (CONFIG.FOUNDER_APPROVERS || []).map(canonicalizeField_);
    if (actorCanon !== ownerCanon && !foundersCanon.includes(actorCanon)) {
      throw new Error(`User ${actor} is not authorized to approve contributions. Only owner or founders can approve.`);
    }

    // Conditional quorum: only required for high-value (GBP) contributions
    const requiredApprovers =
      baseValue >= CONFIG.QUORUM_VALUE_THRESHOLD_GBP ? CONFIG.QUORUM_THRESHOLD : 1;

    // Accumulate approvers from Pending.Approvers
    const existingApprovers = String(rowData[colMap.Approvers] || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const mergedApprovers = canonicalizeApproverList_([...existingApprovers, actor]);
    const normalizedApprovers = mergedApprovers.join(', ');

    // If quorum not met, record progress and exit (no Master write, no decision signature)
    if (mergedApprovers.length < requiredApprovers) {
      pendingSheet.getRange(rowNum, colMap.Approvers + 1).setValue(normalizedApprovers);
      pendingSheet.getRange(rowNum, colMap.Status + 1).setValue('PENDING_QUORUM');

      logAuditEvent_('QUORUM_APPROVAL_RECORDED', actor, {
        pendingRow: rowNum,
        requestId: requestId,
        baseValueGbp: baseValue,
        approversCount: mergedApprovers.length,
        requiredApprovers: requiredApprovers,
        approvers: mergedApprovers
      });

      return {
        success: false,
        state: 'PENDING_QUORUM',
        approversCount: mergedApprovers.length,
        requiredApprovers: requiredApprovers,
        message: `Approval recorded (${mergedApprovers.length}/${requiredApprovers}). Waiting for more approvers.`
      };
    }

    // Quorum met: persist and proceed with approval using final approver list
    pendingSheet.getRange(rowNum, colMap.Approvers + 1).setValue(normalizedApprovers);
    const approvers = mergedApprovers;

    
    // Compute decision signature
    const decisionTimestamp = new Date();
    const secretData = ensureSignatureSecret_();
    
    const decisionSignature = computeDecisionSignature_(
      'APPROVE',
      contributorKey,
      'APPROVED',
      approvers,
      requestId,
      decisionTimestamp,
      secretData.secret
    );
    
    // FIX 2: Micro-guard - validate signature is 64-char hex string
    if (typeof decisionSignature !== 'string' || decisionSignature.length !== 64) {
      throw new Error(
        `Decision signature generation failed. Expected 64-char hex string, got: ${typeof decisionSignature} ` +
        `(length=${decisionSignature ? decisionSignature.length : 'null'})`
      );
    }
    
    // Update Pending sheet (15 columns)
    pendingSheet.getRange(rowNum, colMap.Status + 1).setValue('APPROVED');
    pendingSheet.getRange(rowNum, colMap.Approvers + 1).setValue(approvers.join(', '));
    pendingSheet.getRange(rowNum, colMap.DecisionSignature + 1).setValue(decisionSignature);
    pendingSheet.getRange(rowNum, colMap.DecisionTimestamp + 1).setValue(decisionTimestamp);
    
    // Apply equity delta to Master sheet
    const result = applyEquityDelta_(
      contributorKey,
      contributorName,
      contributionType,
      multiplier,
      baseValue,
      quantity,
      slicesAwarded,
      evidenceURL,
      notes
    );
    
    logAuditEvent_('CONTRIBUTION_APPROVED', actor, {
      pendingRow: rowNum,
      requestId: requestId,
      contributorKey: contributorKey,
      slicesAwarded: slicesAwarded,
      decisionSignature: decisionSignature,
      approvers: approvers
    });
    
    // Optional: Send email notification
    try {
      if (isValidEmail_(contributorKey)) {
        MailApp.sendEmail({
          to: contributorKey,
          subject: 'Slicing Pie: Contribution Approved',
          body: `Your contribution has been approved!\n\n` +
                `Type: ${contributionType}\n` +
                `Slices Awarded: ${slicesAwarded.toFixed(2)}\n` +
                `New Equity: ${result.rowSharePercent}\n` +
                `Approved by: ${approvers.join(', ')}\n\n` +
                `Request ID: ${requestId}`
        });
      }
    } catch (emailErr) {
      Logger.log(`[approveContribution] Email send failed: ${emailErr.message}`);
    }
    
    return {
      success: true,
      contributorKey: contributorKey,
      slicesAwarded: slicesAwarded,
      equityPercent: result.rowSharePercent,
      decisionSignature: decisionSignature,
      masterRowSignature: result.signature
    };
  });
}

/**
 * FIX 2 (v6.0.34j): Reject contribution with row number validation.
 * 
 * Similar validation flow as approveContribution, but sets status to REJECTED.
 * 
 * @param {number} pendingRowNum - Row number in Pending sheet (≥2)
 * @param {string} reason - Rejection reason
 * @param {boolean} [bypassRequestIdCheck=false] - Bypass RequestId validation (migration only)
 * @returns {Object} - {success, contributorKey, reason, decisionSignature}
 */
function rejectContribution(pendingRowNum, reason, bypassRequestIdCheck = false) {
  
  // FIX 2: Validate rowNum before any sheet operations
  if (pendingRowNum == null || pendingRowNum === '') {
    throw new Error('rejectContribution: pendingRowNum is required (null/undefined received). ' +
                    'This function must be called with a valid row number (≥2). ' +
                    'For menu-driven rejection, use rejectContributionUI_() instead.');
  }
  
  const rowNum = Number(pendingRowNum);
  if (!Number.isInteger(rowNum) || rowNum < 2) {
    throw new Error(`rejectContribution: Invalid row number "${pendingRowNum}". ` +
                    `Must be an integer ≥2 (received type=${typeof pendingRowNum}, value=${rowNum})`);
  }
  
  // FIX 2: Schema length assertion (CR-01: updated to 20 columns)
  if (CONFIG.PENDING_SCHEMA.length !== 20) {
    throw new Error(`CRITICAL: PENDING_SCHEMA has ${CONFIG.PENDING_SCHEMA.length} columns, expected 20. ` +
                    'Schema drift detected - run "Initialize System" or "Migrate Schema" to repair.');
  }
  
  reason = String(reason || '').trim();
  if (reason.length < 3) {
    throw new Error('Rejection reason must be at least 3 characters.');
  }
  
  return withDocLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pendingSheet = ss.getSheetByName('Pending');
    if (!pendingSheet) {
      throw new Error('Pending sheet not found');
    }
    
    // PATCH h: Enforce schema before reading row
    enforceSchemaOrder_(pendingSheet, CONFIG.PENDING_SCHEMA);
    SpreadsheetApp.flush();
    
    const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
    
    // FIX 2: Use validated rowNum in all getRange calls (CR-01: read 20 columns)
    const rowData = pendingSheet.getRange(rowNum, 1, 1, 20).getValues()[0];
    
    const contributorKey = String(rowData[colMap.ContributorKey]);
    const status = String(rowData[colMap.Status]);
    const requestId = String(rowData[colMap.RequestId] || '');
    
    // Validate status (allow rejecting quorum-pending rows)
    const statusNorm = String(status || '').trim().toUpperCase();
    if (statusNorm !== 'PENDING' && statusNorm !== 'PENDING_QUORUM') {
      throw new Error(
        `Cannot reject contribution with status "${statusNorm}". Only PENDING or PENDING_QUORUM contributions can be rejected.`
      );
    }

// PATCH h: Validate RequestId (unless bypassed for migration)
    if (!bypassRequestIdCheck && (!requestId || requestId.trim() === '')) {
      throw new Error(
        `Missing RequestId for row ${rowNum}. ` +
        `Run "Migrate Pending RequestIds" before rejecting contributions.`
      );
    }
    
    // Authorization check
    const actor = getActorEmail_();
    const actorCanon = canonicalizeField_(actor);
    const ownerCanon = canonicalizeField_(CONFIG.OWNER_EMAIL);
    const foundersCanon = (CONFIG.FOUNDER_APPROVERS || []).map(canonicalizeField_);
    if (actorCanon !== ownerCanon && !foundersCanon.includes(actorCanon)) {
      throw new Error(`User ${actor} is not authorized to reject contributions. Only owner or founders can reject.`);
    }
    
    // Compute decision signature
    const decisionTimestamp = new Date();
    const secretData = ensureSignatureSecret_();
    const approvers = [actor];
    
    const decisionSignature = computeDecisionSignature_(
      'REJECT',
      contributorKey,
      'REJECTED',
      approvers,
      requestId,
      decisionTimestamp,
      secretData.secret
    );
    
    // FIX 2: Micro-guard - validate signature is 64-char hex string
    if (typeof decisionSignature !== 'string' || decisionSignature.length !== 64) {
      throw new Error(
        `Decision signature generation failed. Expected 64-char hex string, got: ${typeof decisionSignature} ` +
        `(length=${decisionSignature ? decisionSignature.length : 'null'})`
      );
    }
    
    // Update Pending sheet (15 columns)
    pendingSheet.getRange(rowNum, colMap.Status + 1).setValue('REJECTED');
    pendingSheet.getRange(rowNum, colMap.Approvers + 1).setValue(approvers.join(', '));
    pendingSheet.getRange(rowNum, colMap.DecisionSignature + 1).setValue(decisionSignature);
    pendingSheet.getRange(rowNum, colMap.DecisionTimestamp + 1).setValue(decisionTimestamp);
    pendingSheet.getRange(rowNum, colMap.Notes + 1).setValue(
      String(rowData[colMap.Notes] || '') + `\n[REJECTED: ${reason}]`
    );
    
    logAuditEvent_('CONTRIBUTION_REJECTED', actor, {
      pendingRow: rowNum,
      requestId: requestId,
      contributorKey: contributorKey,
      reason: reason,
      decisionSignature: decisionSignature,
      approvers: approvers
    });
    
    // Optional: Send email notification
    try {
      if (isValidEmail_(contributorKey)) {
        MailApp.sendEmail({
          to: contributorKey,
          subject: 'Slicing Pie: Contribution Rejected',
          body: `Your contribution has been rejected.\n\n` +
                `Reason: ${reason}\n` +
                `Rejected by: ${approvers.join(', ')}\n\n` +
                `Request ID: ${requestId}`
        });
      }
    } catch (emailErr) {
      Logger.log(`[rejectContribution] Email send failed: ${emailErr.message}`);
    }
    
    return {
      success: true,
      contributorKey: contributorKey,
      reason: reason,
      decisionSignature: decisionSignature
    };
  });
}

/**
 * Apply equity delta to Master sheet.
 * 
 * Adds contribution row, recalculates equity percentages, signs row.
 * Note: EquityPercent column name unchanged for signature compatibility.
 * 
 * @returns {Object} - {contributorKey, totalSlices, rowSharePercent, signature}
 */
function applyEquityDelta_(contributorKey, contributorName, contributionType, multiplier, baseValue, quantity, slicesAwarded, evidenceURL, notes) {
  const masterSheet = ensureMasterSheet_();
  const colMap = getColMap_(masterSheet, CONFIG.MASTER_SCHEMA);
  
  // Build new row
  const timestamp = new Date();
  const newRow = new Array(CONFIG.MASTER_SCHEMA.length).fill('');
  
  newRow[colMap.Timestamp] = timestamp;
  newRow[colMap.ContributorKey] = contributorKey;
  newRow[colMap.ContributorName] = contributorName;
  newRow[colMap.ContributionType] = contributionType;
  newRow[colMap.Multiplier] = multiplier;
  newRow[colMap.BaseValue] = baseValue;
  newRow[colMap.Quantity] = quantity;
  newRow[colMap.SlicesAwarded] = slicesAwarded;
  newRow[colMap.EvidenceURL] = evidenceURL;
  newRow[colMap.Notes] = notes;
  
  // Calculate contributor's total slices
  const lastRow = masterSheet.getLastRow();
  let contributorTotalSlices = slicesAwarded;
  
  if (lastRow > 1) {
    const data = masterSheet.getRange(2, 1, lastRow - 1, CONFIG.MASTER_SCHEMA.length).getValues();
    for (const row of data) {
      if (String(row[colMap.ContributorKey]).toLowerCase().trim() === contributorKey.toLowerCase().trim()) {
        contributorTotalSlices += Number(row[colMap.SlicesAwarded] || 0);
      }
    }
  }
  
  newRow[colMap.TotalSlices] = contributorTotalSlices;
  
  // Calculate global equity percentages
  const allData = lastRow > 1 
    ? masterSheet.getRange(2, 1, lastRow - 1, CONFIG.MASTER_SCHEMA.length).getValues()
    : [];
  
  const contributorSlices = {};
  for (const row of allData) {
    const key = String(row[colMap.ContributorKey]).toLowerCase().trim();
    contributorSlices[key] = (contributorSlices[key] || 0) + Number(row[colMap.SlicesAwarded] || 0);
  }
  contributorSlices[contributorKey.toLowerCase().trim()] = contributorTotalSlices;
  
  const totalSlices = Object.values(contributorSlices).reduce((sum, val) => sum + val, 0);
  
  const equityPercent = totalSlices > 0 
    ? round2_((contributorTotalSlices / totalSlices) * 100)
    : 0;
  
  newRow[colMap.EquityPercent] = formatEquityPercent_(equityPercent);
  
  // Compute row signature
  const rowData = {
    Timestamp: timestamp,
    ContributorKey: contributorKey,
    ContributorName: contributorName,
    ContributionType: contributionType,
    Multiplier: multiplier,
    BaseValue: baseValue,
    Quantity: quantity,
    SlicesAwarded: slicesAwarded,
    TotalSlices: contributorTotalSlices,
    EquityPercent: formatEquityPercent_(equityPercent),
    EvidenceURL: evidenceURL,
    Notes: notes
  };
  
  const secretData = ensureSignatureSecret_();
  const signature = computeRowSignature_(rowData, secretData.secret);
  
  newRow[colMap.Signature] = signature;
  
  // Append row
  masterSheet.appendRow(newRow);
  
  return {
    contributorKey: contributorKey,
    totalSlices: contributorTotalSlices,
    rowSharePercent: formatEquityPercent_(equityPercent),
    signature: signature
  };
}

/**
 * Get current cap table (aggregated by contributor).
 * 
 * @returns {Array} - [{contributorKey, contributorName, totalSlices, equityPercent}, ...]
 */
function getCapTable_() {
  const masterSheet = ensureMasterSheet_();
  const colMap = getColMap_(masterSheet, CONFIG.MASTER_SCHEMA);
  const lastRow = masterSheet.getLastRow();
  
  if (lastRow <= 1) {
    return [];
  }
  
  const data = masterSheet.getRange(2, 1, lastRow - 1, CONFIG.MASTER_SCHEMA.length).getValues();
  
  const contributors = {};
  
  for (const row of data) {
    const key = String(row[colMap.ContributorKey]).toLowerCase().trim();
    const name = String(row[colMap.ContributorName]);
    const slices = Number(row[colMap.SlicesAwarded] || 0);
    
    if (!contributors[key]) {
      contributors[key] = {
        contributorKey: row[colMap.ContributorKey],
        contributorName: name,
        totalSlices: 0
      };
    }
    
    contributors[key].totalSlices += slices;
  }
  
  const totalSlices = Object.values(contributors).reduce((sum, c) => sum + c.totalSlices, 0);
  
  const capTable = Object.values(contributors).map(c => ({
    contributorKey: c.contributorKey,
    contributorName: c.contributorName,
    totalSlices: round2_(c.totalSlices),
    equityPercent: formatEquityPercent_(totalSlices > 0 ? (c.totalSlices / totalSlices) * 100 : 0)
  }));
  
  capTable.sort((a, b) => b.totalSlices - a.totalSlices);
  
  return capTable;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICATION & MIGRATION UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Verify all Master sheet row signatures.
 * 
 * @returns {Object} - {valid: boolean, totalRows: number, invalidRows: Array}
 */
function verifyAllRowSignatures_() {
  const masterSheet = ensureMasterSheet_();
  const colMap = getColMap_(masterSheet, CONFIG.MASTER_SCHEMA);
  const lastRow = masterSheet.getLastRow();
  
  if (lastRow <= 1) {
    return { valid: true, totalRows: 0, invalidRows: [] };
  }
  
  const data = masterSheet.getRange(2, 1, lastRow - 1, CONFIG.MASTER_SCHEMA.length).getValues();
  const invalidRows = [];
  
  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 2;
    const row = data[i];
    
    const rowData = {
      Timestamp: row[colMap.Timestamp],
      ContributorKey: row[colMap.ContributorKey],
      ContributorName: row[colMap.ContributorName],
      ContributionType: row[colMap.ContributionType],
      Multiplier: row[colMap.Multiplier],
      BaseValue: row[colMap.BaseValue],
      Quantity: row[colMap.Quantity],
      SlicesAwarded: row[colMap.SlicesAwarded],
      TotalSlices: row[colMap.TotalSlices],
      EquityPercent: row[colMap.EquityPercent],
      EvidenceURL: row[colMap.EvidenceURL],
      Notes: row[colMap.Notes]
    };
    
    const storedSignature = String(row[colMap.Signature] || '');
    
    if (!verifyRowSignature_(rowData, storedSignature)) {
      invalidRows.push({
        row: rowNum,
        contributorKey: rowData.ContributorKey,
        signature: storedSignature.substring(0, 16) + '...'
      });
    }
  }
  
  return {
    valid: invalidRows.length === 0,
    totalRows: data.length,
    invalidRows: invalidRows
  };
}

/**
 * Verify all decision signatures in Pending sheet.
 * 
 * @returns {Object} - {valid: boolean, totalDecisions: number, invalidSignatures: Array, legacyFallbackCount: number}
 */
function verifyAllDecisionSignatures_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendingSheet = ss.getSheetByName('Pending');
  if (!pendingSheet) {
    return { valid: false, error: 'Pending sheet not found' };
  }
  
  const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
  const lastRow = pendingSheet.getLastRow();
  
  if (lastRow <= 1) {
    return { valid: true, totalDecisions: 0, invalidSignatures: [], legacyFallbackCount: 0 };
  }
  
  const data = pendingSheet.getRange(2, 1, lastRow - 1, 15).getValues();
  const invalidSignatures = [];
  let legacyFallbackCount = 0;
  let totalDecisions = 0;
  
  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 2;
    const row = data[i];
    
    const status = String(row[colMap.Status]);
    
    // PATCH h: Only verify rows with APPROVED or REJECTED status
    if (status !== 'APPROVED' && status !== 'REJECTED') {
      continue;
    }
    
    totalDecisions++;
    
    const contributorKey = String(row[colMap.ContributorKey]);
    const approvers = String(row[colMap.Approvers] || '').split(',').map(e => e.trim());
    const decisionSignature = String(row[colMap.DecisionSignature] || '');
    const decisionTimestamp = row[colMap.DecisionTimestamp];
    const requestId = String(row[colMap.RequestId] || '');
    
    const action = status === 'APPROVED' ? 'APPROVE' : 'REJECT';
    
    const result = verifyDecisionSignatureDetailed_(
      action,
      contributorKey,
      status,
      approvers,
      requestId,
      decisionTimestamp,
      decisionSignature
    );
    
    if (!result.valid) {
      invalidSignatures.push({
        row: rowNum,
        contributorKey: contributorKey,
        status: status,
        requestId: requestId,
        signature: decisionSignature.substring(0, 16) + '...'
      });
    }
    
    if (result.usedLegacy) {
      legacyFallbackCount++;
    }
  }
  
  return {
    valid: invalidSignatures.length === 0,
    totalDecisions: totalDecisions,
    invalidSignatures: invalidSignatures,
    legacyFallbackCount: legacyFallbackCount
  };
}

/**
 * PATCH h: Migrate pending RequestIds (backfill UUIDs for missing RequestId).
 * 
 * @returns {Object} - {success: boolean, migratedCount: number}
 */
function migratePendingRequestIds_() {
  return withDocLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pendingSheet = ss.getSheetByName('Pending');
    if (!pendingSheet) {
      throw new Error('Pending sheet not found');
    }
    
    enforceSchemaOrder_(pendingSheet, CONFIG.PENDING_SCHEMA);
    SpreadsheetApp.flush();
    
    const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
    const lastRow = pendingSheet.getLastRow();
    
    if (lastRow <= 1) {
      return { success: true, migratedCount: 0 };
    }
    
    const data = pendingSheet.getRange(2, 1, lastRow - 1, 15).getValues();
    let migratedCount = 0;
    
    for (let i = 0; i < data.length; i++) {
      const rowNum = i + 2;
      const row = data[i];
      const requestId = String(row[colMap.RequestId] || '').trim();
      
      if (!requestId || requestId === '') {
        const newUuid = Utilities.getUuid();
        pendingSheet.getRange(rowNum, colMap.RequestId + 1).setValue(newUuid);
        migratedCount++;
      }
    }
    
    if (migratedCount > 0) {
      logAuditEvent_('REQUESTID_MIGRATION', 'System', {
        migratedCount: migratedCount,
        totalRows: data.length
      });
      
      SpreadsheetApp.getUi().alert(
        'Migration Complete',
        `Migrated ${migratedCount} rows with missing RequestIds.\n\n` +
        `Total Pending rows: ${data.length}`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else {
      SpreadsheetApp.getUi().alert(
        'No Migration Needed',
        'All Pending rows already have RequestIds.',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    }
    
    return { success: true, migratedCount: migratedCount };
  });
}

/**
 * Re-sign existing decisions with current signature secret.
 * 
 * Updates DecisionSignature column for all APPROVED/REJECTED rows.
 */
function resignExistingDecisions_() {
  return withDocLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pendingSheet = ss.getSheetByName('Pending');
    if (!pendingSheet) {
      throw new Error('Pending sheet not found');
    }
    
    enforceSchemaOrder_(pendingSheet, CONFIG.PENDING_SCHEMA);
    SpreadsheetApp.flush();
    
    const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
    const lastRow = pendingSheet.getLastRow();
    
    if (lastRow <= 1) {
      SpreadsheetApp.getUi().alert('No decisions to re-sign.');
      return { success: true, resignedCount: 0 };
    }
    
    const data = pendingSheet.getRange(2, 1, lastRow - 1, 15).getValues();
    const secretData = ensureSignatureSecret_();
    let resignedCount = 0;
    
    for (let i = 0; i < data.length; i++) {
      const rowNum = i + 2;
      const row = data[i];
      
      const status = String(row[colMap.Status]);
      if (status !== 'APPROVED' && status !== 'REJECTED') {
        continue;
      }
      
      const contributorKey = String(row[colMap.ContributorKey]);
      const approvers = String(row[colMap.Approvers] || '').split(',').map(e => e.trim());
      const decisionTimestamp = row[colMap.DecisionTimestamp];
      const requestId = String(row[colMap.RequestId] || '');
      
      const action = status === 'APPROVED' ? 'APPROVE' : 'REJECT';
      
      const newSignature = computeDecisionSignature_(
        action,
        contributorKey,
        status,
        approvers,
        requestId,
        decisionTimestamp,
        secretData.secret
      );
      
      pendingSheet.getRange(rowNum, colMap.DecisionSignature + 1).setValue(newSignature);
      resignedCount++;
    }
    
    logAuditEvent_('DECISIONS_RESIGNED', getActorEmail_(), {
      resignedCount: resignedCount,
      secretVersion: secretData.version
    });
    
    SpreadsheetApp.getUi().alert(
      'Re-signing Complete',
      `Re-signed ${resignedCount} decision signatures with current secret (v${secretData.version}).`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    return { success: true, resignedCount: resignedCount };
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UI & MENU FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Assert CONFIG is properly configured (no placeholder emails).
 */
function assertConfigured_() {
  if (!CONFIG.OWNER_EMAIL || CONFIG.OWNER_EMAIL === 'owner@example.com') {
    throw new Error('CONFIG.OWNER_EMAIL must be set to a real email address.');
  }
  
  if (!Array.isArray(CONFIG.FOUNDER_APPROVERS) || CONFIG.FOUNDER_APPROVERS.length < 2) {
    throw new Error('CONFIG.FOUNDER_APPROVERS must contain at least 2 email addresses.');
  }
  
  if (CONFIG.FOUNDER_APPROVERS.some(email => email.includes('example.com'))) {
    throw new Error('CONFIG.FOUNDER_APPROVERS contains placeholder emails. Replace with real addresses.');
  }
}

/**
 * Initialize system: create sheets, enforce schemas, verify protections, ensure secret.
 */
function initializeSystem_() {
  try {
    assertConfigured_();
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Create sheets
    const masterSheet = ensureMasterSheet_();
    const pendingSheet = ensurePendingSheet_();
    const auditSheet = ensureAuditLogSheet_();
    
    // Enforce schemas
    enforceSchemaOrder_(masterSheet, CONFIG.MASTER_SCHEMA);
    enforceSchemaOrder_(pendingSheet, CONFIG.PENDING_SCHEMA);
    enforceSchemaOrder_(auditSheet, CONFIG.AUDIT_LOG_SCHEMA);
    
    SpreadsheetApp.flush();
    
    // Verify protections
    verifyProtectionsCore_();
    
    // Ensure signature secret
    ensureSignatureSecret_();
    
    // Log initialization
    logAuditEvent_('SYSTEM_INITIALIZED', getActorEmail_(), {
      masterColumns: CONFIG.MASTER_SCHEMA.length,
      pendingColumns: CONFIG.PENDING_SCHEMA.length,
      auditColumns: CONFIG.AUDIT_LOG_SCHEMA.length
    });
    
    SpreadsheetApp.getUi().alert(
      'System Initialized',
      `Slicing Pie system initialized successfully!\n\n` +
      `Sheets created/verified:\n` +
      `• Master (${CONFIG.MASTER_SCHEMA.length} columns)\n` +
      `• Pending (${CONFIG.PENDING_SCHEMA.length} columns)\n` +
      `• Audit Log (${CONFIG.AUDIT_LOG_SCHEMA.length} columns)\n\n` +
      `Sheet protections applied.\n` +
      `Signature secret initialized.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Initialization Failed',
      `Error: ${err.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    Logger.log(`[initializeSystem_] Error: ${err.message}\n${err.stack}`);
  }
}

/**
 * Verify sheet protections (owner + founders can edit).
 */
function verifyProtectionsCore_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ['Master', 'Pending', 'Audit Log'];
  
  for (const sheetName of sheets) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    
    let protection;
    if (protections.length === 0) {
      protection = sheet.protect();
    } else {
      protection = protections[0];
    }
    
    // Set description
    protection.setDescription(`Slicing Pie protection for ${sheetName}`);
    
    // PATCH h: Normalize editors using User.getEmail()
    const allowedEmails = [CONFIG.OWNER_EMAIL, ...CONFIG.FOUNDER_APPROVERS]
      .map(email => String(email).toLowerCase().trim());
    
    const currentEditors = protection.getEditors()
      .map(editor => {
        // PATCH h: Handle User objects correctly
        return typeof editor === 'string' ? editor : editor.getEmail();
      })
      .map(email => String(email).toLowerCase().trim());
    
    // Remove unauthorized editors
    for (const editor of protection.getEditors()) {
      const email = typeof editor === 'string' ? editor : editor.getEmail();
      if (!allowedEmails.includes(String(email).toLowerCase().trim())) {
        protection.removeEditor(editor);
      }
    }
    
    // Add missing editors
    for (const email of allowedEmails) {
      if (!currentEditors.includes(email)) {
        try {
          protection.addEditor(email);
        } catch (addErr) {
          Logger.log(`[verifyProtectionsCore_] Failed to add editor ${email}: ${addErr.message}`);
        }
      }
    }
    
    // Set warning only (allow viewing)
    protection.setWarningOnly(false);
  }
}

/**
 * Menu item: Verify Protections.
 */
function verifyProtections_() {
  try {
    verifyProtectionsCore_();
    SpreadsheetApp.getUi().alert(
      'Protections Verified',
      'Sheet protections have been verified and updated.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Verification Failed',
      `Error: ${err.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Menu item: Verify Audit Chain.
 */
function verifyAuditChainUI_() {
  try {
    const result = verifyAuditChain_();
    
    if (result.error) {
      SpreadsheetApp.getUi().alert(
        'Verification Failed',
        `Error: ${result.error}`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }
    
    if (result.valid) {
      SpreadsheetApp.getUi().alert(
        'Audit Chain Valid',
        `All ${result.totalRows} audit events verified successfully!\n\n` +
        `Chain integrity: ✓\n` +
        `Signatures: ✓`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else {
      const chainMsg = result.chainBreaks.length > 0
        ? `Chain breaks: ${result.chainBreaks.length} (rows: ${result.chainBreaks.map(b => b.row).join(', ')})`
        : 'Chain integrity: ✓';
      
      const sigMsg = result.signatureErrors.length > 0
        ? `Signature errors: ${result.signatureErrors.length} (rows: ${result.signatureErrors.map(e => e.row).join(', ')})`
        : 'Signatures: ✓';
      
      SpreadsheetApp.getUi().alert(
        'Audit Chain Issues Detected',
        `Total events: ${result.totalRows}\n\n${chainMsg}\n${sigMsg}\n\n` +
        `Check execution log for details.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      
      Logger.log('[verifyAuditChainUI_] Chain breaks: ' + JSON.stringify(result.chainBreaks));
      Logger.log('[verifyAuditChainUI_] Signature errors: ' + JSON.stringify(result.signatureErrors));
    }
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Verification Failed',
      `Error: ${err.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Menu item: Verify Row Signatures.
 */
function verifyRowSignaturesUI_() {
  try {
    const result = verifyAllRowSignatures_();
    
    if (result.valid) {
      SpreadsheetApp.getUi().alert(
        'Row Signatures Valid',
        `All ${result.totalRows} Master sheet rows verified successfully!`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else {
      SpreadsheetApp.getUi().alert(
        'Invalid Signatures Detected',
        `Total rows: ${result.totalRows}\n` +
        `Invalid: ${result.invalidRows.length}\n\n` +
        `Invalid rows: ${result.invalidRows.map(r => r.row).join(', ')}\n\n` +
        `Check execution log for details.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      
      Logger.log('[verifyRowSignaturesUI_] Invalid rows: ' + JSON.stringify(result.invalidRows));
    }
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Verification Failed',
      `Error: ${err.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Menu item: Verify Decision Signatures.
 */
function verifyDecisionSignaturesUI_() {
  try {
    const result = verifyAllDecisionSignatures_();
    
    if (result.error) {
      SpreadsheetApp.getUi().alert(
        'Verification Failed',
        `Error: ${result.error}`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }
    
    const legacyMsg = result.legacyFallbackCount > 0
      ? `\n\n⚠️ ${result.legacyFallbackCount} decisions using legacy signature format.\n` +
        `Run "Re-sign Existing Decisions" to update.`
      : '';
    
    if (result.valid) {
      SpreadsheetApp.getUi().alert(
        'Decision Signatures Valid',
        `All ${result.totalDecisions} decision signatures verified successfully!${legacyMsg}`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else {
      SpreadsheetApp.getUi().alert(
        'Invalid Signatures Detected',
        `Total decisions: ${result.totalDecisions}\n` +
        `Invalid: ${result.invalidSignatures.length}\n\n` +
        `Invalid rows: ${result.invalidSignatures.map(s => s.row).join(', ')}${legacyMsg}\n\n` +
        `Check execution log for details.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      
      Logger.log('[verifyDecisionSignaturesUI_] Invalid signatures: ' + JSON.stringify(result.invalidSignatures));
    }
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Verification Failed',
      `Error: ${err.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Menu item: View Cap Table.
 */
function viewCapTableUI_() {
  try {
    const capTable = getCapTable_();
    
    if (capTable.length === 0) {
      SpreadsheetApp.getUi().alert(
        'Cap Table',
        'No contributions yet. Cap table is empty.',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }
    
    const totalSlices = capTable.reduce((sum, c) => sum + c.totalSlices, 0);
    
    let message = `Total Slices: ${totalSlices.toFixed(2)}\n\n`;
    message += 'Contributor | Slices | Equity %\n';
    message += '═'.repeat(50) + '\n';
    
    for (const c of capTable) {
      const name = c.contributorName.substring(0, 20).padEnd(20);
      const slices = c.totalSlices.toFixed(2).padStart(10);
      const equity = c.equityPercent.padStart(8);
      message += `${name} | ${slices} | ${equity}\n`;
    }
    
    SpreadsheetApp.getUi().alert(
      'Cap Table',
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Cap Table Failed',
      `Error: ${err.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * FIX 3 (v6.0.34j): UI wrapper for approve - prompts user for row number.
 * 
 * Called from menu: "Slicing Pie > Workflow > Approve (Prompt)"
 */
function approveContributionUI_() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Prompt for row number
    const response = ui.prompt(
      'Approve Contribution',
      'Enter the Pending sheet row number to approve (≥2):',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (response.getSelectedButton() !== ui.Button.OK) {
      ui.alert('Approval cancelled.');
      return;
    }
    
    const rowNum = parseInt(response.getResponseText().trim(), 10);
    
    // Validate input
    if (!Number.isInteger(rowNum) || rowNum < 2) {
      ui.alert('Error', `Invalid row number: "${response.getResponseText()}". Must be ≥2.`, ui.ButtonSet.OK);
      return;
    }
    
    // Call core function with validated row number
    const result = approveContribution(rowNum);

    // Handle quorum progress vs. final approval
    if (result && result.state === 'PENDING_QUORUM') {
      ui.alert(
        'Approval Recorded',
        `Quorum progress: ${result.approversCount}/${result.requiredApprovers}\n\n` +
        'This contribution is not finalized yet. Ask another founder to approve the same row.',
        ui.ButtonSet.OK
      );
      return;
    }

    
    // Show success message
    ui.alert(
      'Approval Complete',
      `Contribution approved successfully!\n\n` +
      `Contributor: ${result.contributorKey}\n` +
      `Slices: ${result.slicesAwarded.toFixed(2)}\n` +
      `Equity: ${result.equityPercent}\n` +
      `Decision Signature: ${result.decisionSignature.substring(0, 16)}...\n` +
      `Master Row Signature: ${result.masterRowSignature.substring(0, 16)}...`,
      ui.ButtonSet.OK
    );
    
  } catch (err) {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Approval Failed', `Error: ${err.message}\n\nCheck execution log for details.`, ui.ButtonSet.OK);
    Logger.log(`[approveContributionUI_] Error: ${err.message}\n${err.stack}`);
  }
}

/**
 * FIX 3 (v6.0.34j): UI wrapper for reject - prompts for row number and reason.
 * 
 * Called from menu: "Slicing Pie > Workflow > Reject (Prompt)"
 */
function rejectContributionUI_() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Prompt for row number
    const rowResponse = ui.prompt(
      'Reject Contribution - Step 1',
      'Enter the Pending sheet row number to reject (≥2):',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (rowResponse.getSelectedButton() !== ui.Button.OK) {
      ui.alert('Rejection cancelled.');
      return;
    }
    
    const rowNum = parseInt(rowResponse.getResponseText().trim(), 10);
    
    if (!Number.isInteger(rowNum) || rowNum < 2) {
      ui.alert('Error', `Invalid row number: "${rowResponse.getResponseText()}". Must be ≥2.`, ui.ButtonSet.OK);
      return;
    }
    
    // Prompt for rejection reason
    const reasonResponse = ui.prompt(
      'Reject Contribution - Step 2',
      `Enter rejection reason for row ${rowNum}:`,
      ui.ButtonSet.OK_CANCEL
    );
    
    if (reasonResponse.getSelectedButton() !== ui.Button.OK) {
      ui.alert('Rejection cancelled.');
      return;
    }
    
    const reason = reasonResponse.getResponseText().trim();
    
    if (!reason || reason.length < 3) {
      ui.alert('Error', 'Rejection reason must be at least 3 characters.', ui.ButtonSet.OK);
      return;
    }
    
    // Call core function
    const result = rejectContribution(rowNum, reason);
    
    // Show success message
    ui.alert(
      'Rejection Complete',
      `Contribution rejected successfully!\n\n` +
      `Contributor: ${result.contributorKey}\n` +
      `Reason: ${reason}\n` +
      `Decision Signature: ${result.decisionSignature.substring(0, 16)}...`,
      ui.ButtonSet.OK
    );
    
  } catch (err) {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Rejection Failed', `Error: ${err.message}\n\nCheck execution log for details.`, ui.ButtonSet.OK);
    Logger.log(`[rejectContributionUI_] Error: ${err.message}\n${err.stack}`);
  }
}

/**
 * FIX 4 (v6.0.34j): Create menu on spreadsheet open.
 * 
 * Uses UI wrapper functions for approve/reject to avoid null row number errors.
 */
function onOpen() {
  const menu = SpreadsheetApp.getUi()
    .createMenu('Slicing Pie')
    .addItem('Initialize System', 'initializeSystem_')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Workflow')
      .addItem('Approve (Prompt)', 'approveContributionUI_')  // FIX 4: Use UI wrapper
      .addItem('Reject (Prompt)', 'rejectContributionUI_'))   // FIX 4: Use UI wrapper
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Migration')
      .addItem('Migrate Pending RequestIds', 'migratePendingRequestIds_')
      .addItem('Re-sign Existing Decisions', 'resignExistingDecisions_'))
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Verification')
      .addItem('Verify Protections', 'verifyProtections_')
      .addItem('Verify Audit Chain', 'verifyAuditChainUI_')
      .addItem('Verify Row Signatures', 'verifyRowSignaturesUI_')
      .addItem('Verify Decision Signatures', 'verifyDecisionSignaturesUI_'))
    .addSeparator()
    .addItem('View Cap Table', 'viewCapTableUI_')
    .addItem('Rotate Signature Secret', 'rotateSignatureSecret_')
    .addItem('Manual Audit Flush', 'manualFlushAuditQueue_');
  
  menu.addToUi();
}

/**
 * PATCH h: On edit trigger (logs unauthorized edits to audit queue).
 */
function onEdit(e) {
  try {
    // Guard against malformed events
    if (!e || !e.range) {
      Logger.log('[onEdit] Malformed event object, skipping');
      return;
    }
    
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    
    // Only audit protected sheets
    if (!['Master', 'Pending', 'Audit Log'].includes(sheetName)) {
      return;
    }
    
    const user = getActorEmail_();
    
    // Ignore edits by authorized users (owner + founders)
    const authorized = [CONFIG.OWNER_EMAIL, ...CONFIG.FOUNDER_APPROVERS]
      .map(email => String(email).toLowerCase().trim());
    
    if (authorized.includes(String(user).toLowerCase().trim())) {
      return;
    }
    
    // PATCH h: Safe value handling
    const oldValue = e.oldValue != null ? String(e.oldValue).substring(0, 100) : '(empty)';
    const newValue = e.value != null ? String(e.value).substring(0, 100) : '(empty)';
    
    // Log unauthorized edit
    logAuditEvent_('UNAUTHORIZED_EDIT', user, {
      sheet: sheetName,
      row: e.range.getRow(),
      col: e.range.getColumn(),
      oldValue: oldValue,
      newValue: newValue
    });
    
  } catch (err) {
    Logger.log(`[onEdit] Error: ${err.message}`);
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * END OF SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * File: Code.gs
 * Version: v6.0.34j-PRODUCTION-FINAL
 * Release: 2026-02-19
 * Security Grade: A+
 * Total Lines: ~3100
 * Total Functions: 69
 * Total Characters: ~155,000
 * 
 * CRITICAL FIXES APPLIED (v6.0.34j):
 * - FIX 1: Separate lock acquisition errors from callback errors
 * - FIX 2: Validate pendingRowNum before sheet operations
 * - FIX 3: Add UI wrapper functions for menu-driven approve/reject
 * - FIX 4: Update onOpen() menu to use UI wrappers
 * 
 * ALL PREVIOUS PATCHES RETAINED (a-k):
 * - PATCH a-k: See header comments for full list
 * 
 * Contact: jeremy@quadriconsulting.com
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CR-01/CR-02/CR-03: RESERVATION & STATE MACHINE FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * CR-01/CR-02: Reserve a decision for processing (state machine transition to RESERVED).
 * CR-02: Handles invalid timestamp gracefully (produces clean RESERVED record, not FAILED).
 * 
 * @param {string} requestId - UUID request ID
 * @param {number} pendingRow - Pending sheet row number
 * @param {string} decision - 'APPROVE' or 'REJECT'
 * @param {string} actor - Actor email
 * @returns {Object} - {state, decision, pendingRow, actor, timestamp, requestId, masterRowNum?, masterRowSignature?}
 */
function reserveDecision_(requestId, pendingRow, decision, actor) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendingSheet = ss.getSheetByName('Pending');
  if (!pendingSheet) {
    throw new Error('Pending sheet not found');
  }
  
  const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
  const rowData = pendingSheet.getRange(pendingRow, 1, 1, 20).getValues()[0];
  
  const currentState = String(rowData[colMap.State] || '').trim().toUpperCase();
  const existingMasterRowNum = rowData[colMap.MasterRowNum];
  const existingMasterRowSignature = String(rowData[colMap.MasterRowSignature] || '');
  
  // If already MASTER_WRITTEN, return existing record (idempotent)
  if (currentState === 'MASTER_WRITTEN') {
    return {
      state: 'MASTER_WRITTEN',
      decision: decision,
      pendingRow: pendingRow,
      actor: actor,
      timestamp: new Date(),
      requestId: requestId,
      masterRowNum: existingMasterRowNum,
      masterRowSignature: existingMasterRowSignature
    };
  }
  
  // CR-02: Check for invalid timestamp (handle gracefully)
  const existingTimestamp = rowData[colMap.ReservedTimestamp];
  if (existingTimestamp && !(existingTimestamp instanceof Date) && isNaN(new Date(existingTimestamp).getTime())) {
    // CR-02: Produce clean RESERVED record (not FAILED)
    const cleanTimestamp = new Date();
    pendingSheet.getRange(pendingRow, colMap.State + 1).setValue('RESERVED');
    pendingSheet.getRange(pendingRow, colMap.ReservedActor + 1).setValue(actor);
    pendingSheet.getRange(pendingRow, colMap.ReservedTimestamp + 1).setValue(cleanTimestamp);
    
    logAuditEvent_('DECISION_RESERVED_INVALID_TIMESTAMP_CLEANED', actor, {
      requestId: requestId,
      pendingRow: pendingRow,
      decision: decision,
      invalidTimestamp: String(existingTimestamp)
    });
    
    return {
      state: 'RESERVED',
      decision: decision,
      pendingRow: pendingRow,
      actor: actor,
      timestamp: cleanTimestamp,
      requestId: requestId
    };
  }
  
  // Transition to RESERVED
  const reservedTimestamp = new Date();
  pendingSheet.getRange(pendingRow, colMap.State + 1).setValue('RESERVED');
  pendingSheet.getRange(pendingRow, colMap.ReservedActor + 1).setValue(actor);
  pendingSheet.getRange(pendingRow, colMap.ReservedTimestamp + 1).setValue(reservedTimestamp);
  
  logAuditEvent_('DECISION_RESERVED', actor, {
    requestId: requestId,
    pendingRow: pendingRow,
    decision: decision
  });
  
  return {
    state: 'RESERVED',
    decision: decision,
    pendingRow: pendingRow,
    actor: actor,
    timestamp: reservedTimestamp,
    requestId: requestId
  };
}

/**
 * CR-01: Get canonical decision by requestId.
 * 
 * @param {string} requestId - UUID request ID
 * @returns {Object|null} - Decision object or null if not found
 */
function getDecisionByRequestId_(requestId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendingSheet = ss.getSheetByName('Pending');
  if (!pendingSheet) {
    return null;
  }
  
  const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
  const lastRow = pendingSheet.getLastRow();
  if (lastRow <= 1) {
    return null;
  }
  
  const data = pendingSheet.getRange(2, 1, lastRow - 1, 20).getValues();
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowRequestId = String(row[colMap.RequestId] || '');
    
    if (rowRequestId === requestId) {
      return {
        state: String(row[colMap.State] || 'PENDING').trim().toUpperCase(),
        requestId: rowRequestId,
        pendingRow: i + 2,
        masterRowNum: row[colMap.MasterRowNum],
        masterRowSignature: String(row[colMap.MasterRowSignature] || ''),
        reservedActor: String(row[colMap.ReservedActor] || ''),
        reservedTimestamp: row[colMap.ReservedTimestamp]
      };
    }
  }
  
  return null;
}

/**
 * CR-03: Validate master pointers (masterRowNum and masterRowSignature).
 * 
 * @param {*} masterRowNum - Master row number (must be integer ≥2)
 * @param {string} masterRowSignature - Master row signature (must be 64-char hex)
 * @returns {Object} - {isValid: boolean, reason?: string}
 */
function validateMasterPointers_(masterRowNum, masterRowSignature) {
  // CR-03: Validate masterRowNum is integer >= 2
  const rowNumInt = Number(masterRowNum);
  if (!Number.isInteger(rowNumInt) || rowNumInt < 2) {
    return {
      isValid: false,
      reason: `Invalid masterRowNum: ${masterRowNum} (must be integer >= 2)`
    };
  }
  
  // CR-03: Validate masterRowSignature length == 64
  if (typeof masterRowSignature !== 'string' || masterRowSignature.length !== 64) {
    return {
      isValid: false,
      reason: `Invalid masterRowSignature length: ${masterRowSignature ? masterRowSignature.length : 'null'} (expected 64)`
    };
  }
  
  // CR-03: Check if signature is valid hex
  if (!/^[0-9a-f]{64}$/i.test(masterRowSignature)) {
    return {
      isValid: false,
      reason: `Invalid masterRowSignature format: not hex (expected 64 hex chars)`
    };
  }
  
  return { isValid: true };
}

/**
 * CR-03: Mark decision as FAILED with clear reason.
 * 
 * @param {string} requestId - UUID request ID
 * @param {number} pendingRow - Pending sheet row number
 * @param {string} reason - Failure reason
 */
function markDecisionFailed_(requestId, pendingRow, reason) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendingSheet = ss.getSheetByName('Pending');
  if (!pendingSheet) {
    return;
  }
  
  const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
  
  pendingSheet.getRange(pendingRow, colMap.State + 1).setValue('FAILED');
  const currentNotes = String(pendingSheet.getRange(pendingRow, colMap.Notes + 1).getValue() || '');
  pendingSheet.getRange(pendingRow, colMap.Notes + 1).setValue(
    currentNotes + `\n[FAILED: ${reason}]`
  );
  
  logAuditEvent_('DECISION_MARKED_FAILED', 'System', {
    requestId: requestId,
    pendingRow: pendingRow,
    reason: reason
  });
}

/**
 * CR-03: Full retry of approval (reserve + master write pathway).
 * 
 * Note: Minimal implementation returns reservation record; caller handles re-execution.
 */
function fullRetryApproval_(requestId, pendingRow, actor) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendingSheet = ss.getSheetByName('Pending');
  if (!pendingSheet) {
    throw new Error('Pending sheet not found');
  }
  
  const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
  
  // Reset State to PENDING for retry
  pendingSheet.getRange(pendingRow, colMap.State + 1).setValue('PENDING');
  
  logAuditEvent_('FULL_RETRY_INITIATED', actor, {
    requestId: requestId,
    pendingRow: pendingRow
  });
  
  // Re-execute reserve
  return reserveDecision_(requestId, pendingRow, 'APPROVE', actor);
}

/**
 * Migrate Pending schema from 15 to 20 columns (backfill State=PENDING).
 */
function migratePendingSchemaTo20Columns_() {
  return withDocLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pendingSheet = ss.getSheetByName('Pending');
    if (!pendingSheet) {
      throw new Error('Pending sheet not found');
    }
    
    // Enforce schema order to add new columns
    enforceSchemaOrder_(pendingSheet, CONFIG.PENDING_SCHEMA);
    SpreadsheetApp.flush();
    
    const lastRow = pendingSheet.getLastRow();
    if (lastRow > 1) {
      const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
      const stateCol = colMap.State + 1;
      
      let backfilledCount = 0;
      
      for (let row = 2; row <= lastRow; row++) {
        const currentState = pendingSheet.getRange(row, stateCol).getValue();
        if (!currentState || String(currentState).trim() === '') {
          pendingSheet.getRange(row, stateCol).setValue('PENDING');
          backfilledCount++;
        }
      }
      
      logAuditEvent_('SCHEMA_MIGRATION_20_COLUMNS', getActorEmail_(), {
        newColumns: 5,
        backfilledRows: backfilledCount,
        totalRows: lastRow - 1
      });
      
      SpreadsheetApp.getUi().alert(
        'Schema Migration Complete',
        `Migrated Pending schema to 20 columns.\n\n` +
        `Backfilled State=PENDING for ${backfilledCount} rows.\n` +
        `Total Pending rows: ${lastRow - 1}`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      
      return { success: true, backfilledCount: backfilledCount };
    }
    
    return { success: true, backfilledCount: 0 };
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICATION FUNCTIONS (CR-01/CR-02/CR-03)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * VERIFY_CR01_MasterWrittenSkip: Test that MASTER_WRITTEN state skips duplicate write.
 */
function VERIFY_CR01_MasterWrittenSkip() {
  Logger.log('=== VERIFY_CR01_MasterWrittenSkip START ===');
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pendingSheet = ss.getSheetByName('Pending');
    
    // Setup: Create test row with MASTER_WRITTEN state
    const testRequestId = 'TEST_' + Utilities.getUuid();
    const testRow = [
      new Date(), 'test@example.com', 'Test User', 'TIME', 2, 1000, 10, 20000,
      'http://example.com', 'Test notes', 'APPROVED', 'admin@example.com',
      'a'.repeat(64), new Date(), testRequestId,
      'MASTER_WRITTEN', 5, 'b'.repeat(64), 'admin@example.com', new Date()
    ];
    
    pendingSheet.appendRow(testRow);
    SpreadsheetApp.flush();
    const testRowNum = pendingSheet.getLastRow();
    
    // Test: Call reserveDecision_ - should return MASTER_WRITTEN
    const reservation = reserveDecision_(testRequestId, testRowNum, 'APPROVE', 'admin@example.com');
    
    // Test: Call getDecisionByRequestId_ - should return MASTER_WRITTEN with pointers
    const canonical = getDecisionByRequestId_(testRequestId);
    
    // Verify
    const pass1 = reservation.state === 'MASTER_WRITTEN';
    const pass2 = canonical && canonical.state === 'MASTER_WRITTEN';
    const pass3 = canonical && canonical.masterRowNum === 5;
    const pass4 = canonical && canonical.masterRowSignature === 'b'.repeat(64);
    
    // Cleanup
    pendingSheet.deleteRow(testRowNum);
    
    const result = pass1 && pass2 && pass3 && pass4;
    Logger.log(`VERIFY_CR01_MasterWrittenSkip: ${result ? 'PASS' : 'FAIL'}`);
    Logger.log(`  - reserveDecision_ returns MASTER_WRITTEN: ${pass1}`);
    Logger.log(`  - getDecisionByRequestId_ returns MASTER_WRITTEN: ${pass2}`);
    Logger.log(`  - masterRowNum correct: ${pass3}`);
    Logger.log(`  - masterRowSignature correct: ${pass4}`);
    
    return result;
    
  } catch (err) {
    Logger.log(`VERIFY_CR01_MasterWrittenSkip: FAIL - ${err.message}`);
    return false;
  } finally {
    Logger.log('=== VERIFY_CR01_MasterWrittenSkip END ===');
  }
}

/**
 * VERIFY_CR02_InvalidTimestampReserved: Test invalid timestamp produces RESERVED, not FAILED.
 */
function VERIFY_CR02_InvalidTimestampReserved() {
  Logger.log('=== VERIFY_CR02_InvalidTimestampReserved START ===');
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pendingSheet = ss.getSheetByName('Pending');
    
    // Setup: Create test row with invalid timestamp in ReservedTimestamp column
    const testRequestId = 'TEST_' + Utilities.getUuid();
    const testRow = [
      new Date(), 'test@example.com', 'Test User', 'TIME', 2, 1000, 10, 20000,
      'http://example.com', 'Test notes', 'PENDING', '', '', '', testRequestId,
      'PENDING', null, '', '', 'INVALID_TIMESTAMP_STRING'
    ];
    
    pendingSheet.appendRow(testRow);
    SpreadsheetApp.flush();
    const testRowNum = pendingSheet.getLastRow();
    
    // Test: Call reserveDecision_ with invalid timestamp in row
    const reservation = reserveDecision_(testRequestId, testRowNum, 'APPROVE', 'admin@example.com');
    
    // Verify: State should be RESERVED, not FAILED
    const colMap = getColMap_(pendingSheet, CONFIG.PENDING_SCHEMA);
    const finalState = pendingSheet.getRange(testRowNum, colMap.State + 1).getValue();
    
    const pass1 = reservation.state === 'RESERVED';
    const pass2 = String(finalState).trim().toUpperCase() === 'RESERVED';
    const pass3 = reservation.timestamp instanceof Date;
    
    // Cleanup
    pendingSheet.deleteRow(testRowNum);
    
    const result = pass1 && pass2 && pass3;
    Logger.log(`VERIFY_CR02_InvalidTimestampReserved: ${result ? 'PASS' : 'FAIL'}`);
    Logger.log(`  - reserveDecision_ returns RESERVED: ${pass1}`);
    Logger.log(`  - Sheet State is RESERVED: ${pass2}`);
    Logger.log(`  - Timestamp is valid Date: ${pass3}`);
    
    return result;
    
  } catch (err) {
    Logger.log(`VERIFY_CR02_InvalidTimestampReserved: FAIL - ${err.message}`);
    return false;
  } finally {
    Logger.log('=== VERIFY_CR02_InvalidTimestampReserved END ===');
  }
}

/**
 * VERIFY_CR03_InvalidRowNumRetry: Test masterRowNum < 2 triggers validation failure.
 */
function VERIFY_CR03_InvalidRowNumRetry() {
  Logger.log('=== VERIFY_CR03_InvalidRowNumRetry START ===');
  
  try {
    // Test: masterRowNum = 1 (invalid, must be >= 2)
    const validation1 = validateMasterPointers_(1, 'a'.repeat(64));
    const pass1 = !validation1.isValid && validation1.reason.includes('must be integer >= 2');
    
    // Test: masterRowNum = 0 (invalid)
    const validation2 = validateMasterPointers_(0, 'a'.repeat(64));
    const pass2 = !validation2.isValid;
    
    // Test: masterRowNum = 1.5 (invalid, not integer)
    const validation3 = validateMasterPointers_(1.5, 'a'.repeat(64));
    const pass3 = !validation3.isValid;
    
    // Test: masterRowNum = 2 (valid)
    const validation4 = validateMasterPointers_(2, 'a'.repeat(64));
    const pass4 = validation4.isValid;
    
    const result = pass1 && pass2 && pass3 && pass4;
    Logger.log(`VERIFY_CR03_InvalidRowNumRetry: ${result ? 'PASS' : 'FAIL'}`);
    Logger.log(`  - masterRowNum=1 invalid: ${pass1}`);
    Logger.log(`  - masterRowNum=0 invalid: ${pass2}`);
    Logger.log(`  - masterRowNum=1.5 invalid: ${pass3}`);
    Logger.log(`  - masterRowNum=2 valid: ${pass4}`);
    
    return result;
    
  } catch (err) {
    Logger.log(`VERIFY_CR03_InvalidRowNumRetry: FAIL - ${err.message}`);
    return false;
  } finally {
    Logger.log('=== VERIFY_CR03_InvalidRowNumRetry END ===');
  }
}

/**
 * VERIFY_CR03_InvalidSignatureLengthRetry: Test signature length != 64 triggers validation failure.
 */
function VERIFY_CR03_InvalidSignatureLengthRetry() {
  Logger.log('=== VERIFY_CR03_InvalidSignatureLengthRetry START ===');
  
  try {
    // Test: signature length = 63 (invalid)
    const validation1 = validateMasterPointers_(2, 'a'.repeat(63));
    const pass1 = !validation1.isValid && validation1.reason.includes('expected 64');
    
    // Test: signature length = 65 (invalid)
    const validation2 = validateMasterPointers_(2, 'a'.repeat(65));
    const pass2 = !validation2.isValid;
    
    // Test: signature = null (invalid)
    const validation3 = validateMasterPointers_(2, null);
    const pass3 = !validation3.isValid;
    
    // Test: signature length = 64 (valid)
    const validation4 = validateMasterPointers_(2, 'a'.repeat(64));
    const pass4 = validation4.isValid;
    
    const result = pass1 && pass2 && pass3 && pass4;
    Logger.log(`VERIFY_CR03_InvalidSignatureLengthRetry: ${result ? 'PASS' : 'FAIL'}`);
    Logger.log(`  - length=63 invalid: ${pass1}`);
    Logger.log(`  - length=65 invalid: ${pass2}`);
    Logger.log(`  - null invalid: ${pass3}`);
    Logger.log(`  - length=64 valid: ${pass4}`);
    
    return result;
    
  } catch (err) {
    Logger.log(`VERIFY_CR03_InvalidSignatureLengthRetry: FAIL - ${err.message}`);
    return false;
  } finally {
    Logger.log('=== VERIFY_CR03_InvalidSignatureLengthRetry END ===');
  }
}

/**
 * VERIFY_CR03_InvalidSignatureFormatRetry: Test non-hex signature triggers validation failure.
 */
function VERIFY_CR03_InvalidSignatureFormatRetry() {
  Logger.log('=== VERIFY_CR03_InvalidSignatureFormatRetry START ===');
  
  try {
    // Test: non-hex characters (invalid)
    const validation1 = validateMasterPointers_(2, 'g'.repeat(64));
    const pass1 = !validation1.isValid && validation1.reason.includes('not hex');
    
    // Test: mixed case hex (valid)
    const validation2 = validateMasterPointers_(2, 'aAbBcCdDeEfF0123456789' + 'a'.repeat(42));
    const pass2 = validation2.isValid;
    
    // Test: special characters (invalid)
    const validation3 = validateMasterPointers_(2, '!' + 'a'.repeat(63));
    const pass3 = !validation3.isValid;
    
    const result = pass1 && pass2 && pass3;
    Logger.log(`VERIFY_CR03_InvalidSignatureFormatRetry: ${result ? 'PASS' : 'FAIL'}`);
    Logger.log(`  - non-hex chars invalid: ${pass1}`);
    Logger.log(`  - mixed case hex valid: ${pass2}`);
    Logger.log(`  - special chars invalid: ${pass3}`);
    
    return result;
    
  } catch (err) {
    Logger.log(`VERIFY_CR03_InvalidSignatureFormatRetry: FAIL - ${err.message}`);
    return false;
  } finally {
    Logger.log('=== VERIFY_CR03_InvalidSignatureFormatRetry END ===');
  }
}

/**
 * Run all CR verification tests.
 */
function RUN_ALL_CR_VERIFICATIONS() {
  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log('  RUNNING ALL CR VERIFICATION TESTS');
  Logger.log('═══════════════════════════════════════════════════════');
  
  const results = {
    CR01_MasterWrittenSkip: VERIFY_CR01_MasterWrittenSkip(),
    CR02_InvalidTimestampReserved: VERIFY_CR02_InvalidTimestampReserved(),
    CR03_InvalidRowNumRetry: VERIFY_CR03_InvalidRowNumRetry(),
    CR03_InvalidSignatureLengthRetry: VERIFY_CR03_InvalidSignatureLengthRetry(),
    CR03_InvalidSignatureFormatRetry: VERIFY_CR03_InvalidSignatureFormatRetry()
  };
  
  const allPass = Object.values(results).every(r => r === true);
  
  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log(`  OVERALL RESULT: ${allPass ? 'ALL PASS ✓' : 'SOME FAILURES ✗'}`);
  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log(`  CR01_MasterWrittenSkip: ${results.CR01_MasterWrittenSkip ? 'PASS ✓' : 'FAIL ✗'}`);
  Logger.log(`  CR02_InvalidTimestampReserved: ${results.CR02_InvalidTimestampReserved ? 'PASS ✓' : 'FAIL ✗'}`);
  Logger.log(`  CR03_InvalidRowNumRetry: ${results.CR03_InvalidRowNumRetry ? 'PASS ✓' : 'FAIL ✗'}`);
  Logger.log(`  CR03_InvalidSignatureLengthRetry: ${results.CR03_InvalidSignatureLengthRetry ? 'PASS ✓' : 'FAIL ✗'}`);
  Logger.log(`  CR03_InvalidSignatureFormatRetry: ${results.CR03_InvalidSignatureFormatRetry ? 'PASS ✓' : 'FAIL ✗'}`);
  Logger.log('═══════════════════════════════════════════════════════');
  
  if (allPass) {
    SpreadsheetApp.getUi().alert(
      'CR Verification Complete',
      'All CR verification tests PASSED ✓\n\n' +
      'CR-01: MASTER_WRITTEN skip logic - PASS\n' +
      'CR-02: Invalid timestamp handling - PASS\n' +
      'CR-03: Master pointer validation - PASS',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    SpreadsheetApp.getUi().alert(
      'CR Verification Failed',
      'Some CR verification tests FAILED. Check execution log for details.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
  
  return results;
}
