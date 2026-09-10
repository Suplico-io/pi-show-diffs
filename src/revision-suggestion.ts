export interface RevisionSuggestion {
	explanation: string;
	replacement: string;
}

function asRevisionSuggestion(value: unknown): RevisionSuggestion | undefined {
	if (!value || typeof value !== "object") return undefined;
	const candidate = value as Partial<RevisionSuggestion>;
	if (typeof candidate.explanation !== "string" || typeof candidate.replacement !== "string") return undefined;
	return { explanation: candidate.explanation, replacement: candidate.replacement };
}

function balancedJsonObjects(text: string): string[] {
	const objects: string[] = [];
	for (let start = 0; start < text.length; start++) {
		if (text[start] !== "{") continue;
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let end = start; end < text.length; end++) {
			const char = text[end]!;
			if (inString) {
				if (escaped) escaped = false;
				else if (char === "\\") escaped = true;
				else if (char === '"') inString = false;
				continue;
			}
			if (char === '"') inString = true;
			else if (char === "{") depth++;
			else if (char === "}" && --depth === 0) {
				objects.push(text.slice(start, end + 1));
				break;
			}
		}
	}
	return objects;
}

export function parseRevisionSuggestion(text: string): RevisionSuggestion | undefined {
	const trimmed = text.trim();
	const candidates = [
		trimmed,
		...Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1]!.trim()),
		...balancedJsonObjects(trimmed).reverse(),
	];
	for (const candidate of new Set(candidates)) {
		try {
			const parsed = asRevisionSuggestion(JSON.parse(candidate));
			if (parsed) return parsed;
		} catch {
			// Continue: models commonly surround an otherwise valid object with prose.
		}
	}
	return undefined;
}

export function revisionFailureMessage(text: string, retryError?: string): string {
	const normalized = text.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
	const excerpt = normalized.length > 400 ? `${normalized.slice(0, 400)}\n… [reply truncated]` : normalized;
	const detail = excerpt ? `\n\nReviewer reply:\n${excerpt}` : "\n\nThe reviewer returned no text.";
	const retryDetail = retryError ? `\n\nAutomatic retry failed: ${retryError}` : "";
	return `I couldn't turn the reviewer's response into an exact replacement, even after one automatic retry. Nothing was changed.${detail}${retryDetail}`;
}
