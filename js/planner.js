/**
 * planner.js
 * Assignment CRUD, filtering, sorting, and modal logic.
 * Used by planner.html
 */

import {
  getAssignments, upsertAssignment, deleteAssignment, completeAssignment,
  getExams, saveExams, getSelectedCourses,
} from './storage.js';
import {
  generateId, formatDate, todayISO, daysUntil, dueDateClass,
  validateAssignment, showToast, launchConfetti, confirmDialog,
  getURLParam, setURLParams, buildLink, onIdle,
} from './utils.js';
import { initLayout } from './layout.js';

// ================================================================
// STATE
// ================================================================
let assignments   = [];
let exams         = [];
let filterCourse  = 'all';
let filterStatus  = 'all';
let filterPriority = 'all';
let sortKey       = 'dueDate';
let sortDir       = 'asc';
let editingId     = null;

// ================================================================
// RENDER TABLE
// ================================================================
function getFiltered() {
  return assignments
    .filter(a => filterCourse   === 'all' || a.courseName === filterCourse)
    .filter(a => filterStatus   === 'all' || a.status     === filterStatus)
    .filter(a => filterPriority === 'all' || a.priority   === filterPriority)
    .sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'dueDate') { av = av || '9999'; bv = bv || '9999'; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
}

function priorityOrder(p) { return { high: 0, medium: 1, low: 2 }[p] ?? 3; }

function renderTable() {
  const tbody = document.getElementById('assignment-tbody');
  if (!tbody) return;

  const rows = getFiltered();
  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7"> <div class="empty-state">
          <div class="empty-icon">
            <i class="ti ti-notes-off" aria-hidden="true"></i>
          </div>
          <p style="margin-bottom: var(--sp-3)">No assignments found.</p>
          <button class="btn btn-primary btn-sm" id="empty-add-btn" style="display: inline-flex; align-items: center; gap: var(--sp-1); margin-inline: auto;">
            <i class="ti ti-plus" style="font-size: 0.9rem; margin: 0" aria-hidden="true"></i> Add one
          </button>
        </div>
      </td></tr>`;
    document.getElementById('empty-add-btn')?.addEventListener('click', openAddModal);
    return;
  }

  tbody.innerHTML = rows.map(a => {
    const dc = dueDateClass(a.dueDate);
    const days = daysUntil(a.dueDate);
    const daysLabel = a.status === 'done' ? '✓' :
                      days < 0  ? `${Math.abs(days)}d overdue` :
                      days === 0 ? 'Today!' : `${days}d`;
    return `
      <tr class="${a.status === 'done' ? 'completed' : ''}" data-id="${a.id}">
        <td>
          <input type="checkbox" class="complete-cb" data-id="${a.id}"
            ${a.status === 'done' ? 'checked' : ''} title="Mark complete">
        </td>
        <td>
          <div class="task-name">${escHtml(a.taskName)}</div>
        </td>
        <td><span class="task-course-code">${escHtml(a.courseName)}</span></td>
        <td>
          <div class="due-date ${a.status === 'done' ? '' : dc}">
            ${formatDate(a.dueDate)}
            <span style="font-size:var(--fs-xs); margin-left:4px; opacity:0.7">(${daysLabel})</span>
          </div>
        </td>
        <td><span class="badge badge-${a.priority}">${cap(a.priority)}</span></td>
        <td><span class="badge badge-${a.status === 'done' ? 'done' : 'pending'}">${statusLabel(a.status)}</span></td>
        <td>
          <div class="row-actions">
            <a class="btn btn-ghost btn-icon" href="${buildLink('gpa.html', { course: a.courseName, credits: 3 })}"
              title="Log a grade for this course" aria-label="Add ${escHtml(a.courseName)} to GPA calculator">
              <i class="ti ti-report-analytics" aria-hidden="true"></i>
            </a>
            <button class="btn btn-ghost btn-icon edit-btn" data-id="${a.id}" title="Edit" aria-label="Edit assignment">
              <i class="ti ti-pencil" aria-hidden="true"></i>
            </button>
            <button class="btn btn-ghost btn-icon delete-btn" data-id="${a.id}" title="Delete" aria-label="Delete assignment" style="color: var(--clr-danger);">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  // Row events
  tbody.querySelectorAll('.complete-cb').forEach(cb => {
    cb.addEventListener('change', handleComplete);
  });
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id));
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function statusLabel(s) {
  return { pending: 'Pending', 'in-progress': 'In Progress', done: 'Done' }[s] || s;
}

// ================================================================
// FILTERS
// ================================================================
function populateCourseFilter() {
  const sel = document.getElementById('filter-course');
  if (!sel) return;
  const courses = [...new Set(assignments.map(a => a.courseName))].sort();
  sel.innerHTML = `<option value="all">All Courses</option>` +
    courses.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  if (filterCourse !== 'all') sel.value = filterCourse;
}

function syncFiltersToURL() {
  setURLParams({ course: filterCourse, status: filterStatus, priority: filterPriority });
}

/**
 * Read course/status/priority from the URL on page load, so links from the
 * dashboard (e.g. "View all pending →") land on a pre-filtered planner view.
 * Example: planner.html?status=pending
 */
function initFiltersFromURL() {
  const course   = getURLParam('course');
  const status   = getURLParam('status');
  const priority = getURLParam('priority');

  if (course)   filterCourse   = course;
  if (status)   filterStatus   = status;
  if (priority) filterPriority = priority;

  if (status) {
    document.getElementById('filter-status').value = status;
    document.querySelectorAll('.filter-chip[data-filter-type="status"]').forEach(c => {
      c.classList.toggle('active', c.dataset.value === status);
    });
  }
  if (priority) document.getElementById('filter-priority').value = priority;
}

function initFilters() {
  document.getElementById('filter-course')?.addEventListener('change', e => {
    filterCourse = e.target.value;
    syncFiltersToURL();
    renderTable();
  });
  document.getElementById('filter-status')?.addEventListener('change', e => {
    filterStatus = e.target.value;
    syncFiltersToURL();
    renderTable();
  });
  document.getElementById('filter-priority')?.addEventListener('change', e => {
    filterPriority = e.target.value;
    syncFiltersToURL();
    renderTable();
  });

  // Chip filter
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const type = chip.dataset.filterType;
      const val  = chip.dataset.value;
      document.querySelectorAll(`.filter-chip[data-filter-type="${type}"]`).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (type === 'status')   filterStatus   = val;
      if (type === 'priority') filterPriority = val;
      syncFiltersToURL();
      renderTable();
    });
  });
}

function initSort() {
  document.querySelectorAll('.assignment-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDir = 'asc';
      }
      document.querySelectorAll('.sort-icon').forEach(i => i.textContent = '↕');
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = sortDir === 'asc' ? '↑' : '↓';
      renderTable();
    });
  });
}

// ================================================================
// COMPLETE / DELETE
// ================================================================
function handleComplete(e) {
  const id = e.target.dataset.id;
  const a  = assignments.find(a => a.id === id);
  if (!a) return;

  if (e.target.checked) {
    completeAssignment(id);
    assignments = getAssignments();
    if (a.priority === 'high') launchConfetti(50);
    showToast(`"${a.taskName}" marked complete!`, 'success');
  } else {
    a.status = 'pending';
    delete a.completedAt;
    upsertAssignment(a);
    assignments = getAssignments();
  }
  renderTable();
  updateStats();
}

async function handleDelete(id) {
  const a = assignments.find(a => a.id === id);
  if (!a) return;
  const ok = await confirmDialog(`Delete "${a.taskName}"? This cannot be undone.`, {
    title: 'Delete Assignment', confirmLabel: 'Delete',
  });
  if (!ok) return;
  deleteAssignment(id);
  assignments = getAssignments();
  populateCourseFilter();
  renderTable();
  updateStats();
  showToast('Assignment deleted.', 'warning');
}

// ================================================================
// STATS UPDATE
// ================================================================
function updateStats() {
  const total   = assignments.length;
  const done    = assignments.filter(a => a.status === 'done').length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-total', total);
  set('stat-done', done);
  set('stat-pending', assignments.filter(a => a.status === 'pending').length);
  set('stat-overdue', assignments.filter(a => a.status !== 'done' && daysUntil(a.dueDate) < 0).length);
}

// ================================================================
// MODAL
// ================================================================
function getFormData() {
  return {
    courseName: document.getElementById('f-course')?.value.trim(),
    taskName:   document.getElementById('f-task')?.value.trim(),
    dueDate:    document.getElementById('f-date')?.value,
    priority:   document.getElementById('f-priority')?.value,
    status:     document.getElementById('f-status')?.value,
  };
}

function setFormError(field, message) {
  const el = document.getElementById(`err-${field}`);
  if (el) el.textContent = message;
}
function clearFormErrors() {
  ['courseName', 'taskName', 'dueDate', 'priority', 'status'].forEach(f => setFormError(f, ''));
}

function openModal(title) {
  document.getElementById('modal-title').textContent = title;
  clearFormErrors();
  // Set min date to today to prevent past dates
  const dateInput = document.getElementById('f-date');
  if (dateInput && !editingId) dateInput.min = todayISO();
  document.getElementById('assignment-modal').classList.add('open');
  document.getElementById('f-course')?.focus();
}
function closeModal() {
  document.getElementById('assignment-modal')?.classList.remove('open');
  editingId = null;
  document.getElementById('assignment-form')?.reset();
  clearFormErrors();
}

function openAddModal() {
  editingId = null;
  openModal('New Assignment');
}

function openEditModal(id) {
  const a = assignments.find(a => a.id === id);
  if (!a) return;
  editingId = id;
  document.getElementById('f-course').value   = a.courseName;
  document.getElementById('f-task').value     = a.taskName;
  document.getElementById('f-date').value     = a.dueDate;
  document.getElementById('f-priority').value = a.priority;
  document.getElementById('f-status').value   = a.status;
  openModal('Edit Assignment');
}

function handleFormSubmit(e) {
  e.preventDefault();
  clearFormErrors();
  const data = getFormData();
  const { valid, errors } = validateAssignment(data);

  if (!valid) {
    Object.entries(errors).forEach(([field, msg]) => setFormError(field, msg));
    return;
  }

  const assignment = {
    id:         editingId || generateId(),
    ...data,
    createdAt:  editingId ? assignments.find(a => a.id === editingId)?.createdAt : new Date().toISOString(),
  };

  upsertAssignment(assignment);
  assignments = getAssignments();
  populateCourseFilter();
  renderTable();
  updateStats();
  closeModal();
  showToast(editingId ? '✏️ Assignment updated!' : `"${assignment.taskName}" Assignment added!`, 'success');
}

// ================================================================
// COURSE DATALIST (autocomplete)
// ================================================================
async function initCourseDatalist() {
  try {
    const res = await fetch('data/courses.json');
    if (!res.ok) throw new Error('Course data unavailable');
    const data = await res.json();
    const allCodes = data.departments.flatMap(d => d.courses.map(c => c.code));

    // Same "selected courses" list the student picks on the GPA page —
    // shared via localStorage so every course dropdown site-wide narrows
    // to just their semester's courses instead of the full catalog.
    const selected = getSelectedCourses();
    const codes = selected.length > 0 ? selected.map(c => c.code) : allCodes;
    const optionsHTML = codes.map(c => `<option value="${c}">`).join('');

    // Populate every course datalist on the page (assignment modal + exam form)
    ['course-datalist', 'exam-course-datalist'].forEach(id => {
      const list = document.getElementById(id);
      if (list) list.innerHTML = optionsHTML;
    });
  } catch (err) {
    console.warn('Could not load course list for autocomplete:', err);
  }
}

// ================================================================
// EXAM SECTION
// ================================================================
function renderExams() {
  const container = document.getElementById('exam-list');
  if (!container) return;
  if (exams.length === 0) {
    container.innerHTML = `<p class="text-muted text-sm">No exams added yet.</p>`;
    return;
  }
  container.innerHTML = exams.map(e => `
    <div class="countdown-item ${e.days <= 1 ? 'urgent' : e.days <= 7 ? 'warning' : 'safe'}" style="margin-bottom:var(--sp-3)">
      <div>
        <div class="countdown-days">${daysUntil(e.date)}</div>
        <div class="countdown-label">days</div>
      </div>
      <div class="countdown-info">
        <div class="countdown-name">${escHtml(e.name)}</div>
        <div class="countdown-course">${escHtml(e.course)} — ${formatDate(e.date)}</div>
      </div>
      <button class="btn btn-ghost btn-icon btn-sm delete-exam-btn" data-id="${e.id}">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>`).join('');

  container.querySelectorAll('.delete-exam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      exams = exams.filter(e => e.id !== btn.dataset.id);
      saveExams(exams);
      renderExams();
    });
  });
}

function setExamFieldError(field, message) {
  const el = document.getElementById(`err-exam-${field}`);
  if (el) el.textContent = message;
  const input = document.getElementById(`exam-${field}`);
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}
function clearExamFieldErrors() {
  ['name', 'course', 'date'].forEach(f => setExamFieldError(f, ''));
}

/**
 * Validate the exam form field-by-field (rather than one generic
 * "fields missing" toast) so the student knows exactly which input needs
 * attention — mirrors the pattern already used by the assignment modal.
 */
function validateExamForm({ name, course, date }) {
  const errors = {};
  if (!name || name.length < 2)      errors.name   = 'Exam name is required.';
  if (!course || course.length < 2)  errors.course = 'Course is required.';
  if (!date)                         errors.date   = 'Exam date is required.';
  else if (date < todayISO())        errors.date   = 'Exam date cannot be in the past.';
  return { valid: Object.keys(errors).length === 0, errors };
}

function initExamForm() {
  const form = document.getElementById('exam-form');
  if (!form) return;

  const dateInput = document.getElementById('exam-date');
  if (dateInput) dateInput.min = todayISO();

  form.addEventListener('submit', e => {
    e.preventDefault();
    clearExamFieldErrors();

    const name   = document.getElementById('exam-name')?.value.trim() ?? '';
    const course = document.getElementById('exam-course')?.value.trim() ?? '';
    const date   = document.getElementById('exam-date')?.value ?? '';

    const { valid, errors } = validateExamForm({ name, course, date });
    if (!valid) {
      Object.entries(errors).forEach(([field, msg]) => setExamFieldError(field, msg));
      showToast('Please fix the highlighted exam fields.', 'warning');
      return;
    }

    exams.push({ id: generateId(), name, course, date });
    saveExams(exams);
    form.reset();
    if (dateInput) dateInput.min = todayISO();
    clearExamFieldErrors();
    renderExams();
    showToast(`"${name}" exam added!`, 'success');
  });

  // Clear a field's error as soon as the user starts fixing it
  ['exam-name', 'exam-course', 'exam-date'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      setExamFieldError(id.replace('exam-', ''), '');
    });
  });
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  initLayout();
  assignments = getAssignments();
  exams       = getExams();

  initFiltersFromURL();   // apply ?course= / ?status= / ?priority= from the URL, if present
  renderTable();
  populateCourseFilter();
  updateStats();
  initFilters();
  initSort();
  onIdle(initCourseDatalist);
  renderExams();
  initExamForm();

  // Modal open/close
  document.getElementById('add-assignment-btn')?.addEventListener('click', openAddModal);

  // Deep link support: planner.html?new=1 opens the Add Assignment modal
  // immediately (used by the dashboard's "+ New Assignment" button).
  if (getURLParam('new') === '1') {
    openAddModal();
    setURLParams({ new: null }); // clean the URL so refresh doesn't reopen it
  }
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('assignment-form')?.addEventListener('submit', handleFormSubmit);

  // Close on overlay click
  document.getElementById('assignment-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});