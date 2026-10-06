(function () {
  "use strict";

  const STORAGE_KEY = "site-theme";

  function getSystemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved === "light" || saved === "dark") {
      return saved;
    }

    return getSystemTheme();
  }

  function applyTheme(theme) {
    const html = document.documentElement;
    const toggle = document.getElementById("themeToggle");

    if (theme === "light") {
      html.classList.add("light");

      if (toggle) {
        toggle.textContent = "🌙";
        toggle.setAttribute("aria-label", "فعال کردن حالت تاریک");
        toggle.setAttribute("title", "حالت تاریک");
      }
    } else {
      html.classList.remove("light");

      if (toggle) {
        toggle.textContent = "☀️";
        toggle.setAttribute("aria-label", "فعال کردن حالت روشن");
        toggle.setAttribute("title", "حالت روشن");
      }
    }
  }

  function toggleTheme() {
    const current = document.documentElement.classList.contains("light")
      ? "light"
      : "dark";

    const next = current === "light"
      ? "dark"
      : "light";

    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  function initTheme() {
    applyTheme(getSavedTheme());

    const toggle = document.getElementById("themeToggle");

    if (toggle) {
      toggle.addEventListener("click", toggleTheme);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})();
