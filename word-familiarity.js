import {familiarityKey, normalizeWord, normalizeReading} from './shared-familiarity.js';

const readings = new Map();
export function registerFamiliarReadings(entries) {
  for (const [word, reading] of entries) {
    if (!word || !reading) continue;
    const key = normalizeWord(word), values = readings.get(key) || new Set();
    values.add(normalizeReading(reading)); readings.set(key, values);
  }
}
export function sharedReading(word, reading) {
  if (reading) return normalizeReading(reading);
  const values = readings.get(normalizeWord(word));
  // Bridge a font-only occurrence to an explicit reading only when unambiguous.
  return values?.size === 1 ? [...values][0] : '';
}

export function isReadingFamiliar(state, word, reading, lineReading = '', known) {
  if (known) return known[familiarityKey(word, sharedReading(word, reading))]?.value === true;
  // Standalone/older episode state still uses the original identity.
  return state.known[`${word}|${reading || lineReading}`]?.value === true;
}

export function setReadingFamiliarity(state, word, reading, familiar, {lineReading = '', learningMode = false, now = Date.now(), known} = {}) {
  const resolvedReading = known ? sharedReading(word, reading) : reading || lineReading;
  const key = known ? familiarityKey(word, resolvedReading) : `${word}|${resolvedReading}`;
  const records = known || state.known;
  const updatedAt = Math.max(now, (records[key]?.updatedAt || 0) + 1);
  records[key] = {word:known ? normalizeWord(word) : word, reading:resolvedReading, value:familiar, updatedAt};
  // A failed review with a typed reading must also restore a prior font-only
  // mark, whose spelling was saved without a separately supplied reading.
  const fontKey = familiarityKey(word, '');
  if (known && !familiar && key !== fontKey && known[fontKey]) {
    known[fontKey] = {...known[fontKey], value:false, updatedAt:Math.max(updatedAt, known[fontKey].updatedAt + 1)};
  }
  if (learningMode && state.prefs.readingMode !== 'learning') {
    state.prefs.readingMode = 'learning';
    state.prefs.updatedAt = Math.max(now, state.prefs.updatedAt + 1);
  }
}
