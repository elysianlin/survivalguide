/**
 * planner.js
 * Assignment CRUD, filtering, sorting, and modal logic.
 * Used by planner.html
 */

import {
  getAssignments, upsertAssignment, deleteAssignment, completeAssignment,
  getExams, saveExams,
} from './storage.js';
import {
  generateId, formatDate, todayISO, daysUntil, dueDateClass,
  validateAssignment, showToast, launchConfetti,
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
            <i class="ti ti-notes-off"></i>
          </div>
          <p style="margin-bottom: var(--sp-3)">No assignments found.</p>
          <button class="btn btn-primary btn-sm" id="empty-add-btn" style="display: inline-flex; align-items: center; gap: var(--sp-1); margin-inline: auto;">
            <i class="ti ti-plus" style="font-size: 0.9rem; margin: 0"></i> Add one
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
            <button class="btn btn-ghost btn-icon edit-btn" data-id="${a.id}" title="Edit" aria-label="Edit assignment">
              <i class="ti ti-pencil"></i>
            </button>
            <button class="btn btn-ghost btn-icon delete-btn" data-id="${a.id}" title="Delete" aria-label="Delete assignment" style="color: var(--clr-danger);">
              <i class="ti ti-trash"></i>
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

function initFilters() {
  document.getElementById('filter-course')?.addEventListener('change', e => {
    filterCourse = e.target.value;
    renderTable();
  });
  document.getElementById('filter-status')?.addEventListener('change', e => {
    filterStatus = e.target.value;
    renderTable();
  });
  document.getElementById('filter-priority')?.addEventListener('change', e => {
    filterPriority = e.target.value;
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

function handleDelete(id) {
  const a = assignments.find(a => a.id === id);
  if (!a) return;
  if (!confirm(`Delete "${a.taskName}"? This cannot be undone.`)) return;
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
    const data = await res.json();
    const list = document.getElementById('course-datalist');
    if (!list) return;
    const all = data.departments.flatMap(d => d.courses.map(c => c.code));
    list.innerHTML = all.map(c => `<option value="${c}">`).join('');
  } catch { /* silent fail */ }
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
        <i class="ti ti-trash"></i>
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

function initExamForm() {
  const form = document.getElementById('exam-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name   = document.getElementById('exam-name')?.value.trim();
    const course = document.getElementById('exam-course')?.value.trim();
    const date   = document.getElementById('exam-date')?.value;
    if (!name || !course || !date) { showToast('Please fill in all exam fields.', 'warning'); return; }
    exams.push({ id: generateId(), name, course, date });
    saveExams(exams);
    form.reset();
    renderExams();
    showToast('Exam added!', 'success');
  });
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  initLayout();
  assignments = getAssignments();
  exams       = getExams();

  renderTable();
  populateCourseFilter();
  updateStats();
  initFilters();
  initSort();
  initCourseDatalist();
  renderExams();
  initExamForm();

  // Modal open/close
  document.getElementById('add-assignment-btn')?.addEventListener('click', openAddModal);
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('assignment-form')?.addEventListener('submit', handleFormSubmit);

  // Close on overlay click
  document.getElementById('assignment-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});