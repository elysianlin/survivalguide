/**
 * dashboard.js
 * Inline dashboard logic extracted from index.html
 */

import { getAssignments } from './storage.js';
import { formatDate, daysUntil, dueDateClass } from './utils.js';
import { getGPACourses } from './storage.js';
import { calculateGPA } from './utils.js';

// Greeting
function initGreeting() {
  const greetEl = document.getElementById('greeting');
  if (!greetEl) return;
  
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  greetEl.textContent = `${g} — ${days[new Date().getDay()]}, ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`;
}

// Footer year
function initFooterYear() {
  const fy = document.getElementById('footer-year');
  if (fy) fy.textContent = new Date().getFullYear();
}

// Recent assignments widget
function initRecentAssignments() {
  const container = document.getElementById('recent-assignments');
  if (!container) return;

  const all = getAssignments()
    .filter(a => a.status !== 'done')
    .sort((a,b) => (a.dueDate||'9999') < (b.dueDate||'9999') ? -1 : 1)
    .slice(0, 5);

  if (all.length > 0) {
    container.innerHTML = all.map(a => {
      const dc = dueDateClass(a.dueDate);
      const days = daysUntil(a.dueDate);
      const daysStr = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today!' : `${days}d`;
      return `
        <div style="display:flex; align-items:center; gap:var(--sp-4); padding:var(--sp-3) 0; border-bottom:1px solid var(--clr-border)">
          <div style="flex:1">
            <div style="font-weight:600; font-size:var(--fs-sm)">${a.taskName}</div>
            <div style="font-size:var(--fs-xs); color:var(--clr-text-muted)">${a.courseName}</div>
          </div>
          <div style="text-align:right">
            <div class="due-date ${dc}" style="font-size:var(--fs-xs)">${daysStr}</div>
            <span class="badge badge-${a.priority}" style="margin-top:2px">${a.priority}</span>
          </div>
        </div>`;
    }).join('');
  }
}

// Header GPA
function initHeaderGPA() {
  const gpaCourses = getGPACourses();
  const gpa = calculateGPA(gpaCourses);
  const headerGpa = document.getElementById('header-gpa');
  if (headerGpa && gpaCourses.length > 0) headerGpa.textContent = gpa.toFixed(2);
}

// Initialize all dashboard features
document.addEventListener('DOMContentLoaded', () => {
  initGreeting();
  initFooterYear();
  initRecentAssignments();
  initHeaderGPA();
});
