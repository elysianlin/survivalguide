/**
 * main.js
 * Dashboard page logic: quotes, countdown, pomodoro, stats, theme toggle.
 * Used by index.html
 */

import { getAssignments, getExams } from './storage.js';
import { daysUntil, showToast, launchConfetti, onIdle } from './utils.js';
import { initLayout } from './layout.js';

// ================================================================
// HEADER SCROLL SHADOW
// ================================================================
function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

// ================================================================
// DAILY QUOTE AND COURSES (JSON FETCH)
// ================================================================
let allQuotes = [];

function renderRandomQuote() {
  const quoteTextEl = document.getElementById('quote-text');
  const quoteAuthorEl = document.getElementById('quote-author');
  if (!quoteTextEl || !quoteAuthorEl || allQuotes.length === 0) return;
  const q = allQuotes[Math.floor(Math.random() * allQuotes.length)];
  quoteTextEl.textContent = `"${q.text}"`;
  quoteAuthorEl.textContent = `— ${q.author}`;
}

// Runs a callback once the browser is idle (or after a short timeout as a
// fallback) so non-critical work doesn't compete with the initial render.
// (Shared implementation lives in utils.js — imported above.)

async function initQuotes() {
  try {
    const res = await fetch('data/quotes.json');
    if (!res.ok) throw new Error('Quotes fetch failed');
    allQuotes = await res.json();
    renderRandomQuote();
  } catch (error) {
    console.error("Error loading quotes:", error);
    const quoteTextEl = document.getElementById('quote-text');
    if (quoteTextEl) quoteTextEl.textContent = "Keep going — you've got this!";
  }
}

// The full course catalog (courses.json) is a large file only needed for
// the "This Semester" sidebar chips — below-the-fold, non-critical content.
// Deferring it to idle time keeps it from competing with fonts/CSS/quotes
// for bandwidth and main-thread parse time during the initial render.
function initCourseChips() {
  onIdle(async () => {
    try {
      const res = await fetch('data/courses.json');
      if (!res.ok) throw new Error('Courses fetch failed');
      const courseData = await res.json();
      const courses = (courseData.departments || []).flatMap(d => d.courses);

      const countdownList = document.getElementById('countdown-list');
      if (countdownList && courses.length > 0 && countdownList.children.length === 0) {
        const coursesHTML = courses.slice(0, 5).map(course => `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:var(--sp-3); padding:var(--sp-2) 0; border-bottom:1px solid var(--clr-border)">
            <div>
              <strong>${course.code}</strong>
              <div style="font-size:var(--fs-xs); color:var(--clr-text-muted)">${course.name}</div>
            </div>
            <span class="badge badge-medium" style="background:${course.color}22; color:${course.color}">${course.credits} Cr</span>
          </div>
        `).join('');
        countdownList.insertAdjacentHTML('afterbegin', coursesHTML);
      }
    } catch (error) {
      console.error("Error loading course chips:", error);
    }
  });
}

// Quote refresh button now cycles through the fetched list instead of reloading
function initQuoteRefresh() {
  document.getElementById('quote-refresh')?.addEventListener('click', renderRandomQuote);
}

// ================================================================
// EXAM COUNTDOWN
// ================================================================
function initCountdowns() {
  const container = document.getElementById('countdown-list');
  if (!container) return;

  function render() {
    const exams = getExams();
    if (exams.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--sp-8);">
          <div class="empty-icon">
            <i class="ti ti-calendar-off" aria-hidden="true"></i>
          </div>
          <p>No exams added yet.<br>
          <a href="planner.html" style="display: inline-flex; align-items: center; gap: 4px; margin-top: var(--sp-1)">
            Add an exam <i class="ti ti-arrow-right" style="font-size: 0.9rem; margin: 0" aria-hidden="true"></i>
          </a></p>
        </div>`;
      return;
    }

    // Sort by soonest first, filter past exams
    const upcoming = exams
      .map(e => ({ ...e, days: daysUntil(e.date) }))
      .filter(e => e.days >= 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, 5);

    container.innerHTML = upcoming.map(exam => {
      const urgency = exam.days <= 1 ? 'urgent' : exam.days <= 7 ? 'warning' : 'safe';
      return `
        <div class="countdown-item ${urgency}">
          <div style="text-align: center; min-width: 50px;">
            <div class="countdown-days">${exam.days}</div>
            <div class="countdown-label">days</div>
          </div>
          <div class="countdown-info">
            <div class="countdown-name">${exam.name}</div>
            <div class="countdown-course">${exam.course}</div>
          </div>
        </div>`;
    }).join('');
  }

  render();
}

// ================================================================
// STATS
// ================================================================
function initStats() {
  const assignments = getAssignments();
  const total     = assignments.length;
  const done      = assignments.filter(a => a.status === 'done').length;
  const pending   = assignments.filter(a => a.status === 'pending').length;
  const overdue   = assignments.filter(a => a.status !== 'done' && daysUntil(a.dueDate) < 0).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-total', total);
  set('stat-done', done);
  set('stat-pending', pending);
  set('stat-overdue', overdue);
}

// ================================================================
// POMODORO TIMER
// ================================================================
function initPomodoro() {
  const timeEl      = document.getElementById('pomodoro-time');
  const modeLabel   = document.getElementById('pomodoro-mode');
  const startBtn    = document.getElementById('pomodoro-start');
  const resetBtn    = document.getElementById('pomodoro-reset');
  const progressEl  = document.getElementById('pomodoro-progress');
  const dotsEl      = document.getElementById('pomodoro-dots');
  if (!timeEl) return;

  const STUDY_SECS = 25 * 60;
  const BREAK_SECS = 5 * 60;
  const CIRCUMFERENCE = 2 * Math.PI * 70; // r=70

  if (progressEl) progressEl.style.strokeDasharray = CIRCUMFERENCE;

  let remaining  = STUDY_SECS;
  let isRunning  = false;
  let isBreak    = false;
  let interval   = null;
  let sessions   = 0;

  function updateDisplay() {
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    timeEl.textContent = `${m}:${s}`;

    const total  = isBreak ? BREAK_SECS : STUDY_SECS;
    const offset = CIRCUMFERENCE * (1 - remaining / total);
    if (progressEl) {
      progressEl.style.strokeDashoffset = offset;
      progressEl.setAttribute('class', `pomodoro-progress${isBreak ? ' break' : ''}`);
    }
    
    // Dynamically inject vector icon classes alongside text states
    if (modeLabel) {
      if (isBreak) {
        modeLabel.innerHTML = `<i class="ti ti-cup" aria-hidden="true"></i> Break`;
      } else {
        modeLabel.innerHTML = `<i class="ti ti-book" aria-hidden="true"></i> Study`;
      }
    }
  }

  function updateDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = Array.from({ length: 4 }, (_, i) =>
      `<div class="session-dot${i < sessions ? ' completed' : ''}"></div>`
    ).join('');
  }

  function tick() {
    if (remaining <= 0) {
      clearInterval(interval);
      isRunning = false;
      startBtn.innerHTML = `<i class="ti ti-player-play" aria-hidden="true"></i> Start`;
      startBtn.setAttribute('aria-label', 'Start timer');

      if (!isBreak) {
        sessions = (sessions + 1) % 5;
        updateDots();
        showTimerCompleteModal('study');
      } else {
        showTimerCompleteModal('break');
      }

      isBreak = !isBreak;
      remaining = isBreak ? BREAK_SECS : STUDY_SECS;
      updateDisplay();
      return;
    }
    remaining--;
    updateDisplay();
  }

  startBtn?.addEventListener('click', () => {
  if (isRunning) {
    clearInterval(interval);
    isRunning  = false;
    // Upgraded to vector icon + text label state
    startBtn.innerHTML = `<i class="ti ti-player-play" aria-hidden="true"></i> Start`;
    startBtn.setAttribute('aria-label', 'Start timer');
  } else {
    interval   = setInterval(tick, 1000);
    isRunning  = true;
    // Upgraded to vector icon + text label state
    startBtn.innerHTML = `<i class="ti ti-player-pause" aria-hidden="true"></i> Pause`;
    startBtn.setAttribute('aria-label', 'Pause timer');
  }
  });

  resetBtn?.addEventListener('click', () => {
    clearInterval(interval);
    isRunning  = false;
    isBreak    = false;
    remaining  = STUDY_SECS;
    startBtn.innerHTML = `<i class="ti ti-player-play" aria-hidden="true"></i> Start`;
    startBtn.setAttribute('aria-label', 'Start timer');
    updateDisplay();
  });

  updateDisplay();
  updateDots();
}

// ================================================================
// TIMER COMPLETE MODAL
// ================================================================
function showTimerCompleteModal(type) {
  const overlay = document.getElementById('timer-modal');
  const icon    = document.getElementById('timer-modal-icon');
  const title   = document.getElementById('timer-modal-title');
  const msg     = document.getElementById('timer-modal-msg');
  if (!overlay) return;

  if (type === 'study') {
    // Upgraded to celebratory confetti vectors
    if (icon)  icon.innerHTML = `<i class="ti ti-confetti" aria-hidden="true"></i>`;
    if (title) title.textContent = 'Session Complete!';
    if (msg)   msg.textContent   = 'Great work! Time for a 5-minute break.';
    launchConfetti(40);
  } else {
    // Upgraded to a strength/focus barbell or armchair vector instead of the muscle emoji
    if (icon)  icon.innerHTML = `<i class="ti ti-barbell" aria-hidden="true"></i>`;
    if (title) title.textContent = 'Break Over!';
    if (msg)   msg.textContent   = "Ready to dive back in? You've got this!";
  }

  overlay.classList.add('open');
  document.getElementById('timer-modal-close')?.addEventListener('click', () => {
    overlay.classList.remove('open');
  }, { once: true });
}

// ================================================================
// NEWSLETTER FOOTER FORM
// ================================================================
function initNewsletter() {
  const form  = document.getElementById('newsletter-form');
  const msgEl = document.getElementById('subscribe-msg');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailInput = form.querySelector('input[type="email"]');
    const email = emailInput?.value.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (msgEl) { msgEl.style.color = 'var(--clr-danger)'; msgEl.textContent = 'Please enter a valid email.'; }
      return;
    }

    import('./storage.js').then(({ saveNewsletterEmail }) => saveNewsletterEmail(email));
    if (msgEl) { msgEl.style.color = 'var(--clr-success)'; msgEl.textContent = '✓ You\'re subscribed!'; }
    if (emailInput) emailInput.value = '';
    showToast('Subscribed to study tips!', 'success');
  });
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  initLayout();
  initHeaderScroll();
  initQuotes();
  initCourseChips();
  initQuoteRefresh();
  initCountdowns();
  initStats();
  initPomodoro();
  initNewsletter();
});