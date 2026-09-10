import assert from "node:assert/strict";
import test from "node:test";
import { parseRevisionSuggestion, revisionFailureMessage } from "./revision-suggestion.ts";

const expected = { explanation: "Clarifies the scope.", replacement: "// Party-door occupancy constants" };

test("parses an exact structured revision", () => {
	assert.deepEqual(parseRevisionSuggestion(JSON.stringify(expected)), expected);
});

test("parses JSON in a fenced response", () => {
	assert.deepEqual(parseRevisionSuggestion(`Here is the revision:\n\n\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``), expected);
});

test("parses JSON surrounded by prose and braces inside strings", () => {
	const response = `Certainly. ${JSON.stringify({ ...expected, replacement: "if (ready) { run(); }" })} Please review it.`;
	assert.deepEqual(parseRevisionSuggestion(response), { ...expected, replacement: "if (ready) { run(); }" });
});

test("prefers the final valid object when prose includes a schema example", () => {
	const response = `Use {"explanation":"brief reason","replacement":"exact replacement text"}. Final answer: ${JSON.stringify(expected)}`;
	assert.deepEqual(parseRevisionSuggestion(response), expected);
});

test("rejects objects without both required string fields", () => {
	assert.equal(parseRevisionSuggestion('{"replacement":"new text"}'), undefined);
	assert.equal(parseRevisionSuggestion('{"explanation":"reason","replacement":4}'), undefined);
});

test("failure message exposes a bounded reply and confirms no change", () => {
	const message = revisionFailureMessage(`prefix ${"x".repeat(1_500)}`, "provider unavailable");
	assert.match(message, /Nothing was changed/);
	assert.match(message, /Reviewer reply:\nprefix/);
	assert.match(message, /reply truncated/);
	assert.match(message, /Automatic retry failed: provider unavailable/);
	assert.ok(message.length < 1_500);
});
