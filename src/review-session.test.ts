import assert from "node:assert/strict";
import test from "node:test";
import { createReviewReceipt, extractRecentContext, receiptContent } from "./review-session.ts";

test("recent context keeps two text pairs and excludes tool/custom messages", () => {
	const entries = [
		{ type: "message", message: { role: "user", content: "extra old user" } },
		{ type: "message", message: { role: "user", content: "first request" } },
		{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "first intent" }] } },
		{ type: "message", message: { role: "toolResult", content: "tool output" } },
		{ type: "message", message: { role: "user", content: "second request" } },
		{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "edit" }, { type: "text", text: "second intent" }] } },
		{ type: "message", message: { role: "user", customType: "receipt", content: "prior receipt" } },
	];
	const context = extractRecentContext(entries);
	assert.match(context, /first request/);
	assert.match(context, /second intent/);
	assert.doesNotMatch(context, /extra old user|tool output|prior receipt/);
	assert.ok(Buffer.byteLength(extractRecentContext(entries, 20)) <= 20);
});

test("receipt keeps transcript in details while content stays concise", () => {
	const receipt = createReviewReceipt({
		path: "src/example.ts",
		tool: "edit",
		beforeText: "old",
		afterText: "new",
		disposition: "revision-requested",
		activity: {
			transcript: [{ question: "Why?", answer: "To change behavior." }],
			candidateChanged: false,
			revisionRequest: "Use the existing helper",
		},
	});
	assert.equal(receipt.transcript.length, 1);
	assert.notEqual(receipt.artifact.beforeDigest, receipt.artifact.afterDigest);
	assert.match(receiptContent(receipt), /Use the existing helper/);
	assert.doesNotMatch(receiptContent(receipt), /To change behavior/);
});
