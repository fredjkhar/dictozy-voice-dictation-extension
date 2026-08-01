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

  function getEditableField(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return target;
    }

    return target.closest(EDITABLE_FIELD_SELECTOR);
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
    if (element.hidden) {
      return true;
    }

    if (element instanceof HTMLInputElement && element.type.toLowerCase() === "hidden") {
      return true;
    }

    const style = window.getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
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

  function dispatchInputEvents(element, text) {
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: text,
      inputType: "insertText",
    }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeFieldValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  function insertIntoFormField(element, text) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const before = element.value.slice(0, start);
    const after = element.value.slice(end);
    const separator = before && !/\s$/.test(before) ? " " : "";
    const nextText = `${separator}${text}`;
    const nextPosition = start + nextText.length;

    element.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: nextText,
      inputType: "insertText",
    }));
    setNativeFieldValue(element, `${before}${nextText}${after}`);
    element.setSelectionRange(nextPosition, nextPosition);
    dispatchInputEvents(element, nextText);
  }

  globalThis.DictozyDom = Object.freeze({
    EDITABLE_FIELD_SELECTOR,
    dispatchInputEvents,
    getEditableField,
    hasPaymentSignal,
    insertIntoFormField,
    isSupportedField,
  });
})();
