const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadLifecycle(overrides = {}) {
  const context = {
    AbortController,
    Promise,
    Uint8Array,
    ...overrides,
  };
  context.globalThis = context;
  vm.createContext(context);

  const source = fs.readFileSync(path.join(__dirname, "..", "dictation-lifecycle.js"), "utf8");
  vm.runInContext(source, context);
  return context.DictozyLifecycle;
}

test("creates and safely shortens privacy-safe request IDs", () => {
  const lifecycle = loadLifecycle();
  const requestId = lifecycle.createRequestId({
    randomUUID: () => "12345678-1234-4567-89ab-123456789abc",
  });

  assert.equal(requestId, "12345678-1234-4567-89ab-123456789abc");
  assert.equal(lifecycle.normalizeRequestId(requestId), requestId);
  assert.equal(lifecycle.getRequestReference(requestId), "12345678");
  assert.equal(
    lifecycle.addRequestReference("Transcription failed.", requestId),
    "Transcription failed. Reference: 12345678.",
  );
  assert.equal(lifecycle.normalizeRequestId("contains private spaces"), "");
});

test("cancellation invalidates an operation and aborts its local signal", () => {
  const lifecycle = loadLifecycle().createRequestLifecycle();
  const first = lifecycle.begin("request-one-1234");

  assert.equal(lifecycle.isCurrent(first), true);
  assert.equal(first.signal.aborted, false);
  assert.equal(lifecycle.cancel(), first);
  assert.equal(first.signal.aborted, true);
  assert.equal(lifecycle.isCurrent(first), false);
  assert.equal(lifecycle.complete(first), false);
});

test("a retry is a distinct operation and rejects a late prior response", () => {
  const lifecycle = loadLifecycle().createRequestLifecycle();
  const failed = lifecycle.begin("failed-request-1234");

  assert.equal(lifecycle.complete(failed), true);

  const retry = lifecycle.begin("retry-request-5678");
  assert.notEqual(retry.requestId, failed.requestId);
  assert.notEqual(retry.sequence, failed.sequence);
  assert.equal(lifecycle.isCurrent(failed), false);
  assert.equal(lifecycle.isCurrent(retry), true);
});

function createSignalFixture(samples, tracks = [{ muted: false, readyState: "live" }]) {
  let intervalCallback = null;
  let intervalCleared = false;
  let sourceDisconnected = false;
  let analyserDisconnected = false;
  let contextClosed = false;
  let sampleIndex = 0;

  class FakeAudioContext {
    constructor() {
      this.state = "running";
    }

    createAnalyser() {
      return {
        disconnect() {
          analyserDisconnected = true;
        },
        getFloatTimeDomainData(buffer) {
          buffer.fill(0);
          buffer[0] = samples[Math.min(sampleIndex, samples.length - 1)] || 0;
          sampleIndex += 1;
        },
        set fftSize(_value) {},
      };
    }

    createMediaStreamSource() {
      return {
        connect() {},
        disconnect() {
          sourceDisconnected = true;
        },
      };
    }

    close() {
      contextClosed = true;
      this.state = "closed";
      return Promise.resolve();
    }

    resume() {
      return Promise.resolve();
    }
  }

  const stream = {
    getAudioTracks: () => tracks,
  };
  const options = {
    AudioContextClass: FakeAudioContext,
    clearIntervalFn() {
      intervalCleared = true;
    },
    setIntervalFn(callback) {
      intervalCallback = callback;
      return 7;
    },
  };

  return {
    getCleanupState: () => ({
      analyserDisconnected,
      contextClosed,
      intervalCleared,
      sourceDisconnected,
    }),
    options,
    sampleAgain: () => intervalCallback(),
    stream,
  };
}

test("microphone monitor detects only clearly silent local input", async () => {
  const lifecycle = loadLifecycle();
  const fixture = createSignalFixture([0, 0]);
  const monitor = lifecycle.createMicrophoneSignalMonitor(fixture.stream, fixture.options);

  fixture.sampleAgain();
  assert.equal(monitor.getResult(), "silent");

  await monitor.stop();
  assert.deepEqual(fixture.getCleanupState(), {
    analyserDisconnected: true,
    contextClosed: true,
    intervalCleared: true,
    sourceDisconnected: true,
  });
});

test("microphone monitor accepts a small but usable signal", async () => {
  const lifecycle = loadLifecycle();
  const fixture = createSignalFixture([0, 0.0002]);
  const monitor = lifecycle.createMicrophoneSignalMonitor(fixture.stream, fixture.options);

  fixture.sampleAgain();
  assert.equal(monitor.getResult(), "signal");
  await monitor.stop();
});

test("microphone monitor falls back safely when signal inspection is unavailable", async () => {
  const lifecycle = loadLifecycle({ AudioContext: undefined, webkitAudioContext: undefined });
  const monitor = lifecycle.createMicrophoneSignalMonitor({});

  assert.equal(monitor.getResult(), "unknown");
  await monitor.stop();
});
