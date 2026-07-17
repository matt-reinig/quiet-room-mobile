import type { ChatMessage } from "../types/chat";

export type SearchHighlightSegment = {
  highlighted: boolean;
  text: string;
};

function fold(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function normalizeSearchMessageIndexes(
  rawIndexes: unknown,
  rawMessageIndex: unknown,
): number[] | null {
  if (!Array.isArray(rawIndexes) || rawIndexes.length === 0) {
    return null;
  }

  const indexes = rawIndexes.filter(isNonNegativeInteger);

  if (indexes.length !== rawIndexes.length || !isNonNegativeInteger(rawMessageIndex)) {
    return null;
  }

  const normalized = [...new Set(indexes)].sort((a, b) => a - b);

  if (!normalized.includes(rawMessageIndex)) {
    return null;
  }

  return normalized;
}

export function findMatchingMessageIndexes(
  messages: readonly ChatMessage[] | unknown,
  query: string,
): number[] {
  const trimmedQuery = query.trim();

  if (!Array.isArray(messages) || !trimmedQuery) {
    return [];
  }

  const foldedQuery = fold(trimmedQuery);

  return messages.reduce<number[]>((indexes, message, index) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "content" in message &&
      typeof message.content === "string" &&
      fold(message.content).includes(foldedQuery)
    ) {
      indexes.push(index);
    }

    return indexes;
  }, []);
}

export function splitTextForSearchHighlight(
  text: string,
  query: string | undefined,
): SearchHighlightSegment[] {
  const trimmedQuery = typeof query === "string" ? query.trim() : "";

  if (!trimmedQuery || !text) {
    return [{ highlighted: false, text }];
  }

  const foldedQuery = fold(trimmedQuery);
  const foldedText = fold(text);
  const segments: SearchHighlightSegment[] = [];
  let cursor = 0;
  let searchCursor = 0;

  while (searchCursor < foldedText.length) {
    const matchStart = foldedText.indexOf(foldedQuery, searchCursor);

    if (matchStart < 0) {
      break;
    }

    if (matchStart > cursor) {
      segments.push({ highlighted: false, text: text.slice(cursor, matchStart) });
    }

    const matchText = text.slice(matchStart, matchStart + trimmedQuery.length);
    segments.push({ highlighted: true, text: matchText });
    cursor = matchStart + trimmedQuery.length;
    searchCursor = cursor;
  }

  if (cursor < text.length || segments.length === 0) {
    segments.push({ highlighted: false, text: text.slice(cursor) });
  }

  return segments;
}

export function selectedSearchPosition(
  indexes: readonly number[],
  representativeIndex: unknown,
): number | null {
  if (!isNonNegativeInteger(representativeIndex)) {
    return null;
  }

  const position = indexes.indexOf(representativeIndex);
  return position >= 0 ? position : null;
}

export function clampSearchPosition(position: number, totalMatches: number): number {
  return Math.max(0, Math.min(Math.max(0, totalMatches - 1), position));
}
