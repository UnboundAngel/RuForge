export type InlineSegment =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string };

/** Split a string on `` `inline code` `` segments for styled rendering. */
export function parseInlineCode(text: string): InlineSegment[] {
  if (!text.includes('`')) {
    return [{ type: 'text', value: text }];
  }

  const segments: InlineSegment[] = [];
  const regex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', value: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}
