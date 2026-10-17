import {norm} from './study.js';
import {setLineStudied} from './progress-state.js';

export function wholeEpisodeLines(state, lines) {
  if (!state.prefs.unstudiedOnly) return lines;
  const studied = new Set(state.read);
  return lines.filter(line => !studied.has(line.id));
}

// Keep original line numbers when filtering or restoring a now-hidden line.
export function nearestWholeLine(visible, number = 1) {
  return visible.find(line => line.number >= number) || visible.at(-1) || null;
}

export function rememberWholePosition(state, lines, lineId, {atTop = false, now = Date.now()} = {}) {
  if (!lines.some(line => line.id === lineId)) return false;
  const previous = state.wholePosition;
  if (previous?.lineId === lineId && previous.atTop === atTop) return false;
  state.wholePosition = {lineId, atTop, updatedAt: now};
  state.updatedAt = Math.max(state.updatedAt, now);
  return true;
}

// Browsing never calls this. Only a deliberate save, study mark, or guided jump
// extends reached dialogue, so the existing backup and review rules still apply.
export function reachLine(state, lines, lineId) {
  const index = lines.findIndex(line => line.id === lineId);
  if (index < 0) return false;
  state.furthest = Math.max(state.furthest, index);
  return true;
}

export function markLineStudied(state, lines, lineId) {
  if (!reachLine(state, lines, lineId)) return false;
  return setLineStudied(state, lines, lineId, true);
}

export function phraseSegments(text, phrases = []) {
  const result = [];
  let offset = 0;
  while (offset < text.length) {
    let best;
    phrases.forEach((phrase, index) => {
      if (!phrase.surface) return;
      const at = text.indexOf(phrase.surface, offset);
      if (at >= 0 && (!best || at < best.at || (at === best.at && phrase.surface.length > best.text.length)))
        best = {at, text: phrase.surface, phrase: index};
    });
    if (!best) { result.push({text: text.slice(offset)}); break; }
    if (best.at > offset) result.push({text: text.slice(offset, best.at)});
    result.push({text: best.text, phrase: best.phrase});
    offset = best.at + best.text.length;
  }
  return result;
}

export function matchingLines(lines, query) {
  const value = norm(query);
  return value ? lines.filter(line => [line.ja, line.kana, line.en, line.speaker, line.spokenEn]
    .some(text => norm(text).includes(value))).map(line => line.id) : [];
}
