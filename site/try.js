"use strict";
(() => {
  const frame = document.getElementById("writing-workspace");
  if (window !== window.top) {
    document.getElementById("workspace-embed-warning").hidden = false;
    return;
  }
  frame.hidden = false;
  // Only dimensions cross the boundary. Never receive text, audio or settings here.
  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin ||
        event.data?.type !== "dictozy-workspace-size" || !Number.isFinite(event.data.height)) return;
    const height = Math.max(460, Math.min(4000, Math.ceil(event.data.height)));
    frame.style.height = `${height}px`;
  });
})();
