(() => {
  const SUPPORTED_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel"]);
  const IGNORED_INPUT_TYPES = new Set(["password", "file", "checkbox", "radio", "hidden"]);
  const PAYMENT_FIELD_PATTERN = /\b(cc-|cc_|card|credit|cvc|cvv|expiry|expiration|iban|payment)\b/i;
  const EDITABLE_FIELD_SELECTOR = '[contenteditable]:not([contenteditable="false"]), [role="textbox"]';

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
    const values = [
      element.getAttribute("autocomplete"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("inputmode"),
    ];

    return values.some((value) => value && PAYMENT_FIELD_PATTERN.test(value));
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

  globalThis.FieldMicDom = Object.freeze({
    EDITABLE_FIELD_SELECTOR,
    dispatchInputEvents,
    getEditableField,
    hasPaymentSignal,
    insertIntoFormField,
    isSupportedField,
  });
})();
