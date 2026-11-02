"use strict";

// All samples are fixed text. None of the guide's draft surfaces are editable.
const byId = (id) => document.getElementById(id);
const steps = [...document.querySelectorAll("[data-step]")];
const indexLinks = [...document.querySelectorAll(".guide-index a")];
const progressMarks = [...document.querySelectorAll(".guide-progress i")];
const compactIndex = window.matchMedia("(max-width: 760px)");
const originalDraft = byId("record-note").textContent;
const transcript = byId("sample-transcript").textContent;
const recordingLimit = 10;
let stepIndex = 0;
let timer;
let expiresAt = 0;
let phase = "idle";

function announce(message) {
  byId("guide-status").textContent = message;
}

// Only the visible step can own a timer (recording, sample delivery, or expiry).
function cancelTimer() {
  clearTimeout(timer);
  timer = undefined;
}

function recordingState(state) {
  const mic = byId("sample-mic");
  mic.dataset.state = state;
  const labels = {
    idle: "Start sample microphone",
    recording: "Stop sample recording",
    processing: "Cancel sample transcription",
  };
  mic.setAttribute("aria-label", labels[state]);
  byId("rec-panel").hidden = state !== "recording";
  byId("mic-hint").hidden = state === "recording";
  byId("mic-hint").textContent = state === "processing" ? "Transcribing sample…" : "Select the sample microphone";
  byId("cancel-recording-result").hidden = state !== "processing";
}

function clearScenes() {
  cancelTimer();
  expiresAt = 0;
  phase = "idle";
  recordingState("idle");
  byId("rec-timer").textContent = "0s elapsed · 10s left";
  for (const id of ["record-note", "insert-note", "recover-note"]) byId(id).textContent = originalDraft;
  byId("try-insert").hidden = false;
  byId("cancel-insert").hidden = true;
  byId("undo-insert").hidden = true;
  byId("edit-draft").hidden = false;
  byId("recovery-panel").hidden = true;
  byId("expire-sample").hidden = true;
  byId("sample-tray").hidden = true;
  byId("sample-tray-text").textContent = "";
  announce("");
}

function selectStep(index, moveFocus) {
  clearScenes();
  stepIndex = index;
  steps.forEach((step, i) => {
    step.hidden = i !== index;
    if (i === index) indexLinks[i].setAttribute("aria-current", "step");
    else indexLinks[i].removeAttribute("aria-current");
    progressMarks[i].classList.toggle("is-reached", i <= index);
  });
  byId("guide-progress").textContent = `Step ${index + 1} of ${steps.length}`;
  byId("guide-back").disabled = index === 0;
  byId("guide-next").hidden = index === steps.length - 1;
  byId("guide-skip").hidden = index === steps.length - 1;
  if (compactIndex.matches) byId("step-index").open = false;
  if (moveFocus) {
    steps[index].querySelector("h2").focus({ preventScroll: true });
    document.querySelector(".guide-workspace").scrollIntoView({ block: "start", behavior: "instant" });
  }
}

function navigate(index) {
  const hash = "#" + steps[index].id;
  if (location.hash !== hash) history.pushState(null, "", hash);
  selectStep(index, true);
}

function stepFromHash() {
  return steps.findIndex((step) => "#" + step.id === location.hash);
}

window.addEventListener("hashchange", () => {
  const index = stepFromHash();
  if (index !== -1 || !location.hash) selectStep(Math.max(0, index), true);
});

// Ordinary hrefs keep direct links, modified clicks and the no-script guide usable.
for (const link of [...indexLinks, byId("guide-skip")]) {
  link.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(steps.findIndex((step) => "#" + step.id === link.hash));
  });
}
byId("guide-back").addEventListener("click", () => navigate(stepIndex - 1));
byId("guide-next").addEventListener("click", () => navigate(stepIndex + 1));
byId("guide-reset").addEventListener("click", () => {
  vocabulary(false, false);
  navigate(0);
  announce("Guide reset. All sample actions and settings cleared.");
});

compactIndex.addEventListener("change", () => { byId("step-index").open = !compactIndex.matches; });

function startRecording() {
  phase = "recording";
  byId("record-note").textContent = originalDraft;
  recordingState("recording");
  announce("Sample recording started. Stop or discard the sample.");
  const started = Date.now();
  function tick() {
    const elapsed = Math.min(recordingLimit, Math.floor((Date.now() - started) / 1000));
    byId("rec-timer").textContent = `${elapsed}s elapsed · ${recordingLimit - elapsed}s left`;
    if (elapsed >= recordingLimit) startInsertion("record");
    else timer = setTimeout(tick, 250);
  }
  tick();
}

function startInsertion(scene) {
  cancelTimer();
  phase = "processing";
  if (scene === "record") {
    const moveFocus = byId("rec-panel").contains(document.activeElement);
    recordingState("processing");
    if (moveFocus) byId("cancel-recording-result").focus();
  } else {
    byId("try-insert").hidden = true;
    byId("cancel-insert").hidden = false;
    byId("cancel-insert").focus();
  }
  announce("Transcribing the sample. You can still cancel.");
  // An illustrative delay gives visitors time to cancel; it does not model service latency.
  timer = setTimeout(() => {
    phase = "idle";
    byId(scene + "-note").textContent = originalDraft + " " + transcript;
    if (scene === "record") {
      const moveFocus = document.activeElement === byId("cancel-recording-result");
      recordingState("idle");
      if (moveFocus) byId("sample-mic").focus();
    } else {
      const moveFocus = document.activeElement === byId("cancel-insert");
      byId("cancel-insert").hidden = true;
      byId("undo-insert").hidden = false;
      if (moveFocus) byId("undo-insert").focus();
    }
    announce("Sample transcript inserted into the draft.");
  }, 2400);
}

function cancelSample(message, focusControl) {
  clearScenes();
  if (focusControl) byId(focusControl).focus();
  announce(message);
}
byId("sample-mic").addEventListener("click", () => {
  if (phase === "recording") startInsertion("record");
  else if (phase === "processing") cancelSample("Transcription cancelled. No transcript will arrive.", "sample-mic");
  else startRecording();
});
byId("stop-recording").addEventListener("click", () => startInsertion("record"));
byId("discard-recording").addEventListener("click", () => cancelSample("Recording discarded. The draft is unchanged.", "sample-mic"));
byId("cancel-recording-result").addEventListener("click", () => cancelSample("Transcription cancelled. No transcript will arrive.", "sample-mic"));
byId("try-insert").addEventListener("click", () => startInsertion("insert"));
byId("cancel-insert").addEventListener("click", () => cancelSample("Transcription cancelled. No transcript will arrive.", "try-insert"));
byId("undo-insert").addEventListener("click", () => cancelSample("Sample insertion undone. The original draft is restored.", "try-insert"));

function finishRecovery(outcome) {
  const moveFocus = byId("recovery-panel").contains(document.activeElement) || document.activeElement === byId("expire-sample");
  if (Date.now() >= expiresAt) outcome = "expired";
  cancelTimer();
  phase = "idle";
  expiresAt = 0;
  byId("recovery-panel").hidden = true;
  byId("expire-sample").hidden = true;
  byId("sample-tray").hidden = outcome !== "copied";
  byId("sample-tray-text").textContent = outcome === "copied" ? transcript : "";
  byId("edit-draft").hidden = false;
  if (moveFocus) byId("edit-draft").focus();
  const action = outcome === "copied" ? "copied to the practice clipboard" : outcome;
  announce(`Sample transcript ${action}. Your edited draft is preserved.`);
}
byId("edit-draft").addEventListener("click", () => {
  phase = "recovery";
  expiresAt = Date.now() + 60000;
  byId("recover-note").textContent = "For our Friday studio visit:";
  byId("edit-draft").hidden = true;
  byId("sample-tray").hidden = true;
  byId("recovery-panel").hidden = false;
  byId("expire-sample").hidden = false;
  byId("copy-sample").focus();
  announce("The field changed. The sample is available to copy or discard for up to 60 seconds.");
  timer = setTimeout(() => finishRecovery("expired"), 60000);
});
byId("copy-sample").addEventListener("click", () => finishRecovery("copied"));
byId("discard-sample").addEventListener("click", () => finishRecovery("discarded"));
byId("expire-sample").addEventListener("click", () => finishRecovery("expired"));

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
  byId("share-term").focus();
  announce("Sample term saved. Sharing stays off.");
});
byId("share-term").addEventListener("click", () => {
  const enable = byId("share-term").getAttribute("aria-checked") !== "true";
  vocabulary(true, enable);
  announce(enable ? "Sharing enabled in this example. A future request would include Dictozy." : "Sharing off. The term stays in the sample list.");
});
byId("clear-term").addEventListener("click", () => {
  vocabulary(false, false);
  byId("save-term").focus();
  announce("Sample vocabulary cleared. Sharing is off.");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  if (phase === "recovery") {
    finishRecovery("discarded when the page was hidden");
  } else if (phase === "recording" || phase === "processing") {
    cancelSample("Sample cancelled because the page was hidden. The draft is unchanged.");
  }
});
window.addEventListener("pagehide", clearScenes);
document.querySelectorAll("[data-enhance]").forEach((element) => { element.hidden = false; });
const firstStep = stepFromHash();
selectStep(Math.max(0, firstStep), firstStep !== -1);
