/**
 * main.js
 * Dashboard page logic: quotes, countdown, pomodoro, stats, theme toggle.
 * Used by index.html
 */

import { getAssignments, getExams } from './storage.js';
import { daysUntil, showToast, launchConfetti } from './utils.js';
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
async function initDashboardData() {
  try {
    // Fetch both JSON files simultaneously
    const [quotesResponse, coursesResponse] = await Promise.all([
      fetch('js/quotes.json'),
      fetch('js/courses.json')
    ]);

    // Parse the JSON data
    const quotes = await quotesResponse.json();
    const courses = await coursesResponse.json();

    // 1. Populate a Random Quote
    const quoteTextEl = document.getElementById('quote-text');
    const quoteAuthorEl = document.getElementById('quote-author');
    
    // Only try to update the DOM if the elements exist on the current page
    if (quoteTextEl && quoteAuthorEl && quotes.length > 0) {
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      quoteTextEl.textContent = `"${randomQuote.text}"`;
      quoteAuthorEl.textContent = `— ${randomQuote.author}`;
    }

    // 2. Populate the Courses into the Countdown List
    const countdownList = document.getElementById('countdown-list');
    
    // Append the courses to existing items
    if (countdownList && courses.length > 0) {
      const coursesHTML = courses.map(course => `
        <div style="display:flex; justify-content:space-between; padding:var(--sp-2) 0; border-bottom:1px solid var(--clr-border)">
          <div>
            <strong>${course.code}</strong>
            <div style="font-size:var(--fs-xs); color:var(--clr-text-muted)">${course.name}</div>
          </div>
          <span class="badge badge-medium">${course.credits} Cr</span>
        </div>
      `).join('');
      
      countdownList.innerHTML += coursesHTML;
    }

  } catch (error) {
    console.error("Error loading JSON data:", error);
  }
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
            <i class="ti ti-calendar-off"></i>
          </div>
          <p>No exams added yet.<br>
          <a href="planner.html" style="display: inline-flex; align-items: center; gap: 4px; margin-top: var(--sp-1)">
            Add an exam <i class="ti ti-arrow-right" style="font-size: 0.9rem; margin: 0"></i>
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
        modeLabel.innerHTML = `<i class="ti ti-cup"></i> Break`;
      } else {
        modeLabel.innerHTML = `<i class="ti ti-book"></i> Study`;
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
      startBtn.innerHTML = `<i class="ti ti-player-play"></i> Start`;

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
    startBtn.innerHTML = `<i class="ti ti-player-play"></i> Start`;
  } else {
    interval   = setInterval(tick, 1000);
    isRunning  = true;
    // Upgraded to vector icon + text label state
    startBtn.innerHTML = `<i class="ti ti-player-pause"></i> Pause`;
  }
  });

  resetBtn?.addEventListener('click', () => {
    clearInterval(interval);
    isRunning  = false;
    isBreak    = false;
    remaining  = STUDY_SECS;
    startBtn.textContent = '▶';
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
    if (icon)  icon.innerHTML = `<i class="ti ti-confetti"></i>`;
    if (title) title.textContent = 'Session Complete!';
    if (msg)   msg.textContent   = 'Great work! Time for a 5-minute break.';
    launchConfetti(40);
  } else {
    // Upgraded to a strength/focus barbell or armchair vector instead of the muscle emoji
    if (icon)  icon.innerHTML = `<i class="ti ti-barbell"></i>`;
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
  initDashboardData();
  initCountdowns();
  initStats();
  initPomodoro();
  initNewsletter();
});