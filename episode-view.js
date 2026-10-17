import {readingHintsControl} from './reading-hints.js';
import {isReadingFamiliar, setReadingFamiliarity} from './word-familiarity.js';
import {lines, parts, scene, packs} from './lesson-data.js';
import {readingMarkup, readingTokens} from './readings.js';
import {phraseSegments, matchingLines, markLineStudied, rememberWholePosition, wholeEpisodeLines, nearestWholeLine} from './episode-view-state.js';
import {setLineStudied, undoLineStudy} from './progress-state.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (label, action, extra = '') => `<button class="outline-button" data-whole="${action}" ${extra}>${label}</button>`;

export function createEpisodeView(ctx) {
  let selected = null, selectedPhrase = null, selectedWord = null, bilingual = false, query = '', matchIndex = -1, toolsOpen = false;
  let selection = null, timer, hideTimer, observer, previewTarget, anchor;
  let mountedEpisode = null, rows = [], positionTimer, positionDirty = false, restoring = false;
  let generation = 0, restoreTicket = 0, interaction = 0, moved = false, mountedPositionAt = 0;
  let resumeCue = null, resumeTimer, readingRow = null;
  let dismissStudyUndo = null;
  const S = () => ctx.state();
  const visibleLines = () => wholeEpisodeLines(S(), lines);
  const current = () => lines.find(line => line.id === selected);
  const phrases = line => packs[line.number]?.phrases || [];
  const row = id => document.getElementById(`whole-${id}`);
  const mobile = () => window.matchMedia('(max-width: 1050px)').matches;

  function reset() { leave(); selected = selectedPhrase = selectedWord = selection = null; query = ''; matchIndex = -1; dismissPreview(); }
  function visibleAnchor() {
    if (!rows.length) return null;
    const toolbar = document.querySelector('.episode-toolbar');
    const edge = Math.min(window.innerHeight - 1, (toolbar?.getBoundingClientRect().bottom || 0) + 14);
    const el = rows.find(el => el.getBoundingClientRect().bottom > edge + 1) || rows.at(-1);
    return {id: el.dataset.episodeLine, top: el.getBoundingClientRect().top, atTop: window.scrollY < 4};
  }
  function syncReadingLine(id) {
    const next = row(id);
    if (readingRow !== next) {
      readingRow?.classList.remove('is-reading'); readingRow?.removeAttribute('aria-current');
      readingRow = next;
      readingRow?.classList.add('is-reading'); readingRow?.setAttribute('aria-current', 'true');
    }
    const input = document.getElementById('episode-line-number');
    const visible = visibleLines(), index = visible.findIndex(line => line.id === id);
    const number = visible[index]?.number;
    // Scrolling must not replace a destination while the reader is typing it.
    if (input && document.activeElement !== input && number && input.value !== String(number)) input.value = String(number);
    if (input) { input.disabled = !visible.length; if (!visible.length) input.value = ''; }
    const go = document.querySelector('#episode-go-to-line button');
    if (go) go.disabled = !visible.length;
    const previous = document.querySelector('[data-whole="previous-line"]'), nextButton = document.querySelector('[data-whole="next-line"]');
    if (previous) previous.disabled = index <= 0;
    if (nextButton) nextButton.disabled = index < 0 || index >= visible.length - 1;
  }
  function remember(id, atTop = false) {
    syncReadingLine(id);
    ctx.interact();
    if (rememberWholePosition(S(), lines, id, {atTop})) ctx.save();
    mountedPositionAt = S().wholePosition?.updatedAt || 0;
  }
  function flush() {
    clearTimeout(positionTimer); positionTimer = null;
    if (mountedEpisode !== scene.episode || !positionDirty) return;
    positionDirty = false;
    const here = visibleAnchor();
    if (here) remember(here.id, here.atTop);
  }
  function leave() {
    dismissStudyUndo?.(); dismissStudyUndo = null;
    flush(); mountedEpisode = null; anchor = null; rows = []; moved = false;
    syncReadingLine(null);
    clearTimeout(resumeTimer); resumeCue = null;
    generation++; restoring = false; observer?.disconnect();
  }
  function beforeRender() {
    flush();
    clearTimeout(resumeTimer);
    // A late cloud response can restore a newer place until the reader interacts.
    anchor = mountedEpisode === scene.episode && (moved || mountedPositionAt === (S().wholePosition?.updatedAt || 0)) ? visibleAnchor() : null;
    mountedEpisode = null; generation++;
    dismissPreview(); observer?.disconnect();
  }
  function highlightResume(id) {
    clearTimeout(resumeTimer);
    if (id) {
      const previous = resumeCue && row(resumeCue.id);
      previous?.classList.remove('is-resumed'); previous?.style.removeProperty('--resume-delay');
      resumeCue = {id, startedAt: performance.now()};
    }
    if (!resumeCue) return;
    const el = row(resumeCue.id), elapsed = performance.now() - resumeCue.startedAt;
    if (!el || elapsed >= 3000) { resumeCue = null; return; }
    if (id) void el.offsetWidth; // Restart the cue when jumping to the same line again.
    el.classList.add('is-resumed');
    // Preserve the fade's timing through sync or preference rerenders.
    el.style.setProperty('--resume-delay', `-${elapsed}ms`);
    resumeTimer = setTimeout(() => {
      el.classList.remove('is-resumed'); el.style.removeProperty('--resume-delay'); resumeCue = null;
    }, 3000 - elapsed);
  }
  function restore(here, saved) {
    const ticket = ++restoreTicket, mountedGeneration = generation;
    restoring = true;
    const visible = visibleLines();
    const target = nearestWholeLine(visible, lines.find(line => line.id === (here?.id || saved?.lineId))?.number);
    const atTop = here?.atTop || (!here && (!saved || saved.atTop));
    if (!visible.length || atTop) window.scrollTo({top: 0, behavior: 'instant'});
    else if (here) {
      const el = row(target?.id);
      if (el) window.scrollBy({top: el.getBoundingClientRect().top - here.top, behavior: 'instant'});
    } else row(target?.id)?.scrollIntoView({block: 'start', behavior: 'instant'});
    syncReadingLine(atTop ? visible[0]?.id : target?.id);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (ticket === restoreTicket && mountedGeneration === generation) restoring = false; }));
  }
  function hints(text, line, phrase) {
    const mode = S().prefs.readingMode;
    if (phrase) {
      if (mode === 'request' || (mode === 'learning' && isReadingFamiliar(S(), text, phrase.reading, line.kana, ctx.known?.()))) return esc(text);
      return `<ruby class="manual-reading">${esc(text)}<rt class="added">${esc(phrase.reading)}</rt></ruby>`;
    }
    return readingTokens(text, {episode: scene.episode}).map(token => {
      if (token.plain || !/[一-龯々ぁ-んァ-ヶ]/.test(token.word)) return esc(token.word);
      const known = isReadingFamiliar(S(), token.word, token.reading, line.kana, ctx.known?.());
      const show = mode === 'all' || (mode === 'learning' && !known);
      return `<button type="button" class="episode-word ${show ? 'with-hint' : 'without-hint'}" data-episode-word="${esc(token.word)}" data-episode-reading="${esc(token.reading || '')}" aria-label="Reading help for ${esc(token.word)}">${show ? readingMarkup(token.word, {episode: scene.episode}) : esc(token.word)}</button>`;
    }).join('');
  }
  function japanese(line) {
    const ps = phrases(line);
    return phraseSegments(line.ja, ps).map(segment => segment.phrase === undefined
      ? hints(segment.text, line)
      : `<button class="episode-phrase" data-episode-phrase="${segment.phrase}" aria-label="Explain phrase ${esc(segment.text)}">${hints(segment.text, line, ps[segment.phrase])}</button>`).join('');
  }
  function studyControl(line) {
    const studied = S().read.includes(line.id);
    return `<button type="button" class="episode-studied" data-whole="toggle-studied" data-line-id="${line.id}" aria-pressed="${studied}" aria-label="Line ${line.number} studied" title="Mark line ${line.number} ${studied ? 'unstudied' : 'studied'}">${studied ? '✓ Studied' : 'Mark studied'}</button>`;
  }
  function lineHTML(line) {
    return `<article class="episode-line ${selected === line.id ? 'is-selected' : ''}" id="whole-${line.id}" data-episode-line="${line.id}">
      <div class="episode-line-meta"><button class="line-explore" data-whole="open" data-line-id="${line.id}" aria-expanded="${selected === line.id}" aria-controls="whole-detail"><span class="episode-line-number">${String(line.number).padStart(3, '0')}</span><span>${esc(line.speaker)}</span><span class="line-explore-label">Explore line ${line.number} ↗</span></button>${studyControl(line)}</div>
      ${line.sourceLanguage === 'en' ? `<p class="mini-label">SPOKEN IN ENGLISH · JAPANESE BELOW IS A STUDY TRANSLATION</p><p class="episode-spoken" lang="en">${esc(line.spokenEn)}</p>` : ''}
      <p class="episode-japanese ${line.ja !== line.originalJa ? 'added' : ''}" lang="ja">${japanese(line)}</p>
      <p class="episode-translation" ${bilingual ? '' : 'hidden'} lang="en">${ctx.amended(line.originalEn, line.en) || 'No separate translation for this line.'}</p>
      <div class="whole-detail-slot"></div>
    </article>`;
  }
  function transcript(shown) {
    if (!shown.length) return `<div class="episode-empty" role="status"><h2>All lines studied.</h2><p>You’ve covered every line in Episode ${scene.episode}. Show all lines to revisit the dialogue or mark a line unstudied.</p>${button('Show all lines', 'show-all')}</div>`;
    return parts.map(part => {
      const remaining = shown.filter(line => line.number >= part.start && line.number <= part.end);
      if (!remaining.length) return '';
      return `<section class="episode-part" id="episode-part-${part.number}" aria-labelledby="episode-part-title-${part.number}"><header><span class="eyebrow">PART ${String(part.number).padStart(2, '0')} · LINES ${part.start}–${part.end}</span><h2 id="episode-part-title-${part.number}">${esc(part.title)}</h2></header>${remaining.map(lineHTML).join('')}</section>`;
    }).join('') + `<p class="episode-end">${S().prefs.unstudiedOnly ? `End of unstudied dialogue · ${shown.length} of ${lines.length} lines` : `End of Episode ${scene.episode} · ${lines.length} lines`}</p>`;
  }
  function render() {
    const shown = visibleLines();
    if (selected && !shown.some(line => line.id === selected)) {
      selected = nearestWholeLine(shown, current()?.number)?.id || null;
      selectedPhrase = selectedWord = selection = null; ctx.studio.cancelComposer();
    }
    return `<header class="episode-intro"><h1>The whole episode<span class="coral">.</span></h1><p>Click a word to manage its reading hint, or a line for translation and notes.</p></header>
      <div class="episode-toolbar" aria-label="Whole episode controls">
        <div class="episode-control-row"><div class="episode-line-navigation"><form id="episode-go-to-line"><label for="episode-line-number">Go to line</label><input id="episode-line-number" type="number" inputmode="numeric" min="1" max="${lines.length}" step="1" required placeholder="1–${lines.length}" aria-describedby="episode-line-range"><span id="episode-line-range" class="sr-only">Enter a whole number from 1 to ${lines.length} for Episode ${scene.episode}.</span><button class="outline-button" type="submit">Go</button><span id="episode-go-status" class="sr-only" role="status"></span></form><div class="episode-line-steps" role="group" aria-label="Move one line">${button('<span class="line-step-label">Previous line</span><kbd aria-hidden="true">↑</kbd>', 'previous-line', 'type="button" aria-label="Previous line" aria-keyshortcuts="ArrowUp" title="Previous line (↑)" disabled')}${button('<span class="line-step-label">Next line</span><kbd aria-hidden="true">↓</kbd>', 'next-line', 'type="button" aria-label="Next line" aria-keyshortcuts="ArrowDown" title="Next line (↓)" disabled')}</div></div><button class="outline-button episode-tools-toggle" data-whole="tools" aria-expanded="${toolsOpen}" aria-controls="episode-tools">Tools <span aria-hidden="true">${toolsOpen?'−':'+'}</span></button></div>
        ${S().prefs.unstudiedOnly ? `<div class="episode-filter-status"><span role="status">${shown.length} unstudied ${shown.length === 1 ? 'line' : 'lines'}</span>${button('Show all', 'show-all', 'aria-label="Show all lines"')}</div>` : ''}
        <div id="episode-tools" ${toolsOpen?'':'hidden'}><form id="episode-search" role="search"><label class="sr-only" for="episode-query">Find in this episode</label><input id="episode-query" type="search" value="${esc(query)}" placeholder="Find Japanese, English, or a speaker"><button class="outline-button" type="submit">Find next ↓</button><span id="episode-search-status" role="status"></span></form>
        <div class="episode-options">${readingHintsControl(S().prefs.readingMode, 'Reading hints')}<label>Text size<select id="text-size">${[[.9,'Small'],[1,'Standard'],[1.15,'Large'],[1.3,'Largest']].map(([n,v]) => `<option value="${n}" ${S().prefs.textSize === n ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="check"><input id="episode-bilingual" type="checkbox" ${bilingual ? 'checked' : ''}>Show all English</label><label class="check"><input id="episode-unstudied" type="checkbox" ${S().prefs.unstudiedOnly ? 'checked' : ''}>Show only unstudied lines</label><label>Jump to part<select id="episode-part"><option value="">Choose a part</option>${parts.map(part => { const first = shown.find(line => line.number >= part.start && line.number <= part.end); return `<option value="${first?.number || part.start}" ${first ? '' : 'disabled'}>Part ${part.number} · lines ${part.start}–${part.end}${first ? '' : ' · all studied'}</option>`; }).join('')}</select></label></div><button class="small-link progress-tools-link" data-view="progress">Progress & resets ↗</button></div>
      </div>
      <div class="episode-workspace ${shown.length ? '' : 'is-empty'}"><section class="episode-transcript" aria-label="${S().prefs.unstudiedOnly ? 'Unstudied episode dialogue' : 'Entire episode transcript'}">${transcript(shown)}</section><aside class="episode-detail-home" aria-label="Line explanation" ${shown.length ? '' : 'hidden'}><div id="whole-detail" class="episode-detail" tabindex="-1" aria-label="Selected line explanation">${detail()}</div></aside></div>
      <div id="episode-hover" class="episode-hover" role="tooltip" hidden></div>`;
  }
  function detail() {
    const line = current();
    if (!line) return `<div class="episode-detail-empty"><span class="eyebrow">A CLOSER LOOK</span><h2>Follow your curiosity.</h2><p>Choose any line to see its translation and notes here.</p><p>Underlined phrases open reviewed grammar and usage guides. You can also select Japanese text and save your own expression.</p><span class="detail-key">Keyboard: Tab to a line or phrase, then press Enter.</span></div>`;
    const phrase = phrases(line)[selectedPhrase];
    return `<div class="episode-detail-head"><div><span class="eyebrow">EPISODE ${scene.episode} · LINE ${line.number}</span><h2>${esc(line.speaker)}</h2></div>${button('Close', 'close')}</div>
      <section class="episode-detail-translation" role="region" aria-label="English translation" tabindex="0"><span class="mini-label">${line.originalEn ? 'ENGLISH TRANSLATION' : 'EDITORIAL TRANSLATION'}</span><p class="detail-english" lang="en">${ctx.amended(line.originalEn, line.en) || 'No separate translation for this line. Compare the nearby lines.'}</p>${line.uncertain ? `<p class="added">Context uncertain: ${esc(line.tip)}</p>` : ''}</section>
      <div class="episode-detail-body" role="region" aria-label="Notes and study guides" tabindex="0">
      ${wordReadingControl(line)}
      ${phrase ? `<section class="episode-phrase-guide added"><span class="mini-label">EDITORIAL PHRASE GUIDE</span><h3 lang="ja">${esc(phrase.surface)}</h3><p lang="ja">${esc(phrase.reading)}</p><p><strong>${esc(phrase.meaning)}</strong></p><p><strong>How it works</strong><br>${esc(phrase.structure)}</p><p><strong>Base / full form</strong><br><span lang="ja">${esc(phrase.base)}</span></p><p><strong>${esc(phrase.register)}</strong><br>${esc(phrase.usage)}</p>${phrase.alternative ? `<p><strong>Another way to say it</strong><br><span lang="ja">${esc(phrase.alternative)}</span><br>${esc(phrase.alternativeMeaning)}</p>` : ''}${button('Save this phrase', 'save-phrase')}</section>` : ''}
      ${S().prefs.readingMode !== 'all' ? `<section><span class="mini-label">KANA READING</span><p class="detail-kana ${line.kana !== line.originalKana ? 'added' : ''}" lang="ja">${esc(line.kana || 'No reading supplied for this line.')}</p></section>` : ''}
      ${line.note ? `<section><span class="mini-label">${line.originalNote ? 'SOURCE NOTE' : 'EDITORIAL NOTE'}</span><p class="preserve-lines">${ctx.amended(line.originalNote, line.note)}</p></section>` : ''}
      ${(line.explanations || []).map(explanation => `<section class="added"><h3 lang="ja">${esc(explanation.phrase)}</h3><p>${esc(explanation.meaning)}</p><p>${esc(explanation.context)}</p>${explanation.example ? `<p><strong>Example</strong><br><span lang="ja">${esc(explanation.example)}</span><br>${esc(explanation.exampleEn)}</p>` : ''}</section>`).join('')}
      ${ctx.studio.composerHTML()}</div>
      <div class="episode-detail-actions" role="group" aria-label="Study this line">${S().read.includes(line.id) ? button('Mark unstudied', 'unstudied') : button('Mark studied', 'studied')}${button('Save line', 'save-line')}${button('Save selection', 'save-selection')}${button('Guided reader', 'continue')}</div>`;
  }
  function wordReadingControl(line) {
    if (!selectedWord) return '';
    const {word, reading} = selectedWord, familiar = isReadingFamiliar(S(), word, reading, line.kana, ctx.known?.());
    const preview = reading ? `<ruby class="manual-reading">${esc(word)}<rt>${esc(reading)}</rt></ruby>` : readingMarkup(word, {episode: scene.episode});
    return `<section class="episode-word-reading" aria-label="Word reading"><div class="word-reading-heading"><span class="mini-label">READING HINT</span><span class="word-familiar-status">${familiar ? '✓ Familiar · all episodes' : 'Learning'}</span></div><p class="word-reading-preview with-hint" lang="ja">${preview}</p>${button(familiar ? 'Restore reading hint' : 'Mark familiar · hide hint', 'word-familiar')}${S().prefs.readingMode !== 'learning' ? '<p class="word-reading-help">Switches to “Words I’m learning” hints.</p>' : ''}</section>`;
  }
  function placeDetail() {
    const panel = document.getElementById('whole-detail');
    if (!panel) return;
    const destination = mobile() && selected ? row(selected)?.querySelector('.whole-detail-slot') : document.querySelector('.episode-detail-home');
    if (destination && panel.parentElement !== destination) destination.append(panel);
  }
  function refreshDetail() {
    const panel = document.getElementById('whole-detail');
    if (!panel) return;
    panel.innerHTML = detail(); placeDetail();
    panel.querySelector('.episode-detail-body')?.scrollTo(0, 0);
    document.querySelectorAll('.episode-line').forEach(el => {
      const active = el.dataset.episodeLine === selected;
      el.classList.toggle('is-selected', active);
      el.querySelector('.line-explore').setAttribute('aria-expanded', String(active));
    });
  }
  function select(id, phrase = null, word = null) {
    if (!lines.some(line => line.id === id)) return;
    dismissPreview();
    if (selected !== id) { selection = null; ctx.studio.cancelComposer(); }
    selected = id; selectedPhrase = phrase;
    const p = phrases(current())[phrase];
    selectedWord = word || (p ? {word: p.surface, reading: p.reading} : null);
    refreshDetail();
    // Exploring a line also records it, but never marks it studied.
    clearTimeout(positionTimer); positionTimer = null; positionDirty = false; moved = true;
    remember(id);
  }
  function close() {
    const id = selected;
    dismissPreview(); selected = selectedPhrase = selectedWord = selection = null;
    ctx.studio.cancelComposer(); refreshDetail();
    row(id)?.querySelector('.line-explore')?.focus({preventScroll:true});
  }
  function toggle(id) {
    if (selected === id) close();
    else select(id);
  }
  function compose(entry) {
    ctx.studio.beginExpression(entry); refreshDetail();
    const form = document.getElementById('expression-form');
    form?.scrollIntoView({block: 'nearest'}); form?.querySelector('input')?.focus({preventScroll: true});
  }
  function captureSelection() {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.toString().trim()) return;
    const parent = sel.anchorNode?.parentElement?.closest('.episode-japanese');
    if (!parent || !parent.contains(sel.focusNode)) return;
    const contents = sel.getRangeAt(0).cloneContents();
    contents.querySelectorAll('rt').forEach(el => el.remove());
    const text = contents.textContent.trim(), id = parent.closest('[data-episode-line]').dataset.episodeLine;
    if (text) { select(id); selection = {text, id}; }
  }
  function changeStudy(line, studied, inline = false) {
    dismissPreview(); dismissStudyUndo?.(); dismissStudyUndo = null;
    const episode = scene.episode, restoreExplanation = selected === line.id;
    if (studied) markLineStudied(S(), lines, line.id);
    else setLineStudied(S(), lines, line.id, false);
    const markedAt = S().readStatus[line.id].updatedAt;
    ctx.save(); ctx.render();
    const target = nearestWholeLine(visibleLines(), line.number);
    const control = inline ? row(target?.id)?.querySelector('.episode-studied') : document.querySelector('[data-whole="studied"], [data-whole="unstudied"]');
    (control || document.querySelector('[data-whole="show-all"]'))?.focus({preventScroll:true});
    dismissStudyUndo = ctx.toast(`Line ${line.number} marked ${studied ? 'studied' : 'unstudied'}.`, studied ? {
      label: 'Undo', description: `Undo marking line ${line.number} studied`,
      run: () => {
        dismissStudyUndo = null;
        if (scene.episode !== episode) return;
        flush();
        if (!undoLineStudy(S(), lines, line.id, markedAt)) {
          ctx.toast(`Line ${line.number} has changed since this mark. Its latest progress was kept.`); return;
        }
        if (restoreExplanation) { selected = line.id; selectedPhrase = selectedWord = selection = null; ctx.studio.cancelComposer(); }
        ctx.save(); ctx.render();
        interaction++; moved = true; remember(line.id);
        restore(null, S().wholePosition); highlightResume(line.id);
        const restoredControl = inline ? row(line.id)?.querySelector('.episode-studied') : document.querySelector('[data-whole="studied"]');
        restoredControl?.focus({preventScroll:true});
        ctx.toast(`Line ${line.number} restored as unstudied.`);
      }
    } : null);
  }
  function click(event) {
    if (!document.querySelector('.episode-workspace')) return false;
    const action = event.target.closest('[data-whole]'), phrase = event.target.closest('[data-episode-phrase]'), word = event.target.closest('[data-episode-word]');
    const article = event.target.closest('[data-episode-line]');
    if (window.getSelection()?.toString().trim() && article && !action) { captureSelection(); return true; }
    if (word) { select(article.dataset.episodeLine, null, {word: word.dataset.episodeWord, reading: word.dataset.episodeReading}); if (!event.detail) document.querySelector('[data-whole="word-familiar"]')?.focus({preventScroll:true}); return true; }
    if (phrase) { select(article.dataset.episodeLine, Number(phrase.dataset.episodePhrase)); if (!event.detail) document.getElementById('whole-detail')?.focus({preventScroll:true}); return true; }
    if (!action && article && !event.target.closest('button,a,input,textarea,select,summary,.whole-detail-slot')) { toggle(article.dataset.episodeLine); return true; }
    if (!action || action.disabled) return false;
    if (action.dataset.whole === 'show-all') { changeFilter(false); return true; }
    if (action.dataset.whole === 'toggle-studied') {
      const line = lines.find(line => line.id === action.dataset.lineId);
      if (line) changeStudy(line, !S().read.includes(line.id), true);
      return true;
    }
    if (action.dataset.whole === 'tools') {
      const here = visibleAnchor(); toolsOpen = !toolsOpen;
      document.getElementById('episode-tools').hidden = !toolsOpen;
      action.setAttribute('aria-expanded', String(toolsOpen));
      action.innerHTML = `Tools <span aria-hidden="true">${toolsOpen?'−':'+'}</span>`;
      const height = document.querySelector('.reading-switcher').offsetHeight + document.querySelector('.episode-toolbar').offsetHeight;
      document.documentElement.style.setProperty('--episode-controls-height', `${height}px`);
      if (here) restore(here.atTop ? here : null, {lineId: here.id, atTop: here.atTop});
      return true;
    }
    if (action.dataset.whole === 'previous-line' || action.dataset.whole === 'next-line') {
      stepLine(action.dataset.whole === 'next-line' ? 1 : -1);
      return true;
    }
    if (action.dataset.whole === 'open') { toggle(action.dataset.lineId); if (!event.detail && selected) document.getElementById('whole-detail')?.focus({preventScroll:true}); return true; }
    const line = current();
    if (!line) return true;
    switch (action.dataset.whole) {
      case 'word-familiar': {
        if (!selectedWord) break;
        const {word, reading} = selectedWord;
        const familiar = !isReadingFamiliar(S(), word, reading, line.kana, ctx.known?.());
        if (ctx.setFamiliar) ctx.setFamiliar(word, reading, familiar);
        else setReadingFamiliarity(S(), word, reading, familiar, {lineReading: line.kana, learningMode: true});
        ctx.save(); ctx.render();
        document.querySelector('[data-whole="word-familiar"]')?.focus({preventScroll:true});
        ctx.toast(familiar ? 'Marked familiar across all episodes.' : 'Reading hint restored across all episodes.');
        break;
      }
      case 'close': close(); break;
      case 'studied':
      case 'unstudied': changeStudy(line, action.dataset.whole === 'studied'); break;
      case 'continue': ctx.continueAt(line.id); break;
      case 'save-line': compose({term:line.term || line.ja, reading:line.reading || line.kana, meaning:line.meaning || line.en, lineId:line.id, provenance:'lesson'}); break;
      case 'save-phrase': { const p = phrases(line)[selectedPhrase]; if (p) compose({term:p.surface, reading:p.reading, meaning:p.meaning, lineId:line.id, provenance:'lesson'}); break; }
      case 'save-selection': captureSelection(); if (selection) compose({term:selection.text, lineId:selection.id, provenance:'personal', skills:['meaning']}); else ctx.toast('Select Japanese text in a line first, then choose Save selection.'); break;
    }
    return true;
  }
  function changeFilter(enabled) {
    S().prefs.unstudiedOnly = enabled;
    S().prefs.updatedAt = Math.max(Date.now(), S().prefs.updatedAt + 1);
    matchIndex = -1;
    ctx.save(); ctx.render();
    document.querySelector(toolsOpen ? '#episode-unstudied' : '[data-whole="tools"]')?.focus({preventScroll:true});
  }
  function change(target) {
    if (target.id === 'episode-unstudied') { changeFilter(target.checked); return true; }
    if (target.id === 'episode-bilingual') {
      const here = visibleAnchor();
      bilingual = target.checked;
      document.querySelectorAll('.episode-translation').forEach(el => el.hidden = !bilingual);
      restore(here, S().wholePosition);
      return true;
    }
    if (target.id === 'episode-part') {
      const line = lines[Number(target.value) - 1];
      if (line) { moved = true; remember(line.id); row(line.id)?.scrollIntoView({block:'start', behavior:'instant'}); }
      return true;
    }
    return false;
  }
  function stepLine(direction, focusLine = false) {
    flush();
    const visible = visibleLines(), index = visible.findIndex(line => line.id === readingRow?.dataset.episodeLine);
    const next = index >= 0 && visible[index + direction];
    if (next) jumpToLine(next.number, focusLine);
  }
  function jumpToLine(number, focusLine = true) {
    const line = lines[number - 1];
    if (!line) return;
    if (!row(line.id)) {
      const message = `Line ${number} is studied and hidden. Choose Show all to go to it.`;
      document.getElementById('episode-go-status').textContent = message; ctx.toast(message);
      return;
    }
    // Update and place the explanation before scrolling; on phones it sits inside the line.
    select(line.id); restore(null, S().wholePosition); highlightResume(line.id);
    if (focusLine) row(line.id)?.querySelector('.line-explore')?.focus({preventScroll:true});
    document.getElementById('episode-go-status').textContent = `Episode ${scene.episode}, line ${number}.`;
  }
  function search(form) {
    if (form.id === 'episode-go-to-line') {
      const input = document.getElementById('episode-line-number'), number = input.valueAsNumber;
      if (!form.reportValidity() || !Number.isInteger(number) || number < 1 || number > lines.length) return true;
      jumpToLine(number);
      return true;
    }
    if (form.id !== 'episode-search') return false;
    const value = document.getElementById('episode-query').value.trim();
    if (value !== query) matchIndex = -1;
    query = value;
    const matches = matchingLines(visibleLines(), query);
    matchIndex = matches.length ? (matchIndex + 1) % matches.length : -1;
    showSearch(matches);
    if (matchIndex >= 0) { const id = matches[matchIndex]; select(id); row(id)?.scrollIntoView({block:'start', behavior:'instant'}); }
    return true;
  }
  function showSearch(matches = matchingLines(visibleLines(), query)) {
    if (matchIndex >= matches.length) matchIndex = -1;
    document.querySelectorAll('.episode-line').forEach(el => el.classList.toggle('is-match', matches.includes(el.dataset.episodeLine)));
    document.getElementById('episode-search-status').textContent = !query ? '' : matches.length ? `${Math.max(0, matchIndex) + 1} of ${matches.length} matches` : S().prefs.unstudiedOnly ? 'No matches in unstudied lines.' : 'No matches in this episode.';
  }
  function dismissPreview() {
    clearTimeout(timer); clearTimeout(hideTimer);
    previewTarget?.removeAttribute('aria-describedby'); previewTarget = null;
    const box = document.getElementById('episode-hover'); if (box) box.hidden = true;
  }
  function preview(target) {
    if (window.getSelection()?.toString().trim()) return;
    const article = target.closest('[data-episode-line]');
    const line = lines.find(line => line.id === article?.dataset.episodeLine);
    const box = document.getElementById('episode-hover');
    if (!line || !box) return;
    const phrase = phrases(line)[target.dataset.episodePhrase];
    box.innerHTML = `<span class="mini-label">${phrase ? 'PHRASE PREVIEW · EDITORIAL' : `LINE ${line.number} · ENGLISH PREVIEW`}</span>${phrase ? `<p lang="ja">${esc(phrase.reading)}</p>` : ''}<p>${esc(phrase?.meaning || line.en || 'No separate translation supplied for this line.')}</p><small>Click to keep the explanation open. Esc to dismiss.</small>`;
    box.hidden = false; previewTarget = target; target.setAttribute('aria-describedby','episode-hover');
    const rect = target.getBoundingClientRect(), height = box.offsetHeight;
    box.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - box.offsetWidth - 12))}px`;
    box.style.top = `${rect.bottom + height + 12 < window.innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - height - 6)}px`;
  }
  function mount() {
    placeDetail(); showSearch();
    const toolbar = document.querySelector('.episode-toolbar');
    if (!toolbar) return;
    const switcher = document.querySelector('.reading-switcher');
    let toolbarHeight = 0, switcherHeight = 0;
    const measure = () => {
      const nextToolbar = toolbar.offsetHeight, nextSwitcher = switcher?.offsetHeight || 0;
      const changed = toolbarHeight !== nextToolbar || switcherHeight !== nextSwitcher;
      toolbarHeight = nextToolbar; switcherHeight = nextSwitcher;
      document.documentElement.style.setProperty('--episode-switcher-height', `${switcherHeight}px`);
      document.documentElement.style.setProperty('--episode-controls-height', `${switcherHeight + toolbarHeight}px`);
      return changed;
    };
    measure();
    mountedEpisode = scene.episode;
    rows = [...document.querySelectorAll('[data-episode-line]')];
    const here = anchor, saved = S().wholePosition, initialInteraction = interaction;
    mountedPositionAt = saved?.updatedAt || 0;
    restore(here, saved); anchor = null;
    highlightResume(!here && saved && !saved.atTop ? nearestWholeLine(visibleLines(), lines.find(line => line.id === saved.lineId)?.number)?.id : null);
    const mountedGeneration = generation;
    observer = new ResizeObserver(() => {
      if (!measure()) return;
      if (mountedGeneration === generation && initialInteraction === interaction) restore(here, saved);
    });
    observer.observe(toolbar);
    if (switcher) observer.observe(switcher);
    // Font loading can change the height of hundreds of preceding lines.
    if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(() => {
      if (mountedGeneration === generation && initialInteraction === interaction) { measure(); restore(here, saved); }
    });
    const transcript = document.querySelector('.episode-transcript'), box = document.getElementById('episode-hover');
    transcript.addEventListener('pointerover', event => {
      if (event.pointerType !== 'mouse' || event.target.closest('.whole-detail-slot')) return;
      const target = event.target.closest('[data-episode-phrase],.episode-japanese,.line-explore');
      if (!target || target.contains(event.relatedTarget)) return;
      dismissPreview(); timer = setTimeout(() => preview(target), 450);
    });
    transcript.addEventListener('pointerout', event => {
      const target = event.target.closest('[data-episode-phrase],.episode-japanese,.line-explore');
      if (target && !target.contains(event.relatedTarget)) { clearTimeout(timer); hideTimer = setTimeout(dismissPreview, 180); }
    });
    transcript.addEventListener('pointerup', event => { if (event.target.closest('.episode-japanese') && window.getSelection()?.toString().trim()) captureSelection(); });
    box.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    box.addEventListener('pointerleave', dismissPreview);
  }
  window.addEventListener('resize', () => { placeDetail(); dismissPreview(); });
  window.addEventListener('scroll', () => {
    dismissPreview();
    if (mountedEpisode !== scene.episode || restoring) return;
    ctx.interact(); moved = true; positionDirty = true;
    if (!positionTimer) positionTimer = setTimeout(flush, 200);
  }, {passive:true});
  // Cancel late font restoration as soon as the reader starts interacting.
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) document.addEventListener(type, () => { interaction++; }, {passive:true});
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { dismissPreview(); return; }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (mountedEpisode !== scene.episode || !document.querySelector('.episode-workspace')) return;
    const target = event.target instanceof Element ? event.target : document.activeElement;
    // Keep notes scrolling, text editing, Japanese input, and native widget navigation intact.
    if (target?.isContentEditable || target?.closest('.episode-detail-body,.episode-detail-translation,input,textarea,select,dialog,[role="dialog"],[role="textbox"],[role="combobox"],[role="listbox"],[role="menu"],[role="slider"],[role="spinbutton"],audio,video')) return;
    event.preventDefault();
    stepLine(event.key === 'ArrowDown' ? 1 : -1, true);
  });
  return {render, mount, beforeRender, reset, leave, flush, click, change, search};
}
