function redact(value) {
    return value
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
        .replace(/\b(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
        .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
        .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[REDACTED_JWT]")
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
}
function multilineMatchIndex(content, matcher) {
    const match = new RegExp(matcher.source, matcher.flags.replace(/[gy]/g, "")).exec(content);
    if (!match)
        return -1;
    // Point at the first non-blank line of a match that may start on a preceding newline.
    const start = match.index + (match[0].length - match[0].trimStart().length);
    return content.slice(0, start).split(/\r?\n/).length - 1;
}
export function evidence(file, matcher, fallback = "") {
    const lines = (file.content ?? "").split(/\r?\n/);
    let index = typeof matcher === "string"
        ? lines.findIndex((line) => line.toLowerCase().includes(matcher.toLowerCase()))
        : lines.findIndex((line) => matcher.test(line));
    if (index < 0 && matcher instanceof RegExp)
        index = multilineMatchIndex(file.content ?? "", matcher);
    const line = index >= 0 ? index + 1 : 1;
    const excerpt = index >= 0 ? lines[index] : fallback;
    return { file: file.path, line, excerpt: redact(excerpt || file.path) };
}
export function fileEvidence(file, excerpt = "") {
    if (!file)
        return null;
    return { file: file.path, line: 1, excerpt: redact(excerpt || file.path) };
}
export function evidenceAt(file, line, excerpt) {
    return { file: file.path, line, excerpt: redact(excerpt) };
}
export function outcome(status, summary, details = {}) {
    const evidenceItems = Array.isArray(details.evidence)
        ? details.evidence
        : details.evidence
            ? [details.evidence]
            : [];
    return {
        status,
        summary,
        evidence: evidenceItems,
        recommendation: details.recommendation ?? null,
        data: details.data ?? null
    };
}
