/**
 * shared-ui.js
 * Site-chrome behavior shared by every page: dark/light theme toggle,
 * mobile nav drawer, active nav-link highlighting, and the footer year.
 * Importing initSharedUI() keeps each page's HTML free of inline <script>
 * blocks so all logic lives in proper ES modules.
 */

import { getTheme, saveTheme, getGPACourses } from './storage.js';
import { calculateGPA } from './utils.js';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const iconEl = document.getElementById('theme-toggle-icon');
  if (iconEl) {
    iconEl.className = theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
  }
}

function initTheme() {
  applyTheme(getTheme());
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
  });
}

function initHamburger() {
  const hamburger = document.getElementById('hamburger');
  const mobileNav  = document.getElementById('mobile-nav');
  if (!hamburger || !mobileNav) return;
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileNav.classList.toggle('open');
    const isOpen = mobileNav.classList.contains('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });
  // Close the drawer whenever a nav link inside it is clicked
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileNav.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
}

function initActiveNav(currentPage) {
  const page = currentPage || location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = (link.getAttribute('href') || '').split('/').pop();
    if (href === page) link.classList.add('active');
  });
}

function initFooterYear() {
  const fy = document.getElementById('footer-year');
  if (fy) fy.textContent = new Date().getFullYear();
}

function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

function initHeaderGPA() {
  const headerGpa = document.getElementById('header-gpa');
  if (!headerGpa) return;
  const courses = getGPACourses();
  if (courses.length === 0) return;
  headerGpa.textContent = calculateGPA(courses).toFixed(2);
}

/**
 * Wire up every shared chrome behavior in one call.
 * @param {string} [currentPage] explicit page filename (e.g. "gpa.html")
 *   to use for active-nav matching; falls back to the URL path.
 */
export function initSharedUI(currentPage) {
  initTheme();
  initHamburger();
  initActiveNav(currentPage);
  initFooterYear();
  initHeaderScroll();
  initHeaderGPA();
}
