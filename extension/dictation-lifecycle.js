(() => {
  const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
  const SILENCE_PEAK_THRESHOLD = 0.0001;
  const SIGNAL_SAMPLE_INTERVAL_MS = 100;

  function normalizeRequestId(value) {
    if (typeof value !== "string") {
      return "";
    }

    const normalized = value.trim();
    return REQUEST_ID_PATTERN.test(normalized) ? normalized : "";
  }

  function createRequestId(cryptoApi = globalThis.crypto) {
    if (typeof cryptoApi?.randomUUID === "function") {
      return cryptoApi.randomUUID();
    }

    if (typeof cryptoApi?.getRandomValues !== "function") {
      throw new Error("Secure request IDs are unavailable.");
    }

    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function getRequestReference(requestId) {
    const normalized = normalizeRequestId(requestId);
    return normalized ? normalized.replaceAll("-", "").slice(0, 8) : "";
  }

  function addRequestReference(message, requestId) {
    const reference = getRequestReference(requestId);
    return reference ? `${message} Reference: ${reference}.` : message;
  }

  function createRequestLifecycle(options = {}) {
    const AbortControllerClass = options.AbortControllerClass || globalThis.AbortController;
    let activeEntry = null;
    let sequence = 0;

    return Object.freeze({
      begin(requestId) {
        const normalized = normalizeRequestId(requestId);
        if (!normalized) {
          throw new Error("A valid request ID is required.");
        }

        sequence += 1;
        const controller = typeof AbortControllerClass === "function" ? new AbortControllerClass() : null;
        const operation = Object.freeze({
          requestId: normalized,
          sequence,
          signal: controller?.signal || null,
        });
        activeEntry = { controller, operation };
        return operation;
      },

      cancel() {
        const canceledEntry = activeEntry;
        activeEntry = null;
        sequence += 1;
        canceledEntry?.controller?.abort();
        return canceledEntry?.operation || null;
      },

      complete(operation) {
        if (!this.isCurrent(operation)) {
          return false;
        }

        activeEntry = null;
        return true;
      },

      getActiveRequestId() {
        return activeEntry?.operation.requestId || "";
      },

      isCurrent(operation) {
        return Boolean(
          operation &&
          activeEntry &&
          operation.requestId === activeEntry.operation.requestId &&
          operation.sequence === activeEntry.operation.sequence
        );
      },
    });
  }

  function createUnknownSignalMonitor() {
    return Object.freeze({
      getResult: () => "unknown",
      stop: () => Promise.resolve(),
    });
  }

  function createMicrophoneSignalMonitor(stream, options = {}) {
    const AudioContextClass = options.AudioContextClass || globalThis.AudioContext || globalThis.webkitAudioContext;
    const setIntervalFn = options.setIntervalFn || globalThis.setInterval;
    const clearIntervalFn = options.clearIntervalFn || globalThis.clearInterval;
    let audioContext = null;
    let analyser = null;
    let source = null;

    if (!stream || typeof AudioContextClass !== "function") {
      return createUnknownSignalMonitor();
    }

    try {
      audioContext = new AudioContextClass();
      analyser = audioContext.createAnalyser();
      source = audioContext.createMediaStreamSource(stream);
      const samples = new Float32Array(512);
      let peak = 0;
      let sampleCount = 0;
      let stopped = false;

      analyser.fftSize = samples.length;
      source.connect(analyser);

      function sampleSignal() {
        if (stopped) {
          return;
        }

        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) {
          peak = Math.max(peak, Math.abs(sample));
        }
        sampleCount += 1;
      }

      sampleSignal();
      const intervalId = setIntervalFn(sampleSignal, SIGNAL_SAMPLE_INTERVAL_MS);
      Promise.resolve(audioContext.resume?.()).catch(() => {});

      return Object.freeze({
        getResult() {
          const audioTracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
          const trackUnavailable = audioTracks.length === 0 || audioTracks.every(
            (track) => track.muted || track.readyState === "ended",
          );

          if (trackUnavailable) {
            return "silent";
          }

          if (sampleCount < 2) {
            return "unknown";
          }

          return peak <= SILENCE_PEAK_THRESHOLD ? "silent" : "signal";
        },

        async stop() {
          if (stopped) {
            return;
          }

          stopped = true;
          clearIntervalFn(intervalId);
          source.disconnect?.();
          analyser.disconnect?.();

          if (audioContext.state !== "closed") {
            await audioContext.close?.();
          }
        },
      });
    } catch (_error) {
      source?.disconnect?.();
      analyser?.disconnect?.();
      Promise.resolve(audioContext?.close?.()).catch(() => {});
      return createUnknownSignalMonitor();
    }
  }

  globalThis.DictozyLifecycle = Object.freeze({
    addRequestReference,
    createMicrophoneSignalMonitor,
    createRequestId,
    createRequestLifecycle,
    getRequestReference,
    normalizeRequestId,
  });
})();
