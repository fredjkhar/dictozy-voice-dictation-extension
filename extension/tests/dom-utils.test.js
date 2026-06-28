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
    this.disabled = false;
    this.dispatchedEvents = [];
    this.hidden = false;
    this.isConnected = true;
    this.isContentEditable = false;
    this.parentElement = null;
    this.readOnly = false;
    this.style = {};
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
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
    return true;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  matches(selector) {
    if (selector === '[contenteditable]:not([contenteditable="false"]), [role="textbox"]') {
      return (
        (this.attributes.contenteditable !== undefined && this.attributes.contenteditable !== "false") ||
        this.attributes.role === "textbox"
      );
    }

    return false;
  }
}

class FakeInput extends FakeElement {
  constructor(type = "text", attributes = {}) {
    super(attributes);
    this.type = type;
    this.value = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
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

function loadDomUtils() {
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
  context.globalThis = context;

  const source = fs.readFileSync(path.join(__dirname, "..", "dom-utils.js"), "utf8");
  vm.runInNewContext(source, context);
  return context.FieldMicDom;
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

  const roleTextbox = new FakeElement({ role: "textbox" });
  roleTextbox.isContentEditable = true;
  assert.equal(dom.isSupportedField(roleTextbox), true);
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

  const payment = new FakeInput("text", { autocomplete: "cc-number", name: "credit-card-number" });
  assert.equal(dom.isSupportedField(payment), false);

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
});

test("inserts text into form fields and dispatches input events", () => {
  const dom = loadDomUtils();
  const input = new FakeInput("text");
  input.value = "Hello";
  input.selectionStart = 5;
  input.selectionEnd = 5;

  dom.insertIntoFormField(input, "world");

  assert.equal(input.value, "Hello world");
  assert.equal(input.selectionStart, 11);
  assert.deepEqual(input.dispatchedEvents.map((event) => event.type), ["beforeinput", "input", "change"]);
  assert.equal(input.dispatchedEvents[0].data, " world");
  assert.equal(input.dispatchedEvents[1].data, " world");
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
