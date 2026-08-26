(() => {
  const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
  const MAX_AUDIO_BASE64_LENGTH = 4 * Math.ceil(MAX_AUDIO_UPLOAD_BYTES / 3);
  const AUDIO_FILE_EXTENSIONS = Object.freeze({
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-m4a": "m4a",
  });
  const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

  function getDecodedBase64Size(value) {
    if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) {
      return -1;
    }

    if (!BASE64_PATTERN.test(value)) {
      return -1;
    }

    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    return (value.length / 4) * 3 - padding;
  }

  function prepareAudioDataUrl(dataUrl, options = {}) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return { ok: false, reason: "invalid" };
    }

    const separatorIndex = dataUrl.indexOf(",");
    if (separatorIndex < 0 || separatorIndex > 200) {
      return { ok: false, reason: "invalid" };
    }

    const metadataParts = dataUrl.slice(5, separatorIndex).split(";");
    const mimeType = (metadataParts.shift() || "").trim().toLowerCase();
    const encoding = (metadataParts.pop() || "").trim().toLowerCase();
    const extension = AUDIO_FILE_EXTENSIONS[mimeType];

    if (!extension || encoding !== "base64") {
      return { ok: false, reason: "invalid" };
    }

    const base64Audio = dataUrl.slice(separatorIndex + 1);
    if (base64Audio.length > MAX_AUDIO_BASE64_LENGTH) {
      return { ok: false, reason: "too_large" };
    }

    const decodedSize = getDecodedBase64Size(base64Audio);
    if (decodedSize < 1) {
      return { ok: false, reason: "invalid" };
    }

    if (decodedSize > MAX_AUDIO_UPLOAD_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    const decodeBase64 = options.atob || globalThis.atob;
    const BlobClass = options.Blob || globalThis.Blob;

    try {
      const binary = decodeBase64(base64Audio);
      if (binary.length !== decodedSize) {
        return { ok: false, reason: "invalid" };
      }

      const audioBytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        audioBytes[index] = binary.charCodeAt(index);
      }

      return {
        ok: true,
        blob: new BlobClass([audioBytes], { type: mimeType }),
        extension,
        mimeType,
      };
    } catch (_error) {
      return { ok: false, reason: "invalid" };
    }
  }

  globalThis.DictozyBackgroundUtils = Object.freeze({
    AUDIO_FILE_EXTENSIONS,
    MAX_AUDIO_BASE64_LENGTH,
    MAX_AUDIO_UPLOAD_BYTES,
    getDecodedBase64Size,
    prepareAudioDataUrl,
  });
})();
