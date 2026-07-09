/**
 * utils.js
 * Shared helper functions used across all pages.
 */

// ---- ID Generation ----

/**
 * Generate a unique ID string.
 * @returns {string}
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Date Helpers ----

/**
 * Format a date string (YYYY-MM-DD) to a human-readable form.
 * @param {string} dateStr
 * @returns {string}  e.g. "Jun 15, 2025"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Get today's date as YYYY-MM-DD string (no time zone offset issues).
 * @returns {string}
 */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Count calendar days between today and a due date string.
 * Positive = in the future, Negative = overdue.
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {number}
 */
export function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

/**
 * Determine urgency class for a due date.
 * @param {string} dateStr
 * @returns {'overdue'|'soon'|'ok'}
 */
export function dueDateClass(dateStr) {
  const days = daysUntil(dateStr);
  if (days < 0)  return 'overdue';
  if (days <= 3) return 'soon';
  return 'ok';
}

// ---- Validation ----

/**
 * Validate assignment form fields.
 * Returns an object: { valid: bool, errors: { field: message } }
 * @param {{ courseName, taskName, dueDate, priority, status }} data
 */
export function validateAssignment({ courseName, taskName, dueDate, priority, status }) {
  const errors = {};

  if (!courseName || courseName.trim().length < 2) {
    errors.courseName = 'Course name must be at least 2 characters.';
  }
  if (!taskName || taskName.trim().length < 3) {
    errors.taskName = 'Task name must be at least 3 characters.';
  }
  if (!dueDate) {
    errors.dueDate = 'A due date is required.';
  } else if (dueDate < todayISO()) {
    errors.dueDate = 'Due date cannot be in the past.';
  }
  if (!['high', 'medium', 'low'].includes(priority)) {
    errors.priority = 'Please select a valid priority.';
  }
  if (!['pending', 'in-progress', 'done'].includes(status)) {
    errors.status = 'Please select a valid status.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate email with a simple regex.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate credits (1–5 integer).
 * @param {number|string} credits
 * @returns {boolean}
 */
export function isValidCredits(credits) {
  const n = Number(credits);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

// ---- URL Parameter Helpers (page-to-page data transfer) ----

/**
 * Read a single query parameter from the current URL.
 * @param {string} name
 * @returns {string|null}
 */
export function getURLParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Read all query parameters as a plain object.
 * @returns {Object<string,string>}
 */
export function getURLParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

/**
 * Update the current URL's query string without reloading the page
 * (uses replaceState so filter changes don't spam browser history,
 * while still making the current view bookmarkable/shareable).
 * Falsy values ('all', '', null, undefined) remove the param.
 * @param {Object<string,string>} params
 */
export function setURLParams(params) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (!value || value === 'all') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  window.history.replaceState({}, '', url);
}

/**
 * Build a URL string to another page with query parameters attached.
 * @param {string} page  e.g. 'planner.html'
 * @param {Object<string,string>} params
 * @returns {string}
 */
export function buildLink(page, params = {}) {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return search ? `${page}?${search}` : page;
}

// ---- DOM Helpers ----

/**
 * Safely query a selector; throws if element not found.
 * @param {string} selector
 * @param {Document|HTMLElement} context
 * @returns {HTMLElement}
 */
export function qs(selector, context = document) {
  const el = context.querySelector(selector);
  if (!el) throw new Error(`Element not found: "${selector}"`);
  return el;
}

/** querySelector without throwing. */
export function qsOpt(selector, context = document) {
  return context.querySelector(selector);
}

/** querySelectorAll → Array */
export function qsAll(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// ---- Toast Notifications ----

let toastContainer = null;

/**
 * Show a toast message.
 * @param {string} message
 * @param {'success'|'danger'|'warning'|''} type
 * @param {number} duration  ms before auto-dismiss
 */
export function showToast(message, type = '', duration = 3500) {
  if (!toastContainer) {
    toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }

  const toast = document.createElement('div');
  toast.className = `toast${type ? ' ' + type : ''}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOutRight 0.35s forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ---- GPA Calculation ----

const GRADE_POINTS = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.7,
  'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7,
  'D+': 1.3, 'D': 1.0, 'D-': 0.7,
  'F':  0.0,
};

/**
 * Calculate GPA from an array of course objects.
 * @param {{ grade: string, credits: number }[]} courses
 * @returns {number}  GPA rounded to 2 decimal places
 */
export function calculateGPA(courses) {
  const valid = courses.filter(c => c.grade && c.credits > 0 && GRADE_POINTS[c.grade] !== undefined);
  if (valid.length === 0) return 0;

  const totalPoints  = valid.reduce((sum, c) => sum + GRADE_POINTS[c.grade] * Number(c.credits), 0);
  const totalCredits = valid.reduce((sum, c) => sum + Number(c.credits), 0);
  return totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : 0;
}

/**
 * Convert a numeric GPA to a letter grade.
 * @param {number} gpa
 * @returns {string}
 */
export function gpaToLetter(gpa) {
  if (gpa >= 3.7) return 'A';
  if (gpa >= 3.3) return 'B+';
  if (gpa >= 3.0) return 'B';
  if (gpa >= 2.7) return 'B-';
  if (gpa >= 2.3) return 'C+';
  if (gpa >= 2.0) return 'C';
  if (gpa >= 1.7) return 'C-';
  if (gpa >= 1.0) return 'D';
  return 'F';
}

// ---- Accessible Confirm Dialog (replaces jarring native confirm()) ----

/**
 * Show an accessible confirm modal and resolve true/false based on choice.
 * Reuses the app's existing .modal-overlay / .modal styling so it looks
 * native to the rest of the UI instead of a browser-native confirm() popup.
 * @param {string} message
 * @param {{title?: string, confirmLabel?: string, danger?: boolean}} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, opts = {}) {
  const { title = 'Please confirm', confirmLabel = 'Confirm', danger = true } = opts;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'confirm-dialog-title');
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h2 class="modal-title" id="confirm-dialog-title">${title}</h2>
        </div>
        <p style="color:var(--clr-text-muted); font-size:var(--fs-sm); margin-bottom:var(--sp-2)">${message}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Trigger open transition on next frame
    requestAnimationFrame(() => overlay.classList.add('open'));

    function cleanup(result) {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') cleanup(false);
    }

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
    document.addEventListener('keydown', onKeydown);
    overlay.querySelector('[data-action="confirm"]').focus();
  });
}

// ---- GPA Standing Colors (WCAG-contrast-safe) ----

/**
 * Return a { bg, text } color pair for a GPA value, chosen so text always
 * meets WCAG AA contrast (4.5:1) against its background — fixes the old
 * pale-yellow-background + white-text combination that failed contrast.
 * @param {number} gpa
 * @returns {{bg: string, text: string}}
 */
export function gpaStandingColors(gpa) {
  if (gpa >= 3.7) return { bg: '#0F5132', text: '#FFFFFF' };   // deep green, Summa/Magna
  if (gpa >= 3.0) return { bg: '#204D91', text: '#FFFFFF' };   // brand blue, Good standing
  if (gpa >= 2.0) return { bg: '#7A5B00', text: '#FFFFFF' };   // deep amber (not pale yellow), Satisfactory
  if (gpa > 0)    return { bg: '#7A1F1F', text: '#FFFFFF' };   // deep red, Probation
  return { bg: '#204D91', text: '#FFFFFF' };                    // default brand blue, no data yet
}

// ---- Confetti ----

/**
 * Launch a small confetti burst.
 * @param {number} count  Number of pieces
 */
export function launchConfetti(count = 60) {
  const colors = ['#2563eb', '#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#ec4899'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}vw;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${6 + Math.random() * 8}px;
      height: ${6 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.5}s;
    `;
    document.body.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }
}