import { createHash, randomUUID } from "node:crypto";

export interface ReviewExchange {
	question: string;
	answer: string;
}

export interface DiffReviewActivity {
	transcript: ReviewExchange[];
	candidateChanged: boolean;
	revisionRequest?: string;
}

export interface ActionReviewReceiptV1 {
	schemaVersion: 1;
	reviewId: string;
	artifact: {
		kind: "file-change";
		label: string;
		beforeDigest: string;
		afterDigest: string;
	};
	trigger: { classification: string; reasons: string[]; effects: string[] };
	disposition: "approved" | "rejected" | "revised" | "revision-requested";
	summary: string;
	transcript: ReviewExchange[];
	revision?: { changed: boolean; request?: string };
}

function messageText(message: { content?: unknown }): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.filter((part): part is { type: "text"; text: string } =>
			typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

export function extractRecentContext(entries: unknown[], maxBytes = 8_192, pairs = 2): string {
	const messages: Array<{ role: "user" | "assistant"; text: string }> = [];
	const counts = { user: 0, assistant: 0 };
	for (const entry of [...entries].reverse()) {
		if (!entry || typeof entry !== "object" || (entry as { type?: unknown }).type !== "message") continue;
		const message = (entry as { message?: { role?: unknown; content?: unknown; customType?: unknown } }).message;
		if (!message || (message.role !== "user" && message.role !== "assistant") || message.customType) continue;
		const text = messageText(message).trim();
		if (!text) continue;
		if (counts[message.role] >= pairs) continue;
		messages.push({ role: message.role, text });
		counts[message.role] += 1;
		if (counts.user >= pairs && counts.assistant >= pairs) break;
	}
	const context = messages.reverse()
		.map(({ role, text }) => `${role === "user" ? "User" : "Main agent"}:\n${text}`)
		.join("\n\n");
	const bytes = Buffer.from(context);
	return bytes.length <= maxBytes ? context : bytes.subarray(bytes.length - maxBytes).toString().replace(/^\uFFFD+/, "");
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function createReviewReceipt(input: {
	path: string;
	tool: string;
	beforeText: string;
	afterText: string;
	disposition: ActionReviewReceiptV1["disposition"];
	activity: DiffReviewActivity;
}): ActionReviewReceiptV1 {
	return {
		schemaVersion: 1,
		reviewId: randomUUID(),
		artifact: {
			kind: "file-change",
			label: input.path,
			beforeDigest: digest(input.beforeText),
			afterDigest: digest(input.afterText),
		},
		trigger: {
			classification: "prospective-file-change",
			reasons: [`tool:${input.tool}`],
			effects: ["filesystem-write"],
		},
		disposition: input.disposition,
		summary: `${input.tool} review ${input.disposition} for ${input.path}`,
		transcript: [...input.activity.transcript],
		revision: {
			changed: input.activity.candidateChanged,
			...(input.activity.revisionRequest ? { request: input.activity.revisionRequest } : {}),
		},
	};
}

export function receiptContent(receipt: ActionReviewReceiptV1): string {
	const instruction = receipt.revision?.request ? ` User request: ${receipt.revision.request}` : "";
	const continuation = receipt.disposition === "rejected" || receipt.disposition === "revision-requested"
		? " Do not retry the same change unchanged."
		: " Continue from the reviewed file state reported by the tool result.";
	return `File review ${receipt.disposition}: ${receipt.artifact.label}.${instruction}${continuation}`;
}
