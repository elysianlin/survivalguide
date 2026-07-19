/**
 * gpa.js
 * Dynamic GPA calculator — add/edit/remove courses,
 * auto-calculates and displays semester GPA in real time.
 * Used by gpa.html
 */

import { getGPACourses, saveGPACourses, getSelectedCourses, saveSelectedCourses } from './storage.js';
import {
  generateId, calculateGPA, gpaToLetter, isValidCredits, showToast,
  confirmDialog, gpaStandingColors, getURLParam,
} from './utils.js';
import { initLayout } from './layout.js';

// ================================================================
// STATE
// ================================================================
let courses = [];

// Full BYU-I catalog (flattened) once fetched, and the small subset
// the student has picked for this semester via the course picker.
let allCourses = [];
let selectedCourses = [];
const MAX_SELECTED_COURSES = 20;

// ================================================================
// RENDER
// ================================================================
const GRADES = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F'];

function renderCourses() {
  const tbody = document.getElementById('gpa-tbody');
  if (!tbody) return;

  if (courses.length === 0) {
    tbody.innerHTML = `
      <tr id="gpa-empty-row">
        <td colspan="4" style="padding:var(--sp-8); text-align:center; color:var(--clr-text-muted);">
          No courses yet. Add your first course above.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = courses.map((c, i) => `
    <tr data-id="${c.id}">
      <td>
        <input type="text" class="course-name-input"
          value="${escHtml(c.name)}" placeholder="e.g. WDD 231"
          data-id="${c.id}" data-field="name" aria-label="Course name">
      </td>
      <td>
        <input type="number" class="course-credits-input"
          value="${c.credits}" min="1" max="5" step="1"
          data-id="${c.id}" data-field="credits" aria-label="Credits" style="max-width:80px">
      </td>
      <td>
        <select class="course-grade-select" data-id="${c.id}" data-field="grade" aria-label="Grade">
          ${GRADES.map(g => `<option value="${g}"${c.grade === g ? ' selected' : ''}>${g}</option>`).join('')}
        </select>
      </td>
      <td style="text-align:center">
        <span style="font-family:var(--font-mono); font-weight:600; color:var(--clr-primary)">
          ${gradePoints(c.grade).toFixed(1)}
        </span>
      </td>
      <td>
        <button class="btn btn-ghost btn-icon btn-sm delete-course-btn" data-id="${c.id}" title="Remove">🗑️</button>
      </td>
    </tr>`).join('');

  // Inline edit events
  tbody.querySelectorAll('input[data-field], select[data-field]').forEach(el => {
    el.addEventListener('input', handleInlineEdit);
    el.addEventListener('change', handleInlineEdit);
  });
  tbody.querySelectorAll('.delete-course-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const course = courses.find(c => c.id === btn.dataset.id);
      const ok = await confirmDialog(
        `Remove "${course?.name || 'this course'}" from your GPA calculation?`,
        { title: 'Remove Course', confirmLabel: 'Remove' }
      );
      if (!ok) return;
      courses = courses.filter(c => c.id !== btn.dataset.id);
      saveGPACourses(courses);
      renderCourses();
      updateGPADisplay();
      showToast('Course removed.', 'warning');
    });
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const GRADE_PTS = { 'A+':4.0,'A':4.0,'A-':3.7,'B+':3.3,'B':3.0,'B-':2.7,'C+':2.3,'C':2.0,'C-':1.7,'D+':1.3,'D':1.0,'D-':0.7,'F':0.0 };
function gradePoints(g) { return GRADE_PTS[g] ?? 0; }

// ================================================================
// INLINE EDIT
// ================================================================
let saveDebounceTimer = null;
function debouncedSave() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => saveGPACourses(courses), 300);
}

function handleInlineEdit(e) {
  const id    = e.target.dataset.id;
  const field = e.target.dataset.field;
  const val   = e.target.value;
  const idx   = courses.findIndex(c => c.id === id);
  if (idx < 0) return;

  if (field === 'credits') {
    if (!isValidCredits(val)) {
      e.target.style.borderColor = 'var(--clr-danger)';
      e.target.setAttribute('aria-invalid', 'true');
      return;
    }
    e.target.style.borderColor = '';
    e.target.removeAttribute('aria-invalid');
    courses[idx].credits = Number(val);
  } else {
    courses[idx][field] = val;
  }

  // Debounce the localStorage write (keystroke-level saves are wasteful);
  // the GPA display itself still updates instantly for responsive feedback.
  debouncedSave();
  updateGPADisplay();
  if (field === 'grade') renderCourses(); // refresh grade points column
}

// ================================================================
// GPA DISPLAY
// ================================================================
function updateGPADisplay() {
  const gpa    = calculateGPA(courses);
  const letter = courses.length > 0 ? gpaToLetter(gpa) : '—';

  const valEl    = document.getElementById('gpa-value');
  const letterEl = document.getElementById('gpa-letter');
  const credEl   = document.getElementById('gpa-credits');
  const standEl  = document.getElementById('gpa-standing');

  if (valEl)    valEl.textContent    = courses.length > 0 ? gpa.toFixed(2) : '—';
  if (letterEl) letterEl.textContent = letter;
  if (credEl) {
    const total = courses.reduce((s,c) => s + Number(c.credits||0), 0);
    credEl.textContent = `${total} credit${total !== 1 ? 's' : ''}`;
  }
  if (standEl)  standEl.textContent  = academicStanding(gpa);

  // Color the result card — always chosen so text stays WCAG-AA readable
  const card = document.getElementById('gpa-result-card');
  if (card) {
    const { bg, text } = gpaStandingColors(courses.length > 0 ? gpa : 0);
    card.style.background = bg;
    card.style.color = text;
  }

  // Render chart
  renderGPABar(courses);
}

function academicStanding(gpa) {
  if (gpa >= 3.9) return '🏆 Summa Cum Laude';
  if (gpa >= 3.7) return '🌟 Magna Cum Laude';
  if (gpa >= 3.5) return '⭐ Cum Laude';
  if (gpa >= 3.0) return '👍 Good Standing';
  if (gpa >= 2.0) return '📚 Satisfactory';
  if (gpa > 0)    return '⚠️ Academic Probation';
  return '';
}

// ================================================================
// GPA BAR CHART
// ================================================================
function renderGPABar(courses) {
  const container = document.getElementById('gpa-chart');
  if (!container || courses.length === 0) {
    if (container) container.innerHTML = '';
    return;
  }
  const max = 4.0;
  container.innerHTML = `
    <div style="margin-top:var(--sp-4)">
      <p class="text-xs text-muted font-semibold" style="margin-bottom:var(--sp-3); text-transform:uppercase; letter-spacing:0.06em;color:white;">Grade Breakdown</p>
      ${courses.filter(c => c.name).map(c => {
        const pts = gradePoints(c.grade);
        const pct = (pts / max) * 100;
        const color = pts >= 3.7 ? 'var(--clr-success)' :
                      pts >= 3.0 ? 'var(--clr-primary)' :
                      pts >= 2.0 ? 'var(--clr-accent)' : 'var(--clr-danger)';
        return `
          <div style="margin-bottom:var(--sp-3)">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px">
              <span style="font-size:var(--fs-xs); font-weight:600; color:var(--clr-text-inverse)">${escHtml(c.name)}</span>
              <span style="font-size:var(--fs-xs); color:rgba(255,255,255,0.92)">${c.grade} (${pts.toFixed(1)})</span>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.2); border-radius:9999px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:white; border-radius:9999px; transition:width 0.5s cubic-bezier(0.16,1,0.3,1);"></div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ================================================================
// COURSE PICKER — "select your courses first"
// Lets the student search the full BYU-I catalog and pick up to
// MAX_SELECTED_COURSES for the semester. Once they've picked any,
// the "Add a Course" field's datalist narrows to just those.
// ================================================================
function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
}

async function loadCourseCatalog() {
  try {
    const res = await fetch('data/courses.json');
    const data = await res.json();
    allCourses = (data.departments || []).flatMap(d => d.courses);
  } catch {
    allCourses = [];
  }
}

function updateGpaDatalist() {
  const list = document.getElementById('gpa-course-datalist');
  if (!list) return;
  // If the student has picked courses, only suggest those; otherwise
  // fall back to the full catalog so nobody is blocked from adding a
  // course before using the picker.
  const source = selectedCourses.length > 0 ? selectedCourses : allCourses;
  list.innerHTML = source.map(c => `<option value="${escAttr(c.code)}">`).join('');
}

function renderSelectedChips() {
  const container = document.getElementById('selected-courses-chips');
  const countEl    = document.getElementById('course-picker-count');
  if (countEl) countEl.textContent = `${selectedCourses.length} / ${MAX_SELECTED_COURSES} selected`;
  if (!container) return;

  if (selectedCourses.length === 0) {
    container.innerHTML = `<span class="course-picker-empty">No courses selected yet — the Course field below will show the full catalog.</span>`;
    return;
  }

  container.innerHTML = selectedCourses.map(c => `
    <span class="course-chip" data-code="${escAttr(c.code)}">
      ${escAttr(c.code)}
      <button type="button" class="course-chip-remove" data-code="${escAttr(c.code)}" aria-label="Remove ${escAttr(c.code)}">✕</button>
    </span>`).join('');

  container.querySelectorAll('.course-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCourses = selectedCourses.filter(c => c.code !== btn.dataset.code);
      saveSelectedCourses(selectedCourses);
      renderSelectedChips();
      updateGpaDatalist();
    });
  });
}

function renderCoursePickerResults(query) {
  const resultsEl = document.getElementById('course-picker-results');
  if (!resultsEl) return;

  const q = query.trim().toLowerCase();
  if (!q) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    return;
  }

  const selectedCodes = new Set(selectedCourses.map(c => c.code));
  const matches = allCourses
    .filter(c => !selectedCodes.has(c.code))
    .filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
    .slice(0, 8);

  if (matches.length === 0) {
    resultsEl.innerHTML = `<div class="course-picker-no-results">No matching courses.</div>`;
    resultsEl.hidden = false;
    return;
  }

  resultsEl.innerHTML = matches.map(c => `
    <button type="button" class="course-picker-result-btn" data-code="${escAttr(c.code)}">
      <span class="course-picker-result-code">${escAttr(c.code)}</span>
      <span class="course-picker-result-name">${escAttr(c.name)}</span>
    </button>`).join('');
  resultsEl.hidden = false;

  resultsEl.querySelectorAll('.course-picker-result-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const course = allCourses.find(c => c.code === btn.dataset.code);
      if (!course) return;

      if (selectedCourses.length >= MAX_SELECTED_COURSES) {
        showToast(`You can select up to ${MAX_SELECTED_COURSES} courses.`, 'warning');
        return;
      }

      selectedCourses.push({ code: course.code, name: course.name });
      saveSelectedCourses(selectedCourses);
      renderSelectedChips();
      updateGpaDatalist();
      showToast(`${course.code} added to your course list.`, 'success');

      const searchInput = document.getElementById('course-picker-search');
      if (searchInput) searchInput.value = '';
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    });
  });
}

async function initCoursePicker() {
  await loadCourseCatalog();
  selectedCourses = getSelectedCourses();
  renderSelectedChips();
  updateGpaDatalist();

  const searchInput = document.getElementById('course-picker-search');
  const resultsEl    = document.getElementById('course-picker-results');
  if (!searchInput || !resultsEl) return;

  searchInput.addEventListener('input', () => renderCoursePickerResults(searchInput.value));
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) renderCoursePickerResults(searchInput.value);
  });

  // Close the results dropdown when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.course-picker-wrap')) {
      resultsEl.hidden = true;
    }
  });
}

// ================================================================
// ADD COURSE
// ================================================================
function initAddCourse() {
  const form = document.getElementById('add-course-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name    = document.getElementById('new-course-name')?.value.trim();
    const credits = document.getElementById('new-course-credits')?.value;
    const grade   = document.getElementById('new-course-grade')?.value;
    const errEl   = document.getElementById('add-course-error');

    if (!name || name.length < 2) {
      if (errEl) errEl.textContent = 'Course name is required.';
      return;
    }
    if (!isValidCredits(credits)) {
      if (errEl) errEl.textContent = 'Credits must be 1–5.';
      return;
    }
    if (!grade) {
      if (errEl) errEl.textContent = 'Please select a grade.';
      return;
    }
    if (errEl) errEl.textContent = '';

    courses.push({ id: generateId(), name, credits: Number(credits), grade });
    saveGPACourses(courses);
    form.reset();
    renderCourses();
    updateGPADisplay();
    showToast(`${name} added!`, 'success');
  });
}

// ================================================================
// CLEAR ALL
// ================================================================
function initClearAll() {
  document.getElementById('clear-gpa-btn')?.addEventListener('click', async () => {
    const ok = await confirmDialog('Clear all courses? This cannot be undone.', {
      title: 'Clear All Courses', confirmLabel: 'Clear All',
    });
    if (!ok) return;
    courses = [];
    saveGPACourses(courses);
    renderCourses();
    updateGPADisplay();
    showToast('All courses cleared.', 'warning');
  });
}

// ================================================================
// URL PARAMETER PREFILL — supports links like
// gpa.html?course=WDD%20231&credits=3 from other pages (e.g. the planner),
// so a student can jump straight from an assignment to logging that
// course's grade without retyping anything.
// ================================================================
function prefillFromURL() {
  const course  = getURLParam('course');
  const credits = getURLParam('credits');
  if (!course) return;

  const nameInput    = document.getElementById('new-course-name');
  const creditsInput = document.getElementById('new-course-credits');
  if (nameInput) nameInput.value = course;
  if (creditsInput && credits) creditsInput.value = credits;
  document.getElementById('new-course-grade')?.focus();
  showToast(`Pre-filled "${course}" from your planner — just pick a grade.`, '');
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  initLayout();
  courses = getGPACourses();
  renderCourses();
  updateGPADisplay();
  initCoursePicker();
  initAddCourse();
  initClearAll();
  prefillFromURL();
});