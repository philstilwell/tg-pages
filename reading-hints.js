const modes = [
  {value: 'request', label: 'On request', explanation: 'Hides automatic readings. Open a line or word’s study details when you need reading help.'},
  {value: 'all', label: 'All · Furifont', explanation: 'Shows available kana readings above the Japanese text using Furifont.'},
  {value: 'learning', label: 'Words I’m learning', explanation: 'Shows hints for unfamiliar words. Click a word or phrase in either reading view and mark it familiar to hide its reading throughout all episodes in this mode.'},
];

export function readingHintsControl(value, label = 'Reading hints') {
  const selected = modes.find(mode => mode.value === value) || modes[1];
  return `<div class="reading-hints-field">
    <label id="reading-hints-label" for="reading-mode-trigger">${label}</label>
    <button id="reading-mode-trigger" type="button" class="reading-mode-trigger" role="combobox" aria-labelledby="reading-hints-label" aria-haspopup="listbox" aria-controls="reading-hints-options" aria-expanded="false"><span>${selected.label}</span><span aria-hidden="true">⌄</span></button>
    <select id="reading-mode" hidden aria-label="Reading mode">${modes.map(mode => `<option value="${mode.value}" ${selected.value === mode.value ? 'selected' : ''}>${mode.label}</option>`).join('')}</select>
    <div id="reading-hints-options" class="reading-hints-options" role="listbox" aria-labelledby="reading-hints-label" popover="manual" hidden>${modes.map((mode, index) => `<div id="reading-hints-option-${index}" class="reading-hints-option" role="option" data-reading-option="${index}" aria-selected="${selected.value === mode.value}"><span>${mode.label}</span><span class="reading-option-check" aria-hidden="true">${selected.value === mode.value ? '✓' : ''}</span></div>`).join('')}</div>
    <div id="reading-hints-help" class="reading-hints-popup" role="tooltip" popover="manual" hidden></div>
  </div>`;
}

// The custom list keeps option hover help available across browsers; the hidden
// select still feeds the existing preference-saving handler in both readers.
export function installReadingHintsHelp() {
  let field = null, activeIndex = 0, hintOption = null, closeTimer, keyboard = false;
  const fieldFor = target => target instanceof Element ? target.closest('.reading-hints-field') : null;
  const trigger = () => field?.querySelector('.reading-mode-trigger');
  const menu = () => field?.querySelector('.reading-hints-options');
  const popup = () => field?.querySelector('.reading-hints-popup');
  const options = () => [...field.querySelectorAll('[data-reading-option]')];
  function conceal(element) {
    if (!element) return;
    if (element.isConnected && element.matches(':popover-open')) element.hidePopover();
    element.hidden = true;
  }
  function reveal(element) {
    element.hidden = false;
    element.showPopover?.();
  }
  function hideHint() {
    clearTimeout(closeTimer);
    hintOption?.removeAttribute('aria-describedby');
    trigger()?.removeAttribute('aria-describedby');
    conceal(popup());
    hintOption = null;
  }
  function close() {
    hideHint();
    conceal(menu());
    trigger()?.setAttribute('aria-expanded', 'false');
    trigger()?.removeAttribute('aria-activedescendant');
    field = null;
  }
  function positionMenu() {
    const rect = trigger().getBoundingClientRect(), list = menu();
    list.style.width = `${Math.min(innerWidth - 24, Math.max(205, rect.width))}px`;
    list.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - list.offsetWidth - 12))}px`;
    const below = innerHeight - rect.bottom - 18;
    list.style.top = `${Math.max(12, below >= list.offsetHeight ? rect.bottom + 6 : rect.top - list.offsetHeight - 6)}px`;
  }
  function showHint(index) {
    hideHint();
    hintOption = options()[index];
    const help = popup(), mode = modes[index];
    help.innerHTML = `<strong>${mode.label}</strong><p>${mode.explanation}</p>`;
    hintOption.setAttribute('aria-describedby', help.id);
    trigger().setAttribute('aria-describedby', help.id);
    reveal(help);
    const anchor = hintOption.getBoundingClientRect(), list = menu().getBoundingClientRect();
    const width = help.offsetWidth, height = help.offsetHeight, gap = 8;
    let left, top;
    if (list.right + gap + width <= innerWidth - 12) {
      left = list.right + gap; top = anchor.top;
    } else if (list.left - gap - width >= 12) {
      left = list.left - gap - width; top = anchor.top;
    } else {
      left = Math.max(12, Math.min(list.left, innerWidth - width - 12));
      top = innerHeight - list.bottom - gap >= height ? list.bottom + gap : list.top - height - gap;
    }
    help.style.left = `${left}px`;
    help.style.top = `${Math.max(12, Math.min(top, innerHeight - height - 12))}px`;
  }
  function activate(index, explain = true) {
    activeIndex = Math.max(0, Math.min(modes.length - 1, index));
    options().forEach((option, i) => option.classList.toggle('is-active', i === activeIndex));
    trigger().setAttribute('aria-activedescendant', `reading-hints-option-${activeIndex}`);
    if (explain) showHint(activeIndex);
  }
  function open(nextField, byKeyboard = false) {
    close(); field = nextField; keyboard = byKeyboard;
    activeIndex = modes.findIndex(mode => mode.value === field.querySelector('#reading-mode').value);
    trigger().setAttribute('aria-expanded', 'true');
    reveal(menu()); positionMenu(); activate(activeIndex, byKeyboard);
  }
  function choose(index) {
    const select = field.querySelector('#reading-mode');
    close(); select.value = modes[index].value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
    document.querySelector('#reading-mode-trigger')?.focus({preventScroll: true});
  }
  document.addEventListener('pointerdown', event => {
    // Keep focus on the combobox while a pointer chooses a listbox option.
    if (field && event.target.closest('[data-reading-option]')) event.preventDefault();
  });
  document.addEventListener('click', event => {
    const nextField = fieldFor(event.target);
    if (event.target.closest('.reading-mode-trigger')) {
      if (field === nextField) close(); else open(nextField);
    } else if (field && event.target.closest('[data-reading-option]')) {
      choose(Number(event.target.closest('[data-reading-option]').dataset.readingOption));
    } else if (field && !nextField) close();
  });
  document.addEventListener('pointerover', event => {
    clearTimeout(closeTimer);
    const option = event.target.closest('[data-reading-option]');
    if (field && option && !option.contains(event.relatedTarget)) {
      keyboard = false; activate(Number(option.dataset.readingOption));
    }
  });
  document.addEventListener('pointerout', () => {
    if (!field || keyboard) return;
    clearTimeout(closeTimer);
    // Keep the explanation readable while crossing the gap into the popup.
    closeTimer = setTimeout(() => {
      if (field && !hintOption?.matches(':hover') && !popup()?.matches(':hover')) hideHint();
    }, 150);
  });
  document.addEventListener('keydown', event => {
    if (!event.target.matches('.reading-mode-trigger') || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (key === 'Escape') { if (field) { event.preventDefault(); close(); } return; }
    if (key === 'Tab') { close(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key) && !/^[a-z]$/i.test(key)) return;
    event.preventDefault();
    const wasOpen = Boolean(field);
    if (!field) open(fieldFor(event.target), true);
    keyboard = true;
    if (['Enter', ' '].includes(key)) { if (wasOpen) choose(activeIndex); }
    else if (key === 'Home') activate(0);
    else if (key === 'End') activate(modes.length - 1);
    else if (key === 'ArrowDown') activate(wasOpen ? activeIndex + 1 : activeIndex);
    else if (key === 'ArrowUp') activate(wasOpen ? activeIndex - 1 : activeIndex);
    else { const index = modes.findIndex(mode => mode.label.toLowerCase().startsWith(key.toLowerCase())); if (index >= 0) activate(index); }
  });
  document.addEventListener('focusout', event => {
    if (field && field.contains(event.target) && !field.contains(event.relatedTarget)) close();
  });
  document.addEventListener('scroll', event => {
    if (field && !field.contains(event.target)) close();
  }, true);
  window.addEventListener('resize', close);
}
