/* Load synchronously in <head>, before the theme CSS. Light is the explicit default. */
(function () {
  var theme = "light";
  try { var saved = localStorage.getItem("awa-theme"); if (saved === "light" || saved === "dark") theme = saved; } catch (e) {}
  document.documentElement.dataset.awaTheme = theme;
})();
