/**
 * gpa.js
 * Dynamic GPA calculator — add/edit/remove courses,
 * auto-calculates and displays semester GPA in real time.
 * Used by gpa.html
 */

import { getGPACourses, saveGPACourses } from './storage.js';
import { generateId, calculateGPA, gpaToLetter, isValidCredits, showToast } from './utils.js';

// ================================================================
// STATE
// ================================================================
let courses = [];

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
    btn.addEventListener('click', () => {
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
function handleInlineEdit(e) {
  const id    = e.target.dataset.id;
  const field = e.target.dataset.field;
  const val   = e.target.value;
  const idx   = courses.findIndex(c => c.id === id);
  if (idx < 0) return;

  if (field === 'credits') {
    if (!isValidCredits(val)) {
      e.target.style.borderColor = 'var(--clr-danger)';
      return;
    }
    e.target.style.borderColor = '';
    courses[idx].credits = Number(val);
  } else {
    courses[idx][field] = val;
  }

  saveGPACourses(courses);
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

  // Color the result card
  const card = document.getElementById('gpa-result-card');
  if (card) {
    if (gpa >= 3.7)      card.style.background = 'linear-gradient(135deg, #059669, #0ea5e9)';
    else if (gpa >= 3.0) card.style.background = 'linear-gradient(135deg, #0ea5e9, #6366f1)';
    else if (gpa >= 2.0) card.style.background = 'linear-gradient(135deg, #f59e0b, #f97316)';
    else if (gpa > 0)    card.style.background = 'linear-gradient(135deg, #ef4444, #f97316)';
    else                 card.style.background = 'linear-gradient(135deg, #0ea5e9, #6366f1)';
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
      <p class="text-xs text-muted font-semibold" style="margin-bottom:var(--sp-3); text-transform:uppercase; letter-spacing:0.06em;">Grade Breakdown</p>
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
              <span style="font-size:var(--fs-xs); color:rgba(255,255,255,0.75)">${c.grade} (${pts.toFixed(1)})</span>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.2); border-radius:9999px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:white; border-radius:9999px; transition:width 0.5s cubic-bezier(0.16,1,0.3,1);"></div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ================================================================
// ADD COURSE
// ================================================================
function initAddCourse() {
  const form = document.getElementById('add-course-form');
  if (!form) return;

  // Populate course datalist
  fetch('data/courses.json')
    .then(r => r.json())
    .then(data => {
      const list = document.getElementById('gpa-course-datalist');
      if (!list) return;
      const all = data.departments.flatMap(d => d.courses.map(c => c.code));
      list.innerHTML = all.map(c => `<option value="${c}">`).join('');
    }).catch(() => {});

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
  document.getElementById('clear-gpa-btn')?.addEventListener('click', () => {
    if (!confirm('Clear all courses? This cannot be undone.')) return;
    courses = [];
    saveGPACourses(courses);
    renderCourses();
    updateGPADisplay();
    showToast('All courses cleared.', 'warning');
  });
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  courses = getGPACourses();
  renderCourses();
  updateGPADisplay();
  initAddCourse();
  initClearAll();
});