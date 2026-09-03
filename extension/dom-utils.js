(() => {
  const SUPPORTED_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel"]);
  const IGNORED_INPUT_TYPES = new Set(["password", "file", "checkbox", "radio", "hidden"]);
  const PAYMENT_AUTOCOMPLETE_PATTERN = /^(?:cc-.+|transaction-(?:amount|currency))$/i;
  const PAYMENT_METADATA_TOKENS = new Set([
    "card",
    "cardholder",
    "credit",
    "csc",
    "cvc",
    "cvv",
    "expiration",
    "expiry",
    "iban",
    "payment",
  ]);
  const COMPACT_PAYMENT_PATTERN = /^(?:card(?:holder|name|number|type|expiry|expiration|csc|cvc|cvv)|cc(?:name|number|type|exp|expiry|csc|cvc|cvv)|creditcard|paymentcard|ibannumber)/;
  const EDITABLE_FIELD_SELECTOR = '[contenteditable]:not([contenteditable="false"])';
  const NO_SPACE_BEFORE_PATTERN = /^[,.;:!?%')\]}]/;
  const NO_SPACE_AFTER_PATTERN = /[(\[{]$/;

  function getEditableField(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return target;
    }

    const field = target.closest(EDITABLE_FIELD_SELECTOR);
    const blockedRegion = target.closest('[contenteditable="false"]');

    if (blockedRegion && field?.contains(blockedRegion)) {
      return null;
    }

    return field;
  }

  function hasPaymentSignal(element) {
    const autocomplete = element.getAttribute("autocomplete") || "";
    const autocompleteTokens = autocomplete.trim().split(/\s+/).filter(Boolean);

    if (autocompleteTokens.some((token) => PAYMENT_AUTOCOMPLETE_PATTERN.test(token))) {
      return true;
    }

    const metadataValues = [
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("inputmode"),
    ];

    return metadataValues.some((value) => {
      if (!value) {
        return false;
      }

      const normalized = value
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      const tokens = normalized.split(/\s+/).filter(Boolean);

      if (tokens.some((token) => PAYMENT_METADATA_TOKENS.has(token))) {
        return true;
      }

      return COMPACT_PAYMENT_PATTERN.test(tokens.join(""));
    });
  }

  function isHidden(element) {
    if (
      element.hidden ||
      element.closest?.("[hidden]") ||
      element.closest?.('[aria-hidden="true"]')
    ) {
      return true;
    }

    if (element instanceof HTMLInputElement && element.type.toLowerCase() === "hidden") {
      return true;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return true;
    }

    return typeof element.getClientRects === "function" && element.getClientRects().length === 0;
  }

  function isConnected(element) {
    return element.isConnected !== false;
  }

  function isSupportedField(element) {
    if (!element || !isConnected(element) || isHidden(element) || hasPaymentSignal(element)) {
      return false;
    }

    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled && !element.readOnly;
    }

    if (element instanceof HTMLInputElement) {
      const inputType = element.type.toLowerCase();

      return (
        SUPPORTED_INPUT_TYPES.has(inputType) &&
        !IGNORED_INPUT_TYPES.has(inputType) &&
        !element.disabled &&
        !element.readOnly
      );
    }

    if (element.matches(EDITABLE_FIELD_SELECTOR)) {
      return (
        element.isContentEditable &&
        element.getAttribute("aria-disabled") !== "true" &&
        element.getAttribute("aria-readonly") !== "true"
      );
    }

    return false;
  }

  function dispatchBeforeInputEvent(element, text) {
    return element.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: text,
      inputType: "insertText",
    }));
  }

  function dispatchChangeEvent(element) {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function dispatchInputEvents(element, text) {
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: text,
      inputType: "insertText",
    }));
    dispatchChangeEvent(element);
  }

  function executeNativeTextInsertion(element, text) {
    const currentDocument = globalThis.document;

    if (!currentDocument || typeof currentDocument.execCommand !== "function") {
      return { changeDispatched: false, succeeded: false };
    }

    let changeDispatched = false;
    const rememberChange = () => {
      changeDispatched = true;
    };

    element.addEventListener("change", rememberChange);

    try {
      // Chromium's editing command is retained here because it creates a native undo transaction.
      const succeeded = currentDocument.execCommand("insertText", false, text) === true;
      return {
        changeDispatched,
        succeeded,
      };
    } catch (_error) {
      return { changeDispatched, succeeded: false };
    } finally {
      element.removeEventListener("change", rememberChange);
    }
  }

  function setNativeFieldValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  function getFormFieldSelection(element) {
    try {
      const fallback = element.value.length;
      return {
        end: element.selectionEnd ?? fallback,
        start: element.selectionStart ?? fallback,
      };
    } catch (_error) {
      return {
        end: element.value.length,
        start: element.value.length,
      };
    }
  }

  function captureFormFieldSelection(element) {
    const selection = getFormFieldSelection(element);
    return Object.freeze({
      end: selection.end,
      start: selection.start,
    });
  }

  function normalizeFormFieldSelection(element, selection) {
    if (!selection || !Number.isFinite(selection.start) || !Number.isFinite(selection.end)) {
      return getFormFieldSelection(element);
    }

    const length = element.value.length;
    const start = Math.min(length, Math.max(0, Math.trunc(selection.start)));
    const end = Math.min(length, Math.max(start, Math.trunc(selection.end)));
    return { end, start };
  }

  function prepareInsertionText(text, before = "", after = "") {
    const normalized = typeof text === "string" ? text.trim() : "";

    if (!normalized) {
      return "";
    }

    const prefix = (
      before &&
      !/\s$/.test(before) &&
      !NO_SPACE_BEFORE_PATTERN.test(normalized) &&
      !NO_SPACE_AFTER_PATTERN.test(before)
    ) ? " " : "";
    const suffix = (
      after &&
      !/^\s/.test(after) &&
      !NO_SPACE_BEFORE_PATTERN.test(after) &&
      !NO_SPACE_AFTER_PATTERN.test(normalized)
    ) ? " " : "";

    return `${prefix}${normalized}${suffix}`;
  }

  function setFormFieldSelection(element, start, end = start) {
    try {
      element.setSelectionRange(start, end);
      return true;
    } catch (_error) {
      // Some supported input types, including email, do not expose a text selection API.
      return false;
    }
  }

  function insertIntoFormField(element, text, capturedSelection = null) {
    const { end, start } = normalizeFormFieldSelection(element, capturedSelection);
    const before = element.value.slice(0, start);
    const after = element.value.slice(end);
    const nextText = prepareInsertionText(text, before, after);

    if (!nextText) {
      return false;
    }

    const nextPosition = start + nextText.length;
    const selectionRestored = setFormFieldSelection(element, start, end);

    if (!dispatchBeforeInputEvent(element, nextText)) {
      return false;
    }

    const previousValue = element.value;
    const nativeInsertion = selectionRestored
      ? executeNativeTextInsertion(element, nextText)
      : { changeDispatched: false, succeeded: false };
    const nativeInsertionChangedValue = element.value !== previousValue;

    if (nativeInsertion.succeeded || nativeInsertionChangedValue) {
      setFormFieldSelection(element, nextPosition);
      if (!nativeInsertion.changeDispatched) {
        dispatchChangeEvent(element);
      }
      return true;
    }

    setNativeFieldValue(element, `${before}${nextText}${after}`);
    setFormFieldSelection(element, nextPosition);
    dispatchInputEvents(element, nextText);
    return true;
  }

  globalThis.DictozyDom = Object.freeze({
    EDITABLE_FIELD_SELECTOR,
    captureFormFieldSelection,
    dispatchBeforeInputEvent,
    dispatchChangeEvent,
    dispatchInputEvents,
    executeNativeTextInsertion,
    getEditableField,
    hasPaymentSignal,
    insertIntoFormField,
    isSupportedField,
    prepareInsertionText,
  });
})();
