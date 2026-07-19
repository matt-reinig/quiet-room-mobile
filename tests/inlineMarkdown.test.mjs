import assert from "node:assert/strict";
import test from "node:test";

import { parseInlineMarkdown } from "../src/lib/inlineMarkdown.ts";

test("parses the shared bold and italic formatting contract", () => {
  assert.deepEqual(
    parseInlineMarkdown(
      "You do not have to solve this. **Let today be enough.** Pray *Lord, meet me here.*",
    ),
    [
      { bold: false, italic: false, text: "You do not have to solve this. " },
      { bold: true, italic: false, text: "Let today be enough." },
      { bold: false, italic: false, text: " Pray " },
      { bold: false, italic: true, text: "Lord, meet me here." },
    ],
  );
});

test("preserves plain and multiline content", () => {
  assert.deepEqual(parseInlineMarkdown("A calm first line.\nA second line."), [
    { bold: false, italic: false, text: "A calm first line.\nA second line." },
  ]);
});

test("leaves unsupported underscore emphasis untouched", () => {
  assert.deepEqual(parseInlineMarkdown("Keep __this__ literal."), [
    { bold: false, italic: false, text: "Keep __this__ literal." },
  ]);
});
