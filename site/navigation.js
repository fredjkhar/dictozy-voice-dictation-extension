"use strict";

// The native disclosure handles activation, expanded state and the no-script menu.
(() => {
  const menu = document.querySelector("details.site-menu");
  if (!menu) return;
  const toggle = menu.querySelector("summary");

  function closeOutside(event) {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  }
  document.addEventListener("pointerdown", closeOutside);
  document.addEventListener("focusin", closeOutside);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    event.preventDefault();
    menu.open = false;
    toggle.focus({ preventScroll: true });
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) menu.open = false;
  });

  window.addEventListener("resize", () => {
    if (menu.open && !menu.getClientRects().length) menu.open = false;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) menu.open = false;
  });
})();
