export type InlineMarkdownSegment = {
  bold: boolean;
  italic: boolean;
  text: string;
};

export function parseInlineMarkdown(content: string): InlineMarkdownSegment[] {
  const segments: InlineMarkdownSegment[] = [];
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/gs;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    if (match.index > cursor) {
      segments.push({
        bold: false,
        italic: false,
        text: content.slice(cursor, match.index),
      });
    }

    segments.push({
      bold: Boolean(match[2]),
      italic: Boolean(match[3]),
      text: match[2] || match[3],
    });

    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) {
    segments.push({
      bold: false,
      italic: false,
      text: content.slice(cursor),
    });
  }

  return segments.length > 0 ? segments : [{ bold: false, italic: false, text: content }];
}
