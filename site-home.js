export const MAIN_SITE_URL = 'https://philstilwell.github.io/tg-pages/';

export function previousSiteNotice(previousVersion) {
  if (!previousVersion) return '';
  return `<aside class="previous-site-notice" aria-label="Tokyo Girl has moved"><div><strong>Tokyo Girl has moved.</strong> This is the previous version. Your saved progress is still available here.</div><div class="previous-site-actions"><a class="primary-button" href="${MAIN_SITE_URL}">Open the main study site ↗</a><button class="outline-button" data-view="progress">Move my saved progress</button></div></aside>`;
}
