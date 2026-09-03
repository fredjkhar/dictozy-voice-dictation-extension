const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  }
}

class FakeInputEvent extends FakeEvent {}

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = { ...attributes };
    this.children = [];
    this.cancelBeforeInput = false;
    this.disabled = false;
    this.dispatchedEvents = [];
    this.hidden = false;
    this.isConnected = true;
    this.isContentEditable = false;
    this.listeners = new Map();
    this.parentElement = null;
    this.readOnly = false;
    this.style = {};
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  contains(target) {
    for (let current = target; current; current = current.parentElement) {
      if (current === this) {
        return true;
      }
    }

    return false;
  }

  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches(selector)) {
        return current;
      }
    }

    return null;
  }

  dispatchEvent(event) {
    this.dispatchedEvents.push(event);
    for (const listener of this.listeners.get(event.type) || []) {
      listener.call(this, event);
    }
    return !(event.type === "beforeinput" && this.cancelBeforeInput);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  matches(selector) {
    if (selector === '[contenteditable]:not([contenteditable="false"])') {
      return this.attributes.contenteditable !== undefined && this.attributes.contenteditable !== "false";
    }

    if (selector === '[contenteditable="false"]') {
      return this.attributes.contenteditable === "false";
    }

    return false;
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }
}

class FakeInput extends FakeElement {
  constructor(type = "text", attributes = {}) {
    super(attributes);
    this.type = type;
    this._value = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = String(value);
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

class FakeTextArea extends FakeInput {
  constructor(attributes = {}) {
    super("textarea", attributes);
  }
}

function loadDomUtils(document = null) {
  const context = {
    Element: FakeElement,
    Event: FakeEvent,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    InputEvent: FakeInputEvent,
    window: {
      getComputedStyle(element) {
        return {
          display: element.style.display || "block",
          visibility: element.style.visibility || "visible",
        };
      },
    },
  };
  if (document) {
    context.document = document;
  }
  context.globalThis = context;

  const source = fs.readFileSync(path.join(__dirname, "..", "dom-utils.js"), "utf8");
  vm.runInNewContext(source, context);
  return context.DictozyDom;
}

test("detects supported editable fields", () => {
  const dom = loadDomUtils();

  for (const type of ["", "text", "search", "email", "url", "tel"]) {
    assert.equal(dom.isSupportedField(new FakeInput(type)), true);
  }

  assert.equal(dom.isSupportedField(new FakeTextArea()), true);

  const contentEditable = new FakeElement({ contenteditable: "true" });
  contentEditable.isContentEditable = true;
  assert.equal(dom.isSupportedField(contentEditable), true);

  const roleTextbox = new FakeElement({ contenteditable: "true", role: "textbox" });
  roleTextbox.isContentEditable = true;
  assert.equal(dom.isSupportedField(roleTextbox), true);

  const bareRoleTextbox = new FakeElement({ role: "textbox" });
  assert.equal(dom.isSupportedField(bareRoleTextbox), false);
});

test("rejects excluded and sensitive fields", () => {
  const dom = loadDomUtils();

  for (const type of ["password", "file", "checkbox", "radio", "hidden"]) {
    assert.equal(dom.isSupportedField(new FakeInput(type)), false);
  }

  const disabled = new FakeInput("text");
  disabled.disabled = true;
  assert.equal(dom.isSupportedField(disabled), false);

  const readonly = new FakeInput("text");
  readonly.readOnly = true;
  assert.equal(dom.isSupportedField(readonly), false);

  const paymentFields = [
    { autocomplete: "cc-number" },
    { autocomplete: "section-checkout billing cc-exp" },
    { autocomplete: "cc-csc" },
    { name: "cardNumber" },
    { id: "card_number" },
    { name: "creditCardNumber" },
    { id: "paymentCard" },
    { "aria-label": "cardholderName" },
    { placeholder: "Card number" },
    { name: "creditcardnumber" },
  ];

  for (const attributes of paymentFields) {
    assert.equal(dom.isSupportedField(new FakeInput("text", attributes)), false);
  }

  for (const attributes of [{ name: "postcardMessage" }, { id: "discardReason" }]) {
    assert.equal(dom.isSupportedField(new FakeInput("text", attributes)), true);
  }

  const hiddenByStyle = new FakeInput("text");
  hiddenByStyle.style.display = "none";
  assert.equal(dom.isSupportedField(hiddenByStyle), false);

  const disconnected = new FakeInput("text");
  disconnected.isConnected = false;
  assert.equal(dom.isSupportedField(disconnected), false);
});

test("finds the nearest editable field", () => {
  const dom = loadDomUtils();
  const editor = new FakeElement({ contenteditable: "true" });
  const child = new FakeElement();
  editor.append(child);

  assert.equal(dom.getEditableField(child), editor);

  const blockedRegion = new FakeElement({ contenteditable: "false" });
  const blockedChild = new FakeElement();
  editor.append(blockedRegion);
  blockedRegion.append(blockedChild);
  assert.equal(dom.getEditableField(blockedChild), null);
});

test("inserts text into form fields and dispatches input events", () => {
  const dom = loadDomUtils();
  const input = new FakeInput("text");
  input.value = "Hello";
  input.selectionStart = 5;
  input.selectionEnd = 5;

  assert.equal(dom.insertIntoFormField(input, "world"), true);

  assert.equal(input.value, "Hello world");
  assert.equal(input.selectionStart, 11);
  assert.deepEqual(input.dispatchedEvents.map((event) => event.type), ["beforeinput", "input", "change"]);
  assert.equal(input.dispatchedEvents[0].data, " world");
  assert.equal(input.dispatchedEvents[1].data, " world");
});

test("uses a captured form selection even if the live caret moves", () => {
  const dom = loadDomUtils();
  const input = new FakeInput("text");
  input.value = "AlphaBeta";
  input.selectionStart = 5;
  input.selectionEnd = 5;
  const capturedSelection = dom.captureFormFieldSelection(input);

  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;

  assert.equal(dom.insertIntoFormField(input, "middle", capturedSelection), true);
  assert.equal(input.value, "Alpha middle Beta");
  assert.equal(input.selectionStart, 13);
  assert.equal(input.selectionEnd, 13);
});

test("normalizes transcript boundary whitespace without changing punctuation", () => {
  const dom = loadDomUtils();

  assert.equal(dom.prepareInsertionText("  dictated  ", "Hello ", " world"), "dictated");
  assert.equal(dom.prepareInsertionText("dictated", "Hello", "world"), " dictated ");
  assert.equal(dom.prepareInsertionText(",", "Hello", " world"), ",");
  assert.equal(dom.prepareInsertionText("inside", "(", ")"), "inside");
  assert.equal(dom.prepareInsertionText("   ", "Hello", "world"), "");
});

test("uses the native field setter and dispatches each editing event once", () => {
  const dom = loadDomUtils();
  const input = new FakeInput("text");
  let pageSetterCalls = 0;

  Object.defineProperty(input, "value", {
    configurable: true,
    get() {
      return this._value;
    },
    set(value) {
      pageSetterCalls += 1;
      this._value = `page:${value}`;
    },
  });

  assert.equal(dom.insertIntoFormField(input, "controlled"), true);
  assert.equal(input.value, "controlled");
  assert.equal(pageSetterCalls, 0);
  assert.deepEqual(input.dispatchedEvents.map(({ type }) => type), ["beforeinput", "input", "change"]);
});

test("uses the Chromium editing path without duplicating native events", () => {
  const input = new FakeInput("text");
  input.value = "Hello old text";
  input.selectionStart = 6;
  input.selectionEnd = 9;
  const document = {
    execCommand(command, _showUi, text) {
      assert.equal(command, "insertText");
      const before = input.value.slice(0, input.selectionStart);
      const after = input.value.slice(input.selectionEnd);
      input.value = `${before}${text}${after}`;
      input.selectionStart = before.length + text.length;
      input.selectionEnd = input.selectionStart;
      input.dispatchEvent(new FakeInputEvent("input", {
        data: text,
        inputType: "insertText",
      }));
      input.dispatchEvent(new FakeEvent("change", { bubbles: true }));
      return true;
    },
  };
  const dom = loadDomUtils(document);

  assert.equal(dom.insertIntoFormField(input, "new"), true);
  assert.equal(input.value, "Hello new text");
  assert.deepEqual(input.dispatchedEvents.map(({ type }) => type), [
    "beforeinput",
    "input",
    "change",
  ]);
});

test("does not insert when beforeinput is cancelled", () => {
  const dom = loadDomUtils();
  const input = new FakeInput("text");
  input.value = "Keep this";
  input.cancelBeforeInput = true;

  assert.equal(dom.insertIntoFormField(input, "blocked"), false);
  assert.equal(input.value, "Keep this");
  assert.deepEqual(input.dispatchedEvents.map(({ type }) => type), ["beforeinput"]);
});

test("falls back safely when an input type has no selection API", () => {
  const dom = loadDomUtils();
  const email = new FakeInput("email");
  Object.defineProperty(email, "selectionStart", {
    configurable: true,
    get() {
      throw new Error("selection unavailable");
    },
  });
  email.setSelectionRange = () => {
    throw new Error("selection unavailable");
  };

  assert.equal(dom.insertIntoFormField(email, "name@example.com"), true);
  assert.equal(email.value, "name@example.com");
});

test("replaces selected text in textareas", () => {
  const dom = loadDomUtils();
  const textarea = new FakeTextArea();
  textarea.value = "Hello old text";
  textarea.selectionStart = 6;
  textarea.selectionEnd = 9;

  dom.insertIntoFormField(textarea, "new");

  assert.equal(textarea.value, "Hello new text");
  assert.equal(textarea.selectionStart, 9);
});
