// Small, data-only helpers are also used by the cloud save endpoint.
export const normalizeWord = value => String(value || '').normalize('NFKC').trim();
export const normalizeReading = value => normalizeWord(value).replace(/[\s。！？?!、,.「」『』]/g, '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const familiarityKey = (word, reading) => `${normalizeWord(word)}|${normalizeReading(reading)}`;
export function mergeFamiliarity(...collections) {
  const result = {};
  for (const collection of collections) {
    if (!collection || typeof collection !== 'object' || Array.isArray(collection)) continue;
    for (const record of Object.values(collection).slice(0,16000)) {
      if (!record || typeof record.word !== 'string' || !record.word.trim() || record.word.length > 300 || typeof record.reading !== 'string' || record.reading.length > 2000 || typeof record.value !== 'boolean' || !Number.isFinite(record.updatedAt) || record.updatedAt < 0) continue;
      const word = normalizeWord(record.word), reading = normalizeReading(record.reading);
      const updatedAt = Math.min(record.updatedAt, Date.now() + 86400000);
      const key = familiarityKey(word, reading), previous = result[key];
      // A restored hint wins a timestamp tie, independent of merge order.
      if (!previous || updatedAt > previous.updatedAt || (updatedAt === previous.updatedAt && !record.value)) result[key] = {word, reading, value:record.value, updatedAt};
    }
  }
  return result;
}
