/* Load with defer after awa-theme-init.js. Picker buttons use data-awa-theme-option. */
(function () {
  function apply(theme, save) {
    if (theme !== "light" && theme !== "dark") theme = "light";
    document.documentElement.dataset.awaTheme = theme;
    document.querySelectorAll("[data-awa-theme-option]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.awaThemeOption === theme));
    });
    if (save) { try { localStorage.setItem("awa-theme", theme); } catch (e) {} }
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-awa-theme-option]");
    if (button && !button.disabled) apply(button.dataset.awaThemeOption, true);
  });
  window.addEventListener("storage", function (event) {
    if (event.key === "awa-theme" || event.key === null) apply(event.newValue, false);
  });
  apply(document.documentElement.dataset.awaTheme, false);
})();
