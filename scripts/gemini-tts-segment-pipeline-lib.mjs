/*
 * Pure helpers for the bounded Gemini TTS experiment.
 *
 * This module deliberately has no provider, filesystem, network, or speech
 * recognizer dependency.  It accepts already-collected ASR/PCM observations
 * and fails closed whenever a boundary or timing value is not trustworthy.
 */

export const GEMINI_SEGMENT_DEFAULTS = Object.freeze({
  minChars: 160,
  targetChars: 360,
  maxChars: 520,
  finalTokenCount: 3,
  sampleRate: 24_000,
  channels: 1,
  bitsPerSample: 16,
});

export const GEMINI_SPOKEN_PROMPT_VERSION = "single-spoken-region-v2";
export const GEMINI_SPOKEN_TEXT_SEPARATOR = "\n";
export const GEMINI_SPOKEN_BEGIN = "BEGIN SPOKEN TEXT";
export const GEMINI_SPOKEN_END = "END SPOKEN TEXT";
const FORBIDDEN_SPOKEN_LABELS = Object.freeze([
  GEMINI_SPOKEN_BEGIN,
  GEMINI_SPOKEN_END,
  "BEGIN SEGMENT",
  "END SEGMENT",
  "EXPENDABLE SUFFIX",
]);

function assertNoPromptDelimiterCollision(value, name) {
  const upper = String(value).toLocaleUpperCase("en-US");
  const collision = FORBIDDEN_SPOKEN_LABELS.find((label) => upper.includes(label));
  if (collision) throw new Error(`${name} collides with a spoken-prompt delimiter`);
}

/** Build the versioned, single-region spoken script without logging private text. */
export function buildGeminiSpokenPrompt(segmentText, { marker } = {}) {
  const source = String(segmentText ?? "");
  const suffix = String(marker ?? "");
  if (!source.trim()) throw new Error("segment text is required");
  if (!suffix.trim()) throw new Error("spoken suffix is required");
  assertNoPromptDelimiterCollision(source, "segment text");
  assertNoPromptDelimiterCollision(suffix, "spoken suffix");
  const collision = detectMarkerSourceCollision(source, suffix);
  if (!collision.ok || collision.collides) throw new Error("spoken suffix collides with segment vocabulary");
  const spokenScript = `${source}${GEMINI_SPOKEN_TEXT_SEPARATOR}${suffix}`;
  const prompt = [
    `Read every word between ${GEMINI_SPOKEN_BEGIN} and ${GEMINI_SPOKEN_END} aloud, in order, in one consistent, calm, single-speaker voice. Do not read the delimiter labels.`,
    GEMINI_SPOKEN_BEGIN,
    spokenScript,
    GEMINI_SPOKEN_END,
  ].join("\n");
  return {
    version: GEMINI_SPOKEN_PROMPT_VERSION,
    prompt,
    spokenScript,
    separator: GEMINI_SPOKEN_TEXT_SEPARATOR,
    delimiterCollisionChecked: true,
    markerCollision: collision,
  };
}

/** Keep payload field order and exposed generation settings identical across clients. */
export function buildGeminiTtsPayload({ model, prompt, voice, stream }) {
  if (!model || !voice || typeof prompt !== "string" || typeof stream !== "boolean") throw new Error("complete Gemini TTS payload inputs are required");
  return {
    model,
    input: prompt,
    stream,
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice }] },
  };
}

const NUMBER_WORDS = new Map([
  ["zero", 0], ["oh", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4],
  ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9],
  ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13],
  ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17],
  ["eighteen", 18], ["nineteen", 19], ["twenty", 20], ["thirty", 30],
  ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70],
  ["eighty", 80], ["ninety", 90],
]);
const ORDINAL_WORDS = new Map([
  ["first", 1], ["second", 2], ["third", 3], ["fourth", 4], ["fifth", 5],
  ["sixth", 6], ["seventh", 7], ["eighth", 8], ["ninth", 9], ["tenth", 10],
]);
const SCALE_WORDS = new Map([["hundred", 100], ["thousand", 1_000], ["million", 1_000_000], ["billion", 1_000_000_000]]);

function assertFiniteNumber(value, name, { integer = false, min = 0 } = {}) {
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min) {
    throw new RangeError(`${name} must be a finite ${integer ? "integer" : "number"} >= ${min}`);
  }
}

function sourceString(source) {
  if (typeof source === "string") return source;
  if (source && typeof source.text === "string") return source.text;
  throw new TypeError("source text must be a string");
}

function segmentOptions(options = {}) {
  const targetChars = options.targetChars ?? options.targetCharacters ?? GEMINI_SEGMENT_DEFAULTS.targetChars;
  const minChars = options.minChars ?? Math.min(GEMINI_SEGMENT_DEFAULTS.minChars, targetChars);
  const maxChars = options.maxChars ?? (options.targetCharacters !== undefined && options.targetChars === undefined
    ? Math.max(targetChars, Math.ceil(targetChars * 1.25))
    : GEMINI_SEGMENT_DEFAULTS.maxChars);
  for (const [name, value] of [["minChars", minChars], ["targetChars", targetChars], ["maxChars", maxChars]]) {
    assertFiniteNumber(value, name, { integer: true, min: 1 });
  }
  if (!(minChars <= targetChars && targetChars <= maxChars)) throw new RangeError("minChars <= targetChars <= maxChars is required");
  return { minChars, targetChars, maxChars };
}

function sentenceUnits(paragraph) {
  const units = [];
  // Keep the punctuation with the sentence.  This intentionally favors a
  // conservative boundary over attempting to understand abbreviations.
  const matches = paragraph.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/gu) || [];
  for (const match of matches) {
    const text = match.trim();
    if (text) units.push(text);
  }
  return units.length ? units : (paragraph.trim() ? [paragraph.trim()] : []);
}

function splitLongUnit(unit, maxChars) {
  if (unit.length <= maxChars) return [unit];
  const words = unit.split(/\s+/u).filter(Boolean);
  const result = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) { result.push(current); current = ""; }
      for (let start = 0; start < word.length; start += maxChars) result.push(word.slice(start, start + maxChars));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) result.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) result.push(current);
  return result;
}

/**
 * Split private source text without producing a text summary.  Returned
 * segments contain the source needed by the provider and only non-sensitive
 * metadata; callers should not log the `text` field.
 */
export function splitPrivateSourceText(source, options = {}) {
  const text = sourceString(source).replace(/\r\n?/gu, "\n").trim();
  if (!text) throw new RangeError("source text must not be empty");
  const config = segmentOptions(options);
  const paragraphs = text.split(/\n{2,}/u).map((paragraph) => paragraph.trim()).filter(Boolean);
  const units = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    for (const sentence of sentenceUnits(paragraph)) {
      for (const part of splitLongUnit(sentence, config.maxChars)) units.push({ text: part, paragraphIndex });
    }
  });

  const groups = [];
  for (const unit of units) {
    const previous = groups.at(-1);
    const joined = previous ? `${previous.text} ${unit.text}` : unit.text;
    const canJoin = previous
      && joined.length <= config.maxChars
      && (previous.text.length < config.targetChars || previous.text.length < config.minChars)
      && (previous.paragraphIndex === unit.paragraphIndex || previous.text.length < config.minChars);
    if (canJoin) previous.text = joined;
    else groups.push({ text: unit.text, paragraphIndex: unit.paragraphIndex });
  }
  // A short trailing sentence should not be stranded when it can be safely
  // joined to the preceding segment.  Never exceed maxChars.
  for (let index = groups.length - 1; index > 0; index -= 1) {
    if (groups[index].text.length >= config.minChars) continue;
    const joined = `${groups[index - 1].text} ${groups[index].text}`;
    if (joined.length <= config.maxChars) {
      groups[index - 1].text = joined;
      groups.splice(index, 1);
    }
  }
  return groups.map((group, index) => ({
    index,
    text: group.text,
    charCount: group.text.length,
    paragraphIndex: group.paragraphIndex,
    finalTokens: deriveConservativeFinalLexicalTokens(group.text, options),
  }));
}

export const splitTextIntoSegments = splitPrivateSourceText;
export const splitTextIntoBoundedSegments = splitPrivateSourceText;
export const splitSourceIntoSegments = splitPrivateSourceText;

function parseNumberWords(tokens) {
  if (!tokens.length || tokens.some((token) => !NUMBER_WORDS.has(token) && !ORDINAL_WORDS.has(token) && !SCALE_WORDS.has(token) && token !== "and")) return null;
  let total = 0;
  let current = 0;
  let sawValue = false;
  for (const token of tokens) {
    if (token === "and") continue;
    if (NUMBER_WORDS.has(token)) { current += NUMBER_WORDS.get(token); sawValue = true; continue; }
    if (ORDINAL_WORDS.has(token)) { current += ORDINAL_WORDS.get(token); sawValue = true; continue; }
    const scale = SCALE_WORDS.get(token);
    if (scale === 100) { current = (current || 1) * scale; sawValue = true; continue; }
    total += (current || 1) * scale;
    current = 0;
    sawValue = true;
  }
  return sawValue ? String(total + current) : null;
}

function normalizeToken(token) {
  if (/^\d[\d,]*$/u.test(token)) return token.replace(/,/gu, "").replace(/^0+(?=\d)/u, "");
  return token;
}

/** Normalize ASR text while retaining lexical order and canonical numbers. */
export function normalizeAsrText(value) {
  if (typeof value !== "string") throw new TypeError("ASR text must be a string");
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[’‘`]/gu, "'")
    .replace(/([a-z])[-‐‑‒–—]([a-z])/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}', ]+/gu, " ")
    .replace(/(?<!\d),(?!\d)/gu, " ")
    .replace(/'+/gu, "")
    .replace(/\s+/gu, " ").trim();
  const raw = normalized ? normalized.split(" ") : [];
  const output = [];
  for (let index = 0; index < raw.length;) {
    let end = index;
    while (end < raw.length && (/^(?:[a-z]+)$/u.test(raw[end]) && (NUMBER_WORDS.has(raw[end]) || ORDINAL_WORDS.has(raw[end]) || SCALE_WORDS.has(raw[end]) || raw[end] === "and"))) end += 1;
    const numberRun = raw.slice(index, end);
    const hasCompoundNumber = numberRun.some((token) => SCALE_WORDS.has(token) || (NUMBER_WORDS.has(token) && NUMBER_WORDS.get(token) >= 20));
    const parsed = end > index && hasCompoundNumber ? parseNumberWords(numberRun) : null;
    if (parsed !== null) output.push(parsed);
    else if (end > index && numberRun.length > 1) {
      // Consecutive small number words are commonly a list ("one two") in
      // ASR, not one cardinal number.  Canonicalize each token separately.
      for (const token of numberRun) {
        if (NUMBER_WORDS.has(token)) output.push(String(NUMBER_WORDS.get(token)));
        else if (ORDINAL_WORDS.has(token)) output.push(String(ORDINAL_WORDS.get(token)));
      }
    } else {
      if (NUMBER_WORDS.has(raw[index])) output.push(String(NUMBER_WORDS.get(raw[index])));
      else if (ORDINAL_WORDS.has(raw[index])) output.push(String(ORDINAL_WORDS.get(raw[index])));
      else output.push(normalizeToken(raw[index]));
      end = index + 1;
    }
    index = end;
  }
  return output.join(" ");
}

export function lexicalTokens(value) {
  const normalized = normalizeAsrText(value);
  return normalized ? normalized.split(" ") : [];
}

export function deriveConservativeFinalLexicalTokens(segment, options = {}) {
  const text = sourceString(segment);
  const count = options.finalTokenCount ?? GEMINI_SEGMENT_DEFAULTS.finalTokenCount;
  assertFiniteNumber(count, "finalTokenCount", { integer: true, min: 1 });
  return lexicalTokens(text).slice(-count);
}

export const deriveFinalLexicalTokens = deriveConservativeFinalLexicalTokens;
export const deriveSegmentFinalTokens = deriveConservativeFinalLexicalTokens;

function asTokens(value) {
  if (Array.isArray(value)) return value.flatMap((item) => typeof item === "string" ? lexicalTokens(item) : []).filter(Boolean);
  if (typeof value === "string") return lexicalTokens(value);
  return [];
}

/*
 * Marker selection is deliberately kept separate from the provider runners.
 * The runner needs the selected marker text, but the metadata it persists
 * must never echo private source text or marker vocabulary.  These helpers
 * therefore return a small, deterministic collision report alongside the
 * selected (runtime-only) candidate.
 */
function markerAlternatives(value) {
  if (typeof value === "string") {
    const tokens = lexicalTokens(value);
    return tokens.length ? [tokens] : [];
  }
  if (!Array.isArray(value)) return [];
  // An inner array is an explicit set of alternatives for one marker slot.
  // Expand the small Cartesian product so a marker such as
  // ["violet", "window", ["thirteen", "13"]] is treated as one ordered
  // sequence, while a flat array remains one ordinary sequence.
  if (value.length && value.every((item) => typeof item === "string")) {
    const tokens = value.flatMap((item) => lexicalTokens(item));
    return tokens.length ? [tokens] : [];
  }
  let sequences = [[]];
  for (const item of value) {
    const choices = Array.isArray(item)
      ? item.flatMap((choice) => markerAlternatives(choice))
      : markerAlternatives(item);
    if (!choices.length) return [];
    sequences = sequences.flatMap((prefix) => choices.map((choice) => [...prefix, ...choice]));
  }
  return sequences.filter((sequence) => sequence.length);
}

function markerVocabulary(value) {
  return [...new Set(markerAlternatives(value).flat())];
}

/**
 * Determine whether a sacrificial marker shares vocabulary with source text.
 * The result contains counts and booleans only; it intentionally does not
 * return the source, marker, matched words, or token positions.
 */
export function detectMarkerSourceCollision(source, marker) {
  let sourceTokens;
  try { sourceTokens = lexicalTokens(sourceString(source)); }
  catch (error) { return { ok: false, outcome: "invalid_source", collides: true, failure: error.message }; }
  const markerSequences = markerAlternatives(marker);
  const vocabulary = markerVocabulary(marker);
  if (!markerSequences.length || !vocabulary.length) {
    return {
      ok: false,
      outcome: "invalid_marker",
      collides: true,
      sourceTokenCount: sourceTokens.length,
      markerTokenCount: vocabulary.length,
      vocabularyCollisionCount: 0,
      sequenceCollision: false,
    };
  }
  const sourceSet = new Set(sourceTokens);
  const vocabularyCollisionCount = vocabulary.filter((token) => sourceSet.has(token)).length;
  const sequenceCollision = markerSequences.some((sequence) => containsSequence(sourceTokens, sequence) >= 0);
  return {
    ok: true,
    outcome: vocabularyCollisionCount || sequenceCollision ? "collision" : "available",
    collides: vocabularyCollisionCount > 0 || sequenceCollision,
    sourceTokenCount: sourceTokens.length,
    markerTokenCount: vocabulary.length,
    vocabularyCollisionCount,
    sequenceCollision,
  };
}

export const detectMarkerCollision = detectMarkerSourceCollision;
export const inspectMarkerSourceCollision = detectMarkerSourceCollision;

/**
 * Select the first explicitly supplied non-colliding marker candidate.
 * `candidates` must be ordered by caller preference; no generated or implicit
 * replacement is ever selected.  `selectedMarkerTokens` is for the immediate
 * request only.  `metadata` is safe to persist in summaries and contains no
 * source or marker vocabulary.
 */
export function selectNonCollidingMarker(source, candidates, options = {}) {
  const optionObject = (!Array.isArray(candidates) && candidates && typeof candidates === "object") ? candidates : options;
  const list = Array.isArray(candidates)
    ? candidates
    : optionObject.candidates ?? optionObject.markers ?? [];
  if (!Array.isArray(list) || !list.length) {
    return {
      ok: false,
      outcome: "no_candidates",
      selectedMarkerTokens: null,
      metadata: { candidateCount: 0, selectedIndex: null, replacementSelected: false, rejectedCount: 0 },
    };
  }
  const checked = list.map((candidate, index) => ({ index, report: detectMarkerSourceCollision(source, candidate), candidate }));
  const selected = checked.find((entry) => entry.report.ok && !entry.report.collides);
  const rejected = checked.filter((entry) => !entry.report.ok || entry.report.collides);
  const metadata = {
    candidateCount: checked.length,
    selectedIndex: selected?.index ?? null,
    replacementSelected: selected ? selected.index > 0 : false,
    rejectedCount: rejected.length,
    candidates: checked.map(({ index, report }) => ({
      index,
      ok: report.ok,
      outcome: report.outcome,
      collides: report.collides,
      sourceTokenCount: report.sourceTokenCount,
      markerTokenCount: report.markerTokenCount,
      vocabularyCollisionCount: report.vocabularyCollisionCount,
      sequenceCollision: report.sequenceCollision,
    })),
  };
  if (!selected) return { ok: false, outcome: "no_non_colliding_candidate", selectedMarkerTokens: null, metadata };
  return { ok: true, outcome: selected.index > 0 ? "replacement_selected" : "primary_selected", selectedMarkerTokens: selected.candidate, metadata };
}

export const selectMarkerReplacement = selectNonCollidingMarker;
export const chooseNonCollidingMarker = selectNonCollidingMarker;

function observedText(observed) {
  if (typeof observed === "string") return observed;
  if (!observed || typeof observed !== "object") return "";
  for (const key of ["asrText", "transcript", "text", "markerText"]) if (typeof observed[key] === "string") return observed[key];
  return "";
}

function containsSequence(haystack, needle) {
  if (!needle.length) return false;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, offset) => haystack[index + offset] === token)) return index;
  }
  return -1;
}

/** Verify one ordered set of segment endings and sacrificial markers. */
export function verifySegmentEndingAndMarkerSequence(expectedSegments, observedSegments, options = {}) {
  if (!Array.isArray(expectedSegments) || !Array.isArray(observedSegments)) {
    return { ok: false, outcome: "invalid_input", failure: "segments must be arrays" };
  }
  if (expectedSegments.length === 0 || observedSegments.length !== expectedSegments.length) {
    return { ok: false, outcome: "count_mismatch", expectedCount: expectedSegments.length, observedCount: observedSegments.length };
  }
  const details = [];
  for (let index = 0; index < expectedSegments.length; index += 1) {
    const expected = expectedSegments[index] || {};
    const observed = observedSegments[index] || {};
    const asr = lexicalTokens(observedText(observed));
    const finalTokens = asTokens(expected.finalTokens?.length ? expected.finalTokens : deriveConservativeFinalLexicalTokens(expected.text || "", options));
    const markerValue = expected.markerTokens ?? expected.marker ?? options.markerTokensBySegment?.[index];
    const markerTokens = asTokens(markerValue);
    if (!finalTokens.length || !markerTokens.length || !asr.length) {
      return { ok: false, outcome: "missing_tokens", failedIndex: index, details };
    }
    const finalStart = containsSequence(asr, finalTokens);
    const markerStart = containsSequence(asr, markerTokens);
    const finalEnd = finalStart < 0 ? -1 : finalStart + finalTokens.length;
    const markerEnd = markerStart < 0 ? -1 : markerStart + markerTokens.length;
    // Each provider call has its own transcript coordinate space.  Ordered
    // marker sequence is established by the ordered segment array; comparing
    // character/token offsets across calls would reject valid later markers.
    const valid = finalStart >= 0 && markerStart >= finalEnd;
    const detail = { index, finalTokens, markerTokens, finalStart, markerStart, valid };
    details.push(detail);
    if (!valid) return { ok: false, outcome: finalStart < 0 ? "ending_missing" : markerStart < 0 ? "marker_missing" : "marker_order_invalid", failedIndex: index, details };
  }
  return { ok: true, outcome: "verified", details };
}

export const verifySegmentLexicalAndMarkerSequence = verifySegmentEndingAndMarkerSequence;
export const verifySegmentSequence = verifySegmentEndingAndMarkerSequence;

function pcmBuffer(value) {
  if (!(value instanceof Uint8Array) && !Buffer.isBuffer(value)) throw new TypeError("PCM must be a Uint8Array or Buffer");
  const output = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (output.byteLength % 2 !== 0) throw new RangeError("PCM must contain complete 16-bit samples");
  return output;
}

function sample(buffer, index) { return buffer.readInt16LE(index * 2) / 32768; }
function energy(buffer, start, end) {
  const first = Math.max(0, Math.floor(start));
  const last = Math.min(buffer.byteLength / 2, Math.floor(end));
  if (last <= first) return 0;
  let sum = 0;
  for (let index = first; index < last; index += 1) { const value = sample(buffer, index); sum += value * value; }
  return Math.sqrt(sum / (last - first));
}

function lowEnergyBoundary(buffer, markerSample, options) {
  if (!Number.isInteger(markerSample) || markerSample <= 0 || markerSample > buffer.byteLength / 2) return null;
  const window = options.windowSamples ?? Math.round(options.sampleRate * 0.01);
  const searchBack = options.searchBackSamples ?? Math.round(options.sampleRate * 2);
  const step = options.stepSamples ?? Math.max(1, Math.floor(window / 2));
  const maxRms = options.maxRms ?? 0.025;
  const earliest = Math.max(window, markerSample - searchBack);
  let best = null;
  for (let boundary = markerSample; boundary >= earliest; boundary -= step) {
    const rms = energy(buffer, boundary - window, boundary);
    if (rms > maxRms) continue;
    if (!best || rms < best.rms || (rms === best.rms && boundary > best.boundarySample)) best = { boundarySample: boundary, rms };
  }
  return best;
}

function fadeOut(buffer, fadeSamples) {
  const output = Buffer.from(buffer);
  const samples = output.byteLength / 2;
  const fade = Math.min(samples, Math.max(0, Math.floor(fadeSamples)));
  for (let index = samples - fade; index < samples; index += 1) {
    const scale = (samples - index - 1) / Math.max(1, fade - 1);
    output.writeInt16LE(Math.round(output.readInt16LE(index * 2) * scale), index * 2);
  }
  return output;
}

function trimNaturalEdges(buffer, options) {
  if (!options.trimNaturalSilence) return { pcm: buffer, leadingSamples: 0, trailingSamples: 0 };
  const window = options.windowSamples ?? Math.round(options.sampleRate * 0.01);
  const maxTrim = options.maxNaturalSilenceSamples ?? Math.round(options.sampleRate * 0.08);
  const maxRms = options.maxRms ?? 0.025;
  let leading = 0;
  while (leading + window <= buffer.byteLength / 2 && leading < maxTrim && energy(buffer, leading, leading + window) <= maxRms) leading += window;
  let trailing = 0;
  while (trailing + window <= buffer.byteLength / 2 - leading && trailing < maxTrim && energy(buffer, buffer.byteLength / 2 - trailing - window, buffer.byteLength / 2 - trailing) <= maxRms) trailing += window;
  const start = leading;
  const end = Math.max(start, buffer.byteLength / 2 - trailing);
  return { pcm: buffer.subarray(start * 2, end * 2), leadingSamples: leading, trailingSamples: trailing };
}

function prepareSegment(segment, options) {
  if (!segment || typeof segment !== "object") throw new TypeError("each PCM segment must be an object");
  let pcm = pcmBuffer(segment.pcm ?? segment.audio ?? segment.bytes);
  const marker = segment.markerStartSample ?? segment.markerSample;
  if (marker !== undefined) {
    const boundary = lowEnergyBoundary(pcm, marker, options);
    if (!boundary) throw new Error("no safe low-energy marker boundary");
    pcm = fadeOut(pcm.subarray(0, boundary.boundarySample * 2), options.fadeSamples ?? Math.round(options.sampleRate * 0.005));
  } else if (segment.trimSample !== undefined) {
    if (!Number.isInteger(segment.trimSample) || segment.trimSample <= 0 || segment.trimSample > pcm.byteLength / 2) throw new RangeError("invalid trimSample");
    pcm = fadeOut(pcm.subarray(0, segment.trimSample * 2), options.fadeSamples ?? Math.round(options.sampleRate * 0.005));
  } else if (segment.verified !== true && options.requireTrimBoundary !== false) {
    throw new Error("unverified PCM segment has no trim boundary");
  }
  return trimNaturalEdges(pcm, options);
}

function crossfadeJoin(left, right, overlap) {
  const leftSamples = left.byteLength / 2;
  const rightSamples = right.byteLength / 2;
  const count = Math.max(0, Math.min(overlap, Math.floor(leftSamples / 2), Math.floor(rightSamples / 2)));
  if (!count) return { pcm: Buffer.concat([left, right]), overlapSamples: 0 };
  const output = Buffer.alloc((leftSamples + rightSamples - count) * 2);
  left.copy(output, 0, 0, (leftSamples - count) * 2);
  for (let index = 0; index < count; index += 1) {
    const a = left.readInt16LE((leftSamples - count + index) * 2);
    const b = right.readInt16LE(index * 2);
    const value = Math.round(a * (count - index) / count + b * index / count);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, value)), (leftSamples - count + index) * 2);
  }
  right.copy(output, (leftSamples) * 2, count * 2);
  return { pcm: output, overlapSamples: count };
}

/** Assemble verified, marker-trimmed mono 24 kHz signed-16 PCM segments. */
export function assembleTrimmedPcmSegments(segments, options = {}) {
  if (!Array.isArray(segments) || !segments.length) throw new RangeError("segments must be a non-empty array");
  const config = { ...GEMINI_SEGMENT_DEFAULTS, ...options };
  if (config.sampleRate !== 24_000 || config.channels !== 1 || config.bitsPerSample !== 16) throw new RangeError("only mono 24 kHz signed 16-bit PCM is supported");
  assertFiniteNumber(config.crossfadeMs ?? 0, "crossfadeMs", { min: 0 });
  assertFiniteNumber(config.maxCrossfadeMs ?? 40, "maxCrossfadeMs", { min: 0 });
  if ((config.crossfadeMs ?? 0) > (config.maxCrossfadeMs ?? 40)) throw new RangeError("crossfadeMs exceeds bounded maximum");
  const prepared = segments.map((segment) => prepareSegment(segment, { ...config, trimNaturalSilence: options.trimNaturalSilence ?? true }));
  let output = prepared[0].pcm;
  const joins = [];
  const overlap = Math.round((config.crossfadeMs ?? 0) * config.sampleRate / 1000);
  for (let index = 1; index < prepared.length; index += 1) {
    const joined = crossfadeJoin(output, prepared[index].pcm, overlap);
    output = joined.pcm;
    joins.push({ index, overlapSamples: joined.overlapSamples, overlapMs: joined.overlapSamples / config.sampleRate * 1000 });
  }
  return {
    pcm: output,
    sampleRate: config.sampleRate,
    channels: 1,
    bitsPerSample: 16,
    byteLength: output.byteLength,
    sampleCount: output.byteLength / 2,
    durationSeconds: output.byteLength / 2 / config.sampleRate,
    segmentCount: prepared.length,
    joins,
    segmentEdges: prepared.map(({ leadingSamples, trailingSamples }) => ({ leadingSamples, trailingSamples })),
  };
}

export const assemblePcmSegments = assembleTrimmedPcmSegments;
export const assembleTrimmedMonoPcm = assembleTrimmedPcmSegments;

function durationMs(segment, sampleRate) {
  const value = segment?.durationMs ?? segment?.audioDurationMs ?? (segment?.pcm ? pcmBuffer(segment.pcm).byteLength / 2 / sampleRate * 1000 : undefined);
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("each timeline segment needs a positive durationMs or PCM");
  return value;
}

/** Simulate sequential generation with concurrent playback of verified segments. */
export function simulateSequentialGenerationConcurrentPlayback(segments, options = {}) {
  if (!Array.isArray(segments) || !segments.length) return { ok: false, outcome: "invalid_input", failure: "segments must be a non-empty array" };
  const sampleRate = options.sampleRate ?? GEMINI_SEGMENT_DEFAULTS.sampleRate;
  const hasGlobalVerification = options.verificationMs !== undefined;
  const verificationBySegment = Array.isArray(options.verificationMsBySegment) ? options.verificationMsBySegment : null;
  const generationGapMs = options.generationGapMs ?? 0;
  const playbackGapMs = options.playbackGapMs ?? 0;
  for (const [name, value] of [["generationGapMs", generationGapMs], ["playbackGapMs", playbackGapMs]]) {
    if (!Number.isFinite(value) || value < 0) return { ok: false, outcome: "invalid_timing", failure: `${name} must be >= 0` };
  }
  const timeline = [];
  let generationCursor = 0;
  let previousPlaybackEnd = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] || {};
    const generationDurationMs = segment.generationDurationMs ?? segment.generationMs ?? segment.generateMs;
    if (!Number.isFinite(generationDurationMs) || generationDurationMs < 0) return { ok: false, outcome: "invalid_timing", failedIndex: index, failure: "generation duration is required" };
    const verificationTimingSource = segment.verificationMs !== undefined
      ? "segment"
      : verificationBySegment?.[index] !== undefined
        ? "vector"
        : hasGlobalVerification
          ? "global"
          : null;
    const measuredVerificationMs = segment.verificationMs
      ?? verificationBySegment?.[index]
      ?? (hasGlobalVerification ? options.verificationMs : undefined);
    if (!Number.isFinite(measuredVerificationMs) || measuredVerificationMs < 0) {
      return { ok: false, outcome: "invalid_timing", failedIndex: index, failure: "measured per-segment verification duration is required" };
    }
    const generationStartMs = generationCursor;
    const generationEndMs = generationStartMs + generationDurationMs;
    const verificationStartMs = generationEndMs;
    const verificationEndMs = verificationStartMs + measuredVerificationMs;
    const readyAtMs = verificationEndMs;
    const duration = durationMs(segment, sampleRate);
    const playStartMs = Math.max(readyAtMs, index ? previousPlaybackEnd + playbackGapMs : readyAtMs);
    const playEndMs = playStartMs + duration;
    const gapBeforeMs = index ? Math.max(0, playStartMs - previousPlaybackEnd) : 0;
    timeline.push({
      index,
      generationStartMs,
      generationEndMs,
      verificationStartMs,
      verificationEndMs,
      verificationMs: measuredVerificationMs,
      verificationTimingSource,
      readyAtMs,
      playStartMs,
      playEndMs,
      playWaitMs: Math.max(0, playStartMs - readyAtMs),
      durationMs: duration,
      generationDurationMs,
      gapBeforeMs,
      firstGeneratedAudioAtMs: generationStartMs + (segment.firstAudioLatencyMs ?? options.firstAudioLatencyMs ?? 0),
      firstVerifiedAudibleAudioAtMs: playStartMs,
    });
    generationCursor = generationEndMs + generationGapMs;
    previousPlaybackEnd = playEndMs;
  }
  for (let index = 0; index < timeline.length; index += 1) {
    const next = timeline[index + 1];
    timeline[index].readyAheadMs = next ? Math.max(0, timeline[index].playEndMs - next.readyAtMs) : 0;
  }
  const gapsBySegment = timeline.map((item) => item.gapBeforeMs);
  const readyAheadBySegment = timeline.map((item) => item.readyAheadMs);
  return {
    ok: true,
    outcome: "simulated",
    timeline,
    firstAudioLatencyMs: timeline[0].playStartMs,
    gapsMs: gapsBySegment.reduce((sum, value) => sum + value, 0),
    gapsBySegment,
    readyAheadMs: Math.max(...readyAheadBySegment),
    readyAheadBySegment,
    totalDurationMs: timeline.at(-1).playEndMs,
    generationCompleteMs: generationCursor - generationGapMs,
  };
}

export const simulateSegmentPlaybackTimeline = simulateSequentialGenerationConcurrentPlayback;
export const simulateSequentialGeneration = simulateSequentialGenerationConcurrentPlayback;
