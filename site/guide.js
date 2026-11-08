"use strict";

// Fixed, noneditable samples only. No microphone, network, clipboard or storage APIs.
const byId = (id) => document.getElementById(id);
const originalDraft = byId("record-note").textContent;
const transcript = byId("sample-transcript").textContent;
const recordingLimit = 10;
let phase = "ready";
let mainTimer;
let mainGeneration = 0;
let recoveryTimer;
let recoveryGeneration = 0;
let expiresAt = 0;

function cancelMainTimer() {
  clearTimeout(mainTimer);
  mainTimer = undefined;
  mainGeneration += 1;
}

function renderMain(message, focusTarget) {
  const active = document.activeElement;
  byId("sample-mic").hidden = phase !== "ready";
  byId("rec-panel").hidden = phase !== "recording";
  byId("processing-state").hidden = phase !== "processing";
  byId("finish-actions").hidden = phase !== "finished" && phase !== "undone";
  byId("undo-insert").hidden = phase !== "finished";
  byId("guide-status").textContent = message;
  // Restore only focus owned by a control that this transition removed.
  if (byId("record").contains(active) && active.closest("[hidden]") && focusTarget) {
    byId(focusTarget).focus({ preventScroll: true });
  }
}

function resetMain(message = "Select the microphone to start the demo.", restoreFocus = true) {
  cancelMainTimer();
  phase = "ready";
  byId("record-note").textContent = originalDraft;
  byId("rec-timer").textContent = "0s elapsed · 10s left";
  renderMain(message, restoreFocus ? "sample-mic" : null);
}

function startRecording() {
  if (phase !== "ready" || document.hidden) return;
  cancelMainTimer();
  phase = "recording";
  renderMain("Select Stop to add the sample text.", "stop-recording");
  const generation = mainGeneration;
  const started = Date.now();
  function tick() {
    if (generation !== mainGeneration || phase !== "recording") return;
    const elapsed = Math.min(recordingLimit, Math.floor((Date.now() - started) / 1000));
    byId("rec-timer").textContent = `${elapsed}s elapsed · ${recordingLimit - elapsed}s left`;
    if (elapsed >= recordingLimit) startInsertion();
    else mainTimer = setTimeout(tick, 250);
  }
  tick();
}

function startInsertion() {
  if (phase !== "recording" || document.hidden) return;
  cancelMainTimer();
  phase = "processing";
  renderMain("Processing the sample. You can still cancel.", "cancel-recording-result");
  const generation = mainGeneration;
  // Illustrative delay for cancellation; not a measurement of service latency.
  mainTimer = setTimeout(() => {
    if (generation !== mainGeneration || phase !== "processing" || document.hidden) return;
    mainTimer = undefined;
    phase = "finished";
    byId("record-note").textContent = originalDraft + " " + transcript;
    renderMain("Your sample text is ready.", "undo-insert");
  }, 2400);
}

byId("sample-mic").addEventListener("click", startRecording);
byId("stop-recording").addEventListener("click", startInsertion);
byId("discard-recording").addEventListener("click", () => {
  if (phase === "recording") resetMain("Discarded. Your note is unchanged.");
});
byId("cancel-recording-result").addEventListener("click", () => {
  if (phase === "processing") resetMain("Cancelled. Your note is unchanged.");
});
byId("undo-insert").addEventListener("click", () => {
  if (phase !== "finished") return;
  cancelMainTimer();
  phase = "undone";
  byId("record-note").textContent = originalDraft;
  renderMain("Undone. Your original note is back.", "replay-demo");
});
byId("replay-demo").addEventListener("click", () => resetMain());

function cancelRecoveryTimer() {
  clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
  recoveryGeneration += 1;
}

function clearRecovery(message = "", restoreFocus = false) {
  const active = document.activeElement;
  const removedFocus = byId("recovery-panel").contains(active);
  cancelRecoveryTimer();
  expiresAt = 0;
  byId("recovery-panel").hidden = true;
  byId("sample-tray").hidden = true;
  byId("sample-tray-text").textContent = "";
  byId("edit-draft").hidden = false;
  byId("recovery-status").textContent = message;
  if (restoreFocus && removedFocus) byId("edit-draft").focus({ preventScroll: true });
}

function finishRecovery(outcome) {
  if (!expiresAt) return;
  if (Date.now() >= expiresAt) outcome = "expired";
  clearRecovery(`Sample transcript ${outcome === "copied" ? "copied to the practice clipboard" : outcome}. Your edited draft is preserved.`, true);
  if (outcome === "copied") {
    byId("sample-tray-text").textContent = transcript;
    byId("sample-tray").hidden = false;
  }
}
byId("edit-draft").addEventListener("click", () => {
  if (!byId("recover").open || document.hidden) return;
  clearRecovery();
  expiresAt = Date.now() + 60000;
  const generation = recoveryGeneration;
  byId("recover-note").textContent = "For our Friday studio visit:";
  byId("edit-draft").hidden = true;
  byId("recovery-panel").hidden = false;
  byId("copy-sample").focus({ preventScroll: true });
  byId("recovery-status").textContent = "Your edited draft is preserved. Copy or discard within 60 seconds.";
  recoveryTimer = setTimeout(() => {
    if (generation === recoveryGeneration) finishRecovery("expired");
  }, 60000);
});
byId("copy-sample").addEventListener("click", () => finishRecovery("copied"));
byId("discard-sample").addEventListener("click", () => finishRecovery("discarded"));
byId("recover").addEventListener("toggle", () => {
  if (!byId("recover").open) {
    const summary = byId("recover").querySelector("summary");
    const focusWasInside = byId("recover").contains(document.activeElement) && document.activeElement !== summary;
    clearRecovery();
    if (focusWasInside) summary.focus({ preventScroll: true });
  }
});

function vocabulary(saved, enabled) {
  byId("save-term").hidden = saved;
  byId("clear-term").hidden = !saved;
  byId("term-state").textContent = saved ? "Saved in this example" : "Unsaved sample";
  byId("share-term").disabled = !saved;
  byId("share-term").setAttribute("aria-checked", String(enabled));
  byId("share-state").textContent = enabled ? "On" : "Off";
  byId("term-result").textContent = enabled ? "Would include Dictozy" : "No vocabulary";
}
byId("save-term").addEventListener("click", () => {
  vocabulary(true, false);
  byId("share-term").focus({ preventScroll: true });
  byId("vocabulary-status").textContent = "Saved. Sharing is still off.";
});
byId("share-term").addEventListener("click", () => {
  const enabled = byId("share-term").getAttribute("aria-checked") !== "true";
  vocabulary(true, enabled);
  byId("vocabulary-status").textContent = enabled ? "Sharing enabled in this example. Nothing is sent." : "Sharing off. The sample term stays saved.";
});
byId("clear-term").addEventListener("click", () => {
  vocabulary(false, false);
  byId("save-term").focus({ preventScroll: true });
  byId("vocabulary-status").textContent = "Sample vocabulary cleared. Sharing is off.";
});

// Keep native fragment navigation and browser history; reveal without starting a sample.
function revealFragment() {
  const id = location.hash.slice(1);
  byId("insert-guidance").hidden = id !== "insert";
  let target;
  if (["install", "recover", "vocabulary"].includes(id)) {
    const details = byId(id);
    details.open = true;
    target = details.querySelector("summary");
  } else if (id === "record" || id === "insert") target = byId("record-title");
  else if (id === "troubleshoot") target = byId("troubleshoot").querySelector("a");
  if (target) {
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: "instant" });
  }
}
window.addEventListener("hashchange", revealFragment);
// Initial native anchor navigation happens after deferred scripts execute.
window.addEventListener("pageshow", revealFragment);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  if (phase === "recording" || phase === "processing") {
    resetMain("Sample cancelled because the page was hidden. Your note is unchanged.", false);
  }
  clearRecovery("Sample recovery cleared because the page was hidden.");
});
window.addEventListener("pagehide", () => {
  resetMain("Select the microphone to start the demo.", false);
  clearRecovery();
});
document.querySelectorAll("[data-enhance]").forEach((element) => { element.hidden = false; });
