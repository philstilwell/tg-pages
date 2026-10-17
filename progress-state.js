// Explicit per-line changes let a reset survive an older device's saved marks.
export function setLineStudied(state, lines, lineId, studied, now = Date.now()) {
  const index = lines.findIndex(line => line.id === lineId);
  if (index < 0) return false;
  state.readStatus ||= {};
  const updatedAt = Math.max(now, (state.readStatus[lineId]?.updatedAt || 0) + 1);
  state.readStatus[lineId] = {studied, updatedAt};
  state.read = state.read.filter(id => id !== lineId);
  if (studied) {
    state.read.push(lineId);
    state.furthest = Math.max(state.furthest, index);
  }
  state.completed = state.read.length === lines.length;
  state.updatedAt = Math.max(state.updatedAt, updatedAt);
  return true;
}

export function undoLineStudy(state, lines, lineId, markedAt, now = Date.now()) {
  const mark = state.readStatus?.[lineId];
  // A newer study change or reset, including one from another device, takes precedence.
  if (!mark?.studied || mark.updatedAt !== markedAt) return false;
  return setLineStudied(state, lines, lineId, false, now);
}

export function resetStudyProgress(state, lines, {start = 1, end = lines.length, now = Date.now()} = {}) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > lines.length || start > end) return null;
  const snapshot = {current: state.current, wholePosition: state.wholePosition && {...state.wholePosition}, marks: []};
  for (const line of lines.slice(start - 1, end)) {
    const studied = state.read.includes(line.id);
    setLineStudied(state, lines, line.id, false, now);
    snapshot.marks.push({lineId: line.id, studied, resetAt: state.readStatus[line.id].updatedAt});
  }
  // Reached dialogue stays available so notes, expressions and scheduled reviews survive.
  state.current = Math.min(start - 1, state.furthest);
  snapshot.positionAt = state.positionAt = Math.max(now, state.positionAt + 1, (state.wholePosition?.updatedAt || 0) + 1);
  state.wholePosition = {lineId: lines[start - 1].id, atTop: start === 1, updatedAt: state.positionAt};
  state.updatedAt = Math.max(state.updatedAt, state.positionAt);
  return snapshot;
}

export function undoStudyReset(state, lines, snapshot, now = Date.now()) {
  for (const mark of snapshot.marks) {
    // Leave any work done since the reset alone.
    if (state.readStatus?.[mark.lineId]?.updatedAt === mark.resetAt)
      setLineStudied(state, lines, mark.lineId, mark.studied, now);
  }
  const updatedAt = Math.max(now, state.positionAt + 1, (state.wholePosition?.updatedAt || 0) + 1);
  if (state.current !== snapshot.current && state.positionAt === snapshot.positionAt) {
    state.current = snapshot.current;
    state.positionAt = updatedAt;
  }
  if (state.wholePosition?.updatedAt === snapshot.positionAt) {
    state.wholePosition = {...(snapshot.wholePosition || {lineId: lines[0].id, atTop: true}), updatedAt};
  }
  state.updatedAt = Math.max(state.updatedAt, updatedAt);
}
