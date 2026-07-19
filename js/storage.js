/**
 * storage.js
 * Thin wrapper around localStorage for type-safe, error-resilient access.
 * All app data flows through these helpers.
 */

const KEYS = {
  ASSIGNMENTS:  'ssk_assignments',
  GPA_COURSES:  'ssk_gpa_courses',
  THEME:        'ssk_theme',
  HISTORY:      'ssk_completed_history',
  EXAMS:        'ssk_exams',
  NEWSLETTER:   'ssk_newsletter_email',
  SELECTED_COURSES: 'ssk_selected_courses',
};

/**
 * Save any value (auto-serializes objects/arrays).
 * @param {string} key
 * @param {*} value
 */
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[Storage] Failed to save "${key}":`, err);
  }
}

/**
 * Load a value (auto-parses JSON).
 * @param {string} key
 * @param {*} fallback  Default value if key missing or parse fails
 * @returns {*}
 */
function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[Storage] Failed to load "${key}":`, err);
    return fallback;
  }
}

/**
 * Remove a single key.
 * @param {string} key
 */
function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error(`[Storage] Failed to remove "${key}":`, err);
  }
}

/** Clear all app data (use with caution). */
function clearAll() {
  Object.values(KEYS).forEach(k => remove(k));
}

// ---- Assignments ----

/** @returns {Assignment[]} */
function getAssignments() {
  return load(KEYS.ASSIGNMENTS, []);
}

/** @param {Assignment[]} assignments */
function saveAssignments(assignments) {
  save(KEYS.ASSIGNMENTS, assignments);
}

/**
 * Add or update a single assignment.
 * If assignment.id exists, updates in place; otherwise appends.
 * @param {Assignment} assignment
 */
function upsertAssignment(assignment) {
  const all = getAssignments();
  const idx = all.findIndex(a => a.id === assignment.id);
  if (idx >= 0) {
    all[idx] = assignment;
  } else {
    all.push(assignment);
  }
  saveAssignments(all);
}

/**
 * Delete assignment by id.
 * @param {string} id
 */
function deleteAssignment(id) {
  const filtered = getAssignments().filter(a => a.id !== id);
  saveAssignments(filtered);
  // Track in completed history if applicable
  const original = getAssignments().find(a => a.id === id);
  if (original?.status === 'done') {
    addToHistory(original);
  }
}

/** Mark assignment complete and log to history. */
function completeAssignment(id) {
  const all = getAssignments();
  const idx = all.findIndex(a => a.id === id);
  if (idx >= 0) {
    all[idx].status = 'done';
    all[idx].completedAt = new Date().toISOString();
    saveAssignments(all);
    addToHistory(all[idx]);
  }
}

// ---- Completed History ----
function getHistory() {
  return load(KEYS.HISTORY, []);
}
function addToHistory(assignment) {
  const history = getHistory();
  if (!history.find(h => h.id === assignment.id)) {
    history.unshift({ ...assignment, completedAt: new Date().toISOString() });
    save(KEYS.HISTORY, history.slice(0, 100)); // cap at 100
  }
}

// ---- Exams ----
function getExams() {
  return load(KEYS.EXAMS, []);
}
function saveExams(exams) {
  save(KEYS.EXAMS, exams);
}

// ---- GPA Courses ----
function getGPACourses() {
  return load(KEYS.GPA_COURSES, []);
}
function saveGPACourses(courses) {
  save(KEYS.GPA_COURSES, courses);
}

// ---- Theme ----
function getTheme() {
  return load(KEYS.THEME, 'light');
}
function saveTheme(theme) {
  save(KEYS.THEME, theme);
}

// ---- Newsletter ----
function getNewsletterEmail() {
  return load(KEYS.NEWSLETTER, '');
}
function saveNewsletterEmail(email) {
  save(KEYS.NEWSLETTER, email);
}

// ---- Selected Courses (GPA page course picker) ----
// Stores the small set of courses ("up to 10") a student picks for the
// semester so the "Add a Course" field can suggest just those instead of
// the entire BYU-I catalog.
function getSelectedCourses() {
  return load(KEYS.SELECTED_COURSES, []);
}
function saveSelectedCourses(courses) {
  save(KEYS.SELECTED_COURSES, courses);
}

export {
  KEYS,
  save, load, remove, clearAll,
  getAssignments, saveAssignments, upsertAssignment, deleteAssignment, completeAssignment,
  getHistory, addToHistory,
  getExams, saveExams,
  getGPACourses, saveGPACourses,
  getTheme, saveTheme,
  getNewsletterEmail, saveNewsletterEmail,
  getSelectedCourses, saveSelectedCourses,
};