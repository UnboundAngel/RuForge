function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlightCrashLine(code: string): string {
  const safe = escapeHtml(code);

  return safe
    .replace(
      /^(\s*at\s+)(.+?)(\s+\()([^)]+)(:\d+:\d+\))/,
      '$1<span class="rf-crash-hl-fn">$2</span>$3<span class="rf-crash-hl-path">$4</span><span class="rf-crash-hl-num">$5</span>',
    )
    .replace(
      /^(\s*at\s+)([^\s(]+)(:\d+:\d+)/,
      '$1<span class="rf-crash-hl-path">$2</span><span class="rf-crash-hl-num">$3</span>',
    )
    .replace(
      /^([A-Za-z]+Error|TypeError|ReferenceError|RangeError|SyntaxError)(:)/,
      '<span class="rf-crash-hl-kw">$1</span><span class="rf-crash-hl-muted">$2</span>',
    )
    .replace(
      /(Cannot read properties of (undefined|null) \(reading '([^']+)'\))/,
      '<span class="rf-crash-hl-muted">Cannot read properties of $2 (reading </span><span class="rf-crash-hl-str">\'$3\'</span><span class="rf-crash-hl-muted">)</span>',
    );
}
