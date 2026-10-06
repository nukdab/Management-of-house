(() => {
  "use strict";

  const root = document.documentElement;
  const themeToggle = document.getElementById("themeToggle");

  function getSavedTheme() {
    return localStorage.getItem("site-theme");
  }

  function getSystemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function applyTheme(theme) {
    const selectedTheme = theme === "light" ? "light" : "dark";

    root.classList.toggle("light", selectedTheme === "light");
    localStorage.setItem("site-theme", selectedTheme);

    if (themeToggle) {
      themeToggle.textContent =
        selectedTheme === "light" ? "🌙" : "☀️";

      themeToggle.setAttribute(
        "aria-label",
        selectedTheme === "light"
          ? "فعال کردن حالت تاریک"
          : "فعال کردن حالت روشن"
      );

      themeToggle.title =
        selectedTheme === "light"
          ? "حالت تاریک"
          : "حالت روشن";
    }
  }

  const savedTheme = getSavedTheme();
  applyTheme(savedTheme || getSystemTheme());

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const nextTheme = root.classList.contains("light")
        ? "dark"
        : "light";

      applyTheme(nextTheme);
    });
  }
})();
