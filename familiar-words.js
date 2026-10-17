import {normalizeReading} from './shared-familiarity.js';
import {wordMeaning} from './word-meanings.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compare = new Intl.Collator('ja').compare;

export function familiarWords(known, query = '', expressions = []) {
  const search = normalizeReading(query).toLocaleLowerCase();
  return Object.entries(known || {})
    .filter(([, record]) => record.value === true)
    .map(([key, record]) => ({key, ...record, meaning:wordMeaning(record.word, record.reading, expressions)}))
    .filter(record => !search || [record.word, record.reading, record.meaning.text].some(text => normalizeReading(text).toLocaleLowerCase().includes(search)))
    .sort((a, b) => compare(a.reading || a.word, b.reading || b.word) || compare(a.word, b.word) || compare(a.key, b.key));
}

export function createFamiliarWords(ctx) {
  let query = '';
  function results() {
    const all = familiarWords(ctx.known()), shown = familiarWords(ctx.known(), query, ctx.expressions?.() || []);
    return `<p class="familiar-count" role="status">${query.trim() ? `${shown.length} of ${all.length}` : all.length} familiar ${all.length === 1 ? 'entry' : 'entries'} · all episodes</p>
      ${shown.length ? `<ul class="familiar-list" aria-label="Familiar words">${shown.map(entry => `<li class="familiar-row"><div class="familiar-word"><strong lang="ja">${esc(entry.word)}</strong>${entry.reading ? `<span lang="ja">${esc(entry.reading)}</span>` : ''}</div><div class="familiar-meaning ${entry.meaning.added ? 'added' : ''}"><span class="familiar-meaning-label">${esc(entry.meaning.label)}</span><p>${esc(entry.meaning.text)}</p>${entry.meaning.japanese ? `<details><summary>Japanese context</summary><p lang="ja">${esc(entry.meaning.japanese)}</p></details>` : ''}</div><button type="button" class="outline-button" data-restore-familiar="${esc(entry.key)}" aria-label="Restore reading hint for ${esc(entry.word)}${entry.reading ? ` (${esc(entry.reading)})` : ''} across all episodes">Restore hint</button></li>`).join('')}</ul>` : `<div class="familiar-empty"><p>${all.length ? 'No familiar words match your search.' : 'No words marked familiar yet.'}</p><p class="muted">${all.length ? 'Try a different word or reading.' : 'Click a word in either reading view and mark it familiar. It will appear here.'}</p></div>`}`;
  }
  function render() {
    return `<section class="familiar-page" aria-labelledby="familiar-title"><header class="page-intro"><span class="eyebrow">YOUR READING HINTS · ALL EPISODES</span><h1 id="familiar-title">Familiar words.</h1><p>Every word you’ve marked as familiar, from across the course. Restore a hint here to show it again in both readers when using “Words I’m learning.” Different readings stay separate. Blue meanings come from lesson notes or the dictionary.</p></header><div class="familiar-toolbar"><label for="familiar-search">Find a word, reading, or meaning<input id="familiar-search" type="search" value="${esc(query)}" placeholder="Search Japanese, kana, or English" autocomplete="off" aria-controls="familiar-results"></label><button class="outline-button" data-view="resume">Back to reading</button></div><div id="familiar-results">${results()}</div><p class="familiar-attribution">Dictionary meanings: <a href="https://www.edrdg.org/jmdict/j_jmdict.html" target="_blank" rel="noopener">JMdict / EDRDG</a>, <a href="./assets/WORD-MEANINGS-LICENSE.md" target="_blank" rel="noopener">CC BY-SA 4.0</a>. General definitions may vary with context.</p></section>`;
  }
  function input(target) {
    if (target.id !== 'familiar-search') return false;
    query = target.value;
    document.getElementById('familiar-results').innerHTML = results();
    return true;
  }
  function click(button) {
    const key = button.dataset.restoreFamiliar;
    if (key === undefined) return false;
    const entry = ctx.known()[key];
    if (!entry?.value) { ctx.render(); return true; }
    const index = familiarWords(ctx.known(), query, ctx.expressions?.() || []).findIndex(item => item.key === key);
    ctx.setFamiliar(entry.word, entry.reading, false);
    ctx.save(); ctx.render();
    const buttons = document.querySelectorAll('[data-restore-familiar]');
    (buttons[Math.min(index, buttons.length - 1)] || document.getElementById('familiar-search'))?.focus({preventScroll:true});
    ctx.toast(`Reading hint restored for ${entry.word} across all episodes.`);
    return true;
  }
  return {render, input, click};
}
