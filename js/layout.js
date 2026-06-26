/**
 * layout.js
 * Shared chrome behavior used by every page: theme toggle, mobile nav
 * drawer, active-nav-link highlighting, and footer year.
 *
 * This used to be copy-pasted as an inline <script type="module"> block
 * in index.html, planner.html, and gpa.html. It's now a single ES module
 * imported by each page's own script (main.js / planner.js / gpa.js),
 * so there is no inline JavaScript left in any HTML file.
 */

import { getTheme, saveTheme } from './storage.js';

// ---- Theme ----
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const iconEl = document.getElementById('theme-toggle-icon');
  if (iconEl) iconEl.className = theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
}

function initTheme() {
  applyTheme(getTheme());
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
  });
}

// ---- Mobile nav drawer ----
function initMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const mobileNav  = document.getElementById('mobile-nav');
  if (!hamburger || !mobileNav) return;

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileNav.classList.toggle('open');
  });

  // Close drawer when a link inside it is tapped
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileNav.classList.remove('open');
    });
  });
}

// ---- Active nav link highlighting ----
function initActiveNav() {
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

// ---- Footer year ----
function initFooterYear() {
  const fy = document.getElementById('footer-year');
  if (fy) fy.textContent = new Date().getFullYear();
}

/**
 * Run all shared layout behaviors. Call once from each page's
 * DOMContentLoaded handler.
 */
export function initLayout() {
  initTheme();
  initMobileNav();
  initActiveNav();
  initFooterYear();
}