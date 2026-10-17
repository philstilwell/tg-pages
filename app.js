import {installReadingHintsHelp} from './reading-hints.js';
import {lines,parts,scene,selectLesson} from './lesson-data.js';
import {episodes} from './course.js';
import {hydrateCourse,mergeCourses,entryReadingView,rememberReadingView,isReadingView,setCourseReadingFamiliarity} from './course-state.js';
import {queue,EDITION} from './study.js';
import {createStudio} from './studio.js';
import {cloudSync} from './sync.js';
import {createFamiliarWords} from './familiar-words.js';
import {cloudSaving} from './storage-mode.js';
import {MAIN_SITE_URL,previousSiteNotice} from './site-home.js';
import {createEpisodeView} from './episode-view.js';
import {reachLine,markLineStudied} from './episode-view-state.js';
import {resetStudyProgress,undoStudyReset} from './progress-state.js';
const KEY='tokyo-girl-study-v1';
if(cloudSaving)document.title='Tokyo Girl — Previous version';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let raw,storageOK=true;try{raw=localStorage.getItem(KEY);}catch{storageOK=false;}
let course=hydrateCourse(raw);selectLesson(course.activeEpisode);
const explicitView=isReadingView(location.hash.slice(1));
if ('scrollRestoration' in history) history.scrollRestoration='manual';
let state=course.episodes[scene.episode],interacted=false,view=entryReadingView(course,location.hash),english=false,kana=false,notes=false,syncStatus=cloudSaving?'Saved on this device':'Progress stays in this browser';
const icons={read:'▤',practice:'✎',review:'↻',library:'◇',familiar:'✓',find:'⌕',notebook:'▧',progress:'◴',about:'ⓘ'};
let toastTimer,toastVersion=0,lastProgressReset=null,pendingProgressReset=null;
function toast(message,action){
 const box=$('#toast'),version=++toastVersion,returnFocus=document.activeElement;
 clearTimeout(toastTimer);box.replaceChildren();
 const text=document.createElement('span');text.textContent=message;box.append(text);
 const dismiss=()=>{
  if(version!==toastVersion)return;
  if(box.contains(document.activeElement)&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  clearTimeout(toastTimer);box.classList.remove('visible');box.replaceChildren();
 };
 if(action){
  const undo=document.createElement('button');undo.type='button';undo.className='toast-action';undo.textContent=action.label;
  undo.setAttribute('aria-label',action.description||action.label);
  undo.addEventListener('click',event=>{event.stopPropagation();dismiss();action.run();});
  const close=document.createElement('button');close.type='button';close.className='toast-dismiss';close.textContent='×';close.setAttribute('aria-label','Dismiss notification');
  close.addEventListener('click',event=>{event.stopPropagation();dismiss();});box.append(undo,close);
 }else toastTimer=setTimeout(dismiss,4000);
 box.classList.add('visible');
 return dismiss;
}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(course));storageOK=true;}catch{storageOK=false;toast('Browser storage is unavailable. Export a backup before leaving.');}}
function save(){interacted=true;state.updatedAt=Date.now();course.episodes[scene.episode]=state;course.updatedAt=state.updatedAt;persist();sync.changed();}
function due(){return queue(state);}
function saved(line){return Object.values(state.expressions).some(e=>!e.deleted&&e.contexts.includes(line.id));}
const familiarContext={known:()=>course.known,setFamiliar:(word,reading,familiar)=>setCourseReadingFamiliarity(course,scene.episode,word,reading,familiar)};
const familiarList=createFamiliarWords({...familiarContext,save,render,toast});
const studio=createStudio({state:()=>state,...familiarContext,save,render,toast,navigate,jump,amended,cloudSaving,sync:()=>sync.now(),syncStatus:()=>syncStatus,export:exportProgress,courseProgress,progressControls});
const whole=createEpisodeView({state:()=>state,...familiarContext,interact:()=>{interacted=true;},save,render,toast,amended,studio,continueAt:id=>{if(reachLine(state,lines,id))jump(lines.findIndex(line=>line.id===id));}});
const sync=cloudSync({enabled:cloudSaving,getState:()=>{whole.flush();return course;},merge:mergeCourses,applyState:remote=>{
 const changed=JSON.stringify(course)!==JSON.stringify(remote);const selected=scene.episode;course=remote;
 if(!interacted&&course.activeEpisode!==selected){studio.reset();whole.reset();selectLesson(course.activeEpisode);english=kana=notes=false;}
 if(!interacted&&!explicitView)view=course.readingView;
 state=course.episodes[scene.episode];persist();if(changed&&!document.activeElement?.matches('input,textarea,select')&&!studio.recording)render();
},status:message=>{syncStatus=message;document.querySelectorAll('[data-sync-status],#sync-detail').forEach(el=>el.textContent=message);}});
function episodeChooser(compact=false){return `<div class="episode-chooser"><label for="episode-picker"><span>${compact?'Episode':'Choose your episode'}</span><select id="episode-picker">${Object.keys(episodes).map(n=>`<option value="${n}" ${Number(n)===scene.episode?'selected':''}>Episode ${n}${compact?'':` · ${course.episodes[n].read.length}/${episodes[n].lines.length} studied`}</option>`).join('')}</select></label><p>Match the episode you’re watching. Each transcript stays in order and saves your place.</p></div>`;}
function courseProgress(){return `<section class="tool-card"><h3>Your course</h3><p>Study all eleven episodes in story order. Each episode keeps its own progress and reviews.</p><div class="course-progress">${Object.entries(episodes).map(([n,e])=>`<button class="outline-button" data-episode="${n}" ${Number(n)===scene.episode?'aria-current="true"':''}><strong>Episode ${n}</strong><span>${course.episodes[n].read.length} / ${e.lines.length} studied · ${queue(course.episodes[n]).length} reviews due</span></button>`).join('')}</div></section>`;}
function progressControls(){return `<section class="tool-card progress-reset-controls"><h2>Reset reading progress</h2><p>Start an episode again, or reset one study part below. This clears studied marks and returns you to the start. Your notes, expressions, review schedules, and practice history stay saved.</p><div class="button-row"><button class="outline-button" data-action="request-reset" data-reset-scope="episode">Reset Episode ${scene.episode} progress</button><button class="subtle-button" data-action="request-reset" data-reset-scope="course">Reset all course progress</button></div>${lastProgressReset?`<div class="reset-notice" role="status"><span>${esc(lastProgressReset.label)} reset.</span><button class="outline-button" data-action="undo-reset">Undo reset</button></div>`:''}</section>`;}
function requestProgressReset(scope,partNumber){
 if(document.querySelector('#progress-reset-dialog'))return;
 const part=scope==='part'?parts.find(p=>p.number===partNumber):null;
 if(scope==='part'&&!part||!['course','episode','part'].includes(scope))return;
 const targets=scope==='course'?Object.keys(episodes).map(n=>({episode:Number(n),start:1,end:episodes[n].lines.length})):[{episode:scene.episode,start:part?.start||1,end:part?.end||lines.length}];
 const label=scope==='course'?'All course progress':part?`Episode ${scene.episode}, Part ${part.number}`:`Episode ${scene.episode} progress`;
 const count=targets.reduce((total,t)=>total+course.episodes[t.episode].read.filter(id=>episodes[t.episode].lines.slice(t.start-1,t.end).some(l=>l.id===id)).length,0);
 pendingProgressReset={targets,label,scope};
 const dialog=document.createElement('dialog');dialog.id='progress-reset-dialog';dialog.className='progress-reset-dialog';dialog.setAttribute('aria-labelledby','reset-title');dialog.setAttribute('aria-describedby','reset-description');
 dialog.innerHTML=`<h2 id="reset-title">Reset ${esc(label.toLowerCase())}?</h2><p id="reset-description">${count} studied ${count===1?'mark':'marks'} will be cleared${part?` for lines ${part.start}–${part.end}`:''}. Reading will restart at ${scope==='course'?'Episode 1, line 1':`line ${part?.start||1}`}.</p><p>Notes, saved expressions, review schedules, and practice history stay intact. You can undo this reset.</p><div class="button-row"><button class="outline-button" data-action="cancel-reset" autofocus>Cancel</button><button class="reset-confirm" data-action="confirm-reset">Reset progress</button></div>`;
 dialog.addEventListener('close',()=>{pendingProgressReset=null;dialog.remove();});document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-action="cancel-reset"]').focus();
}
function confirmProgressReset(){
 const request=pendingProgressReset;if(!request)return;
 whole.reset();studio.reset();const now=Date.now(),activeEpisode=course.activeEpisode;
 const snapshots=request.targets.map(t=>({...t,snapshot:resetStudyProgress(course.episodes[t.episode],episodes[t.episode].lines,{start:t.start,end:t.end,now})}));
 if(request.scope==='course'){course.activeEpisode=1;course.activeAt=Math.max(now,course.activeAt+1);}
 lastProgressReset={label:request.label,snapshots,activeEpisode,activeAt:course.activeAt,resetCourse:request.scope==='course'};
 document.querySelector('#progress-reset-dialog')?.close();selectLesson(course.activeEpisode);state=course.episodes[scene.episode];english=kana=notes=false;save();render();
 document.querySelector('[data-action="undo-reset"]')?.focus({preventScroll:true});toast(`${request.label} reset. Undo is available in My progress.`);
}
function undoProgressReset(){
 if(!lastProgressReset)return;whole.reset();studio.reset();const reset=lastProgressReset,now=Date.now();
 for(const t of reset.snapshots)undoStudyReset(course.episodes[t.episode],episodes[t.episode].lines,t.snapshot,now);
 if(reset.resetCourse&&course.activeAt===reset.activeAt){course.activeEpisode=reset.activeEpisode;course.activeAt=Math.max(now,course.activeAt+1);}
 lastProgressReset=null;selectLesson(course.activeEpisode);state=course.episodes[scene.episode];save();render();document.querySelector('[data-reset-scope="episode"]')?.focus({preventScroll:true});toast('Reading progress restored.');
}

function changeEpisode(number){if(!episodes[number]||number===scene.episode)return;studio.reset();whole.reset();course.activeEpisode=number;course.activeAt=Date.now();selectLesson(number);state=course.episodes[number];english=kana=notes=false;save();navigate(course.readingView);}

function viewChooser(){return `<section class="view-chooser" aria-labelledby="view-label"><div><span class="eyebrow" id="view-label">VIEW</span><p>Your view, episode, and reading place are remembered.</p></div><div class="view-options" role="group" aria-label="Reading view"><button data-view="read" aria-pressed="${view==='read'}"><span aria-hidden="true">▤</span><span><strong>Guided reader</strong><small>One line at a time, with study activities</small></span></button><button data-view="whole" aria-pressed="${view==='whole'}"><span aria-hidden="true">☷</span><span><strong>Whole episode</strong><small>All dialogue on one page · hover or click for help</small></span></button></div></section>`;}

function amended(original,edited){
  if(original===edited)return esc(edited);
  const a=original.split(/(\s+)/),b=edited.split(/(\s+)/);
  const grid=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)grid[i][j]=a[i]===b[j]?1+grid[i+1][j+1]:Math.max(grid[i+1][j],grid[i][j+1]);
  let i=0,j=0,out='';while(j<b.length){if(i<a.length&&a[i]===b[j]){out+=esc(b[j]);i++;j++;}else if(i<a.length&&grid[i+1][j]>=grid[i][j+1])i++;else{out+=`<span class="added">${esc(b[j++])}</span>`;}}
  return out;
}
function sidebar(){const n=due().length;return `<aside class="sidebar"><a class="brand" ${cloudSaving?'':'data-view="resume"'} href="${cloudSaving?MAIN_SITE_URL:'#'+course.readingView}" aria-label="Tokyo Girl home"><span class="brand-mark" lang="ja">東</span><span>Tokyo Girl<small>JAPANESE IN CONTEXT</small></span></a><div class="sidebar-rule"></div><span class="side-caption">YOUR STUDY SPACE</span><nav aria-label="Main navigation">${[['read','Read the episode'],['practice','Practice'],['review','Review'],['library','My expressions'],['familiar','Familiar words'],['find','Find examples'],['notebook','My notebook'],['progress','My progress'],['about','About this lesson']].map(([id,label])=>`<button class="nav-item ${view===id||(id==='read'&&view==='whole')?'active':''}" data-view="${id==='read'?'resume':id}" ${view===id||(id==='read'&&view==='whole')?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icons[id]}</span>${label}${id==='review'?`<span class="count" aria-label="${n} reviews due">${n}</span>`:''}</button>`).join('')}</nav><div class="course-card"><span class="side-caption">THE STORY SO FAR</span><div class="episode-mark"><span>${String(scene.episode).padStart(2,'0')}</span><div>Episode ${scene.episode}<small>${esc(scene.place)}</small></div></div><div class="progress-track"><span style="width:${state.read.length/lines.length*100}%"></span></div><p>${state.read.length} of ${lines.length} lines studied</p><small>One conversation at a time.<br>Always in story order.</small></div><div class="sidebar-bottom"><span class="live-dot"></span><span data-sync-status>${esc(syncStatus)}</span><button class="text-on-dark" data-action="export">Export progress ↗</button></div></aside>`;}
function shell(){return `${sidebar()}<main id="main" tabindex="-1"><header class="topbar"><span>THE TOKYO GIRL STUDY COMPANION</span><div class="topbar-right"><span class="prototype-badge">EPISODE ${String(scene.episode).padStart(2,'0')} · ${lines.length} LINES</span><button class="small-link" data-view="about">How it works <span aria-hidden="true">↗</span></button></div></header>${previousSiteNotice(cloudSaving)}${!storageOK?'<div class="storage-warning" role="alert">Your browser cannot save progress. Use Export progress before closing this page.</div>':''}<div class="page ${view==='read'?'page--read':view==='whole'?'page--whole':''}">${isReadingView(view)?`<div class="reading-switcher ${view==='read'?'guided-switcher':''}">${viewChooser()}${episodeChooser(true)}</div>`:view==='familiar'?'':viewChooser()+episodeChooser()}${view==='read'?reader():view==='whole'?whole.render():view==='familiar'?familiarList.render():studio[view]?.()||studio.about()}</div><footer><span>Read a little. Notice more. Remember it.</span><a href="${MAIN_SITE_URL}">Tokyo Girl · main study site ↗</a></footer></main>`;}
function reader(){const l=lines[state.current];const part=parts[l.part-1];const explanations=l.explanations||[];const jp=text=>studio.japanese(text);const prev=state.current>0?lines[state.current-1]:null;return `
  <div class="guided-intro"><header><span class="eyebrow">STUDY PART ${String(part.number).padStart(2,'0')} OF ${parts.length}</span><h1>${esc(part.title)}<span class="coral">.</span></h1><p>${esc(part.description)}</p></header>${studio.toolbar()}</div>
    <div class="section-bar"><h2>The conversation</h2><span class="font-control">${state.prefs.readingMode==='request'?'Hints on request':'Furifont'} <span class="font-status" id="font-status"></span></span></div>
    <div class="reader-dock"><nav class="reader-navigation" aria-label="Dialogue navigation"><button class="outline-button" data-action="previous" ${state.current===0?'disabled':''}>← Previous</button><span>${state.read.includes(l.id)?'✓ Studied':'Read, then continue'}</span><button class="primary-button" data-action="next">${state.current===lines.length-1?'Finish episode ✓':'Next line →'}</button></nav>
    <section class="pinned-dialogue" aria-label="Current dialogue" hidden>
      <div class="pinned-dialogue-header"><div class="pinned-line-label">LINE ${String(l.number).padStart(2,'0')} · ${esc(l.speaker)}<span class="pinned-language-label"></span></div><button class="reveal-button ${english?'selected':''}" data-action="english" aria-expanded="${english}" aria-controls="pinned-translation">${englishButtonLabel()} <span aria-hidden="true">${english?'−':'+'}</span></button></div>
      <div class="pinned-dialogue-body">
        <div class="pinned-dialogue-scroll" role="region" aria-label="Current dialogue text" tabindex="0"><p class="pinned-japanese" lang="ja"></p></div>
        <div id="pinned-translation" class="translation pinned-translation" lang="en" role="region" aria-label="Current English translation" tabindex="0" ${english?'':'hidden'}></div>
      </div>
      <span class="pinned-scroll-hint" hidden>Scroll within this panel to read the full text.</span>
    </section></div>
    <div class="workspace-grid"><section class="reader-column" aria-label="Sequential reader">
    ${prev?`<div class="previous-context"><span>PREVIOUS LINE · ${String(state.current).padStart(2,'0')}</span><p lang="${prev.sourceLanguage==='en'?'en':'ja'}">${esc(prev.spokenEn||prev.ja)}</p></div>`:'<div class="previous-context opening-context"><span>THE SCENE OPENS</span><p>The episode begins here. Read each entry in transcript order.</p></div>'}
    <article class="dialogue-card ${state.prefs.readingMode!=='request'?'use-furifont':''}" aria-labelledby="line-label"><div class="line-meta"><span class="speaker-dot speaker-${l.speaker==='Speaker 2'?'b':'a'}"></span><span id="line-label">${esc(l.speaker)}</span><span class="line-number">LINE ${String(l.number).padStart(2,'0')} <span>/ ${lines.length}</span></span></div>
      <div>${l.sourceLanguage==='en'?`<p class="mini-label">SPOKEN IN ENGLISH</p><p class="spoken-english" lang="en">${esc(l.spokenEn)}</p><details class="english-passage"><summary class="added">Japanese study translation & reading</summary><p class="added">This is a study translation of English dialogue.</p>`:''}<p class="japanese ${l.ja.length>75?'long':''}" lang="ja">${l.jaAddition?jp(l.ja.slice(0,-l.jaAddition.length))+`<span class="added">${jp(l.jaAddition)}</span>`:l.ja!==l.originalJa?`<span class="added">${jp(l.ja)}</span>`:jp(l.ja)}</p>
      ${l.sourceLanguage==='en'?`</details><p class="added">${esc(l.tip)}</p>`:''}${l.ja!==l.originalJa?`<details class="original-wording"><summary class="added">${l.sourceLanguage==='en'?'Compare the original English and Yoshiko’s Japanese':l.jaAddition?'Blue ending supplied from the kana':'Blue Japanese supplied or corrected'}${l.sourceLanguage==='en'?'':' · compare original Japanese'}</summary><p lang="ja">${esc(l.originalJa||'No original Japanese wording is available for this line.')}</p>${l.sourceLanguage==='en'?`<p lang="ja">${esc(l.originalEn)}</p>`:''}</details>`:''}
      ${explanations.length?`<button class="idiom-chip" data-action="notes" aria-expanded="${notes}"><span aria-hidden="true">✧</span> ${explanations.length>1?explanations.length+' expressions explained':esc(explanations[0].type)+' in this line'} <span aria-hidden="true">↗</span></button>`:''}
      <div class="reading-controls"><button class="reveal-button ${english?'selected':''}" data-action="english" aria-expanded="${english}" aria-controls="translation">${l.sourceLanguage==='en'?(english?'Hide edited English':'English study wording'):(english?'Hide English':'Reveal English')} <span aria-hidden="true">${english?'−':'+'}</span></button>${state.prefs.readingMode==='request'?`<button class="subtle-button" data-action="kana" aria-expanded="${kana}" aria-controls="kana">${kana?'Hide reading':'Kana reading'}</button>`:''}</div>
      <div id="kana" ${kana?'':'hidden'} class="kana-reading added"><span class="mini-label">READING · FORMATTED FOR STUDY</span><p lang="ja">${esc(l.kana)}</p></div>
      <div id="translation" ${english?'':'hidden'} class="translation"><span class="mini-label">${l.sourceLanguage==='en'?'ENGLISH STUDY WORDING':l.originalEn?'YOSHIKO’S TRANSLATION':'EDITORIAL TRANSLATION'} ${l.en!==l.originalEn?'<span class="edit-label">BLUE = EDITED</span>':''}</span>${l.uncertain?'<p class="added uncertainty-label">CONTEXT UNCERTAIN · SEE STUDY NOTE</p>':''}<p>${amended(l.originalEn,l.en)}</p>${l.en!==l.originalEn?`<details class="original-wording"><summary>Compare original wording</summary><p>${esc(l.originalEn||'No separate English translation for this line; the meaning is grouped with nearby dialogue.')}</p></details>`:''}</div>
      <div class="card-bottom"><button class="save-button ${saved(l)?'saved':''}" data-action="save-line">${saved(l)?'✓ Saved for review':'+ Save for review'}</button><span>${l.term?'Expression':'This line'} · ${/[一-龯々]/.test(l.ja)?'meaning & reading':'meaning'}</span></div>
      </div>
    </article>

    ${state.completed?`<div class="completion-banner"><div><strong>You’ve reached the end of Episode ${scene.episode}.</strong><p>All ${lines.length} lines studied. Review what you saved, or reread with less help.</p></div><button class="outline-button" data-view="review">Go to review ↗</button>${episodes[scene.episode+1]?`<button class="primary-button" data-episode="${scene.episode+1}">Episode ${scene.episode+1} →</button>`:''}</div>`:''}
    ${studio.lineTools(l)}<details class="transcript-outline"><summary>Your place in the conversation <span>${state.current+1} / ${lines.length}</span></summary><p class="muted">Only dialogue you’ve reached is shown. Continue with Next line to reveal the rest.</p><ol>${lines.slice(0,state.furthest+1).map((item,i)=>`<li><button data-jump="${i}" ${i===state.current?'aria-current="step"':''}><span>${String(i+1).padStart(2,'0')}</span><span lang="${item.sourceLanguage==='en'?'en':'ja'}">${item.sourceLanguage==='en'?'English: ':''}${esc(item.spokenEn||item.ja)}</span>${state.read.includes(item.id)?'<span aria-label="Studied">✓</span>':''}</button></li>`).join('')}</ol></details>
  </section><aside class="notes-column" aria-label="Notes and study help">
    <div class="notes-card"><div class="note-icon" aria-hidden="true">✎</div><span class="eyebrow">A LITTLE MORE CONTEXT</span><h2>Behind the words</h2><p>Understand what the speaker means, not just what each word says.</p><button class="notes-toggle" data-action="notes" aria-expanded="${notes}" aria-controls="note-content">${notes?'Close notes':'Open notes & explanations'} <span>${notes?'−':'+'}</span></button>
      <div id="note-content" ${notes?'':'hidden'}><div class="note-section"><h3>${l.originalNote||!l.note?'Yoshiko’s note':'Editorial note'} ${l.note&&l.note!==l.originalNote?'<span class="edit-label">EDITED</span>':''}</h3>${l.note?`<p class="preserve-lines">${amended(l.originalNote,l.note)}</p>${l.note!==l.originalNote?`<details class="original-wording"><summary>Original note</summary><p>${esc(l.originalNote)}</p></details>`:''}`:'<p class="muted">No original note for this line.</p>'}</div>
      ${explanations.map(e=>`<div class="note-section added"><span class="addition-label">ADDED · ${esc(e.type.toUpperCase())}</span><h3 lang="ja">${esc(e.phrase)}</h3><p><strong>Meaning</strong><br>${esc(e.meaning)}</p><p><strong>Literal wording</strong><br>${esc(e.literal)}</p><p><strong>In this scene</strong><br>${esc(e.context)}</p><div class="example"><span class="mini-label">NEW EXAMPLE</span><p lang="ja">${esc(e.example)}</p><p>${esc(e.exampleEn)}</p></div>${e.reference?`<a class="dictionary-link" href="${esc(e.reference)}" target="_blank" rel="noopener">Dictionary reference ↗</a>`:''}</div>`).join('')}
      <div class="note-section added"><span class="addition-label">ADDED · STUDY TIP</span><p>${esc(l.tip||'Try to recall the meaning before revealing the translation. Notice how this reply connects to the previous line.')}</p></div></div>
    </div><div class="color-key"><span class="blue-dot"></span><p><strong>Blue means added or edited.</strong> Yoshiko’s original text stays in dark ink. Edited passages include the original for comparison.</p></div><div class="quiet-note"><span class="eyebrow">MAKE IT YOURS</span><h3>Keep the useful bits.</h3><p>Save a line or expression. Review its meaning and reading after you’ve studied it.</p><button class="small-link" data-view="library">Your expressions <span>↗</span></button></div>
  </aside></div>`;}

function render({focus=false}={}){whole.beforeRender();if(state.prefs.readingMode!=='request')kana=false;$('#app').innerHTML=shell();document.documentElement.style.setProperty('--study-text-scale',state.prefs.textSize);if(focus)$('#main').focus({preventScroll:true});updateFontStatus();studio.restoreAudio();watchPinnedDialogue();if(view==='whole')whole.mount();}
let pinnedObserver, pinnedFrame, pinnedSource;
function updatePinnedDialogue(){
 const bar=$('.reader-navigation'),panel=$('.pinned-dialogue');
 if(!bar||!panel){document.documentElement.style.removeProperty('--reader-offset');return;}
 const japanese=$('.dialogue-card .japanese');
 // English dialogue stays in English until its Japanese study translation is opened.
 const source=japanese?.getClientRects().length?japanese:$('.dialogue-card .spoken-english');
 if(source!==pinnedSource){
  pinnedSource=source;
  const text=$('.pinned-japanese');text.innerHTML=source?.innerHTML||'';
  text.lang=source===japanese?'ja':'en';
  panel.classList.toggle('use-furifont',state.prefs.readingMode!=='request');
  $('.pinned-language-label').textContent=source&&source!==japanese?' · SPOKEN IN ENGLISH':'';
 }
 const visible=source?.getClientRects().length&&source.getBoundingClientRect().top<bar.getBoundingClientRect().bottom-1;
 panel.hidden=!visible;
 if(visible){
  $('.pinned-scroll-hint').hidden=![...panel.querySelectorAll('.pinned-dialogue-scroll,.pinned-translation')].some(el=>!el.hidden&&el.scrollHeight>el.clientHeight+1);
 }
 document.documentElement.style.setProperty('--reader-offset',`${bar.offsetHeight+(visible?panel.offsetHeight:0)+12}px`);
}
function schedulePinnedDialogue(){
 cancelAnimationFrame(pinnedFrame);pinnedFrame=requestAnimationFrame(updatePinnedDialogue);
}
function watchPinnedDialogue(){
 pinnedObserver?.disconnect();pinnedSource=null;
 const translation=$('#pinned-translation');if(translation)translation.innerHTML=$('#translation')?.innerHTML||'';
 updatePinnedDialogue();
 if(typeof ResizeObserver!=='undefined'){
  pinnedObserver=new ResizeObserver(schedulePinnedDialogue);
  ['.reader-navigation','.dialogue-card','.pinned-dialogue'].forEach(selector=>{const el=$(selector);if(el)pinnedObserver.observe(el);});
 }
}
window.addEventListener('scroll',schedulePinnedDialogue,{passive:true});
window.addEventListener('resize',schedulePinnedDialogue);
document.addEventListener('toggle',schedulePinnedDialogue,true);
let fontReady=false,fontFailed=false;
function updateFontStatus(){const el=$('#font-status');if(el)el.textContent=state.prefs.readingMode==='request'?'':fontReady?'on':fontFailed?'unavailable':'loading';}
if(document.fonts)document.fonts.load('24px "Furifont"','三軒茶屋').then(f=>{fontReady=f.length>0;fontFailed=!fontReady;updateFontStatus();}).catch(()=>{fontFailed=true;updateFontStatus();});
function navigate(next){if(next==='resume')next=course.readingView;whole.leave();interacted=true;studio.stop();view=next;if(rememberReadingView(course,next)){save();history.replaceState(null,'',`#${next}`);}render({focus:true});if(view!=='whole')window.scrollTo({top:0,behavior:'instant'});}
function englishButtonLabel(){return lines[state.current].sourceLanguage==='en'?(english?'Hide edited English':'English study wording'):(english?'Hide English':'Reveal English');}
function toggleEnglish(){
 // Keep the notes in place when the main translation above them changes height.
 const anchor=$('.pinned-dialogue')&&!$('.pinned-dialogue').hidden?$('.notes-column'):null;
 const before=anchor?.getBoundingClientRect().top;
 english=!english;if(english)studio.record('hint','english');
 document.querySelectorAll('[data-action="english"]').forEach(button=>{
  button.classList.toggle('selected',english);button.setAttribute('aria-expanded',String(english));
  button.innerHTML=`${englishButtonLabel()} <span aria-hidden="true">${english?'−':'+'}</span>`;
 });
 document.querySelectorAll('#translation,#pinned-translation').forEach(el=>el.hidden=!english);
 if(anchor)window.scrollBy({top:anchor.getBoundingClientRect().top-before,behavior:'instant'});
 updatePinnedDialogue();
}
function renderReaderStep(){
 const before=$('.reader-navigation')?.getBoundingClientRect().top;
 render();const bar=$('.reader-navigation');if(!bar||!Number.isFinite(before))return;
 if(before<=1){
  // From the pinned controls, bring the new line just below the navigation.
  window.scrollTo({top:window.scrollY+$('.workspace-grid').getBoundingClientRect().top-bar.offsetHeight-12,behavior:'instant'});
 }else window.scrollBy({top:bar.getBoundingClientRect().top-before,behavior:'instant'});
}
function jump(index,{keepPosition=false}={}){if(!Number.isInteger(index)||index<0||index>state.furthest)return;studio.reset();state.current=index;state.positionAt=Date.now();english=kana=notes=false;save();if(keepPosition){view='read';renderReaderStep();}else navigate('read');}
function nextLine(){const l=lines[state.current];markLineStudied(state,lines,l.id);if(state.current<lines.length-1){state.current++;state.furthest=Math.max(state.furthest,state.current);}else{state.completed=state.read.length===lines.length;toast(state.completed?'Episode complete. Keep practicing what you saved.':'You reached the last line. Unstudied lines remain available in Whole episode.');}state.positionAt=Date.now();studio.reset();english=kana=notes=false;save();renderReaderStep();}
function exportProgress(){const u=URL.createObjectURL(new Blob([JSON.stringify({app:'tokyo-girl-study',edition:EDITION,exportedAt:new Date().toISOString(),state:course},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='tokyo-girl-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);toast('Full text backup exported. Recordings are downloaded separately.');}
document.addEventListener('click',async event=>{if(whole.click(event))return;const b=event.target.closest('button,[data-view],[data-token]');if(!b||b.disabled)return;if(familiarList.click(b))return;if(await studio.click(b))return;
 if(b.dataset.episode){changeEpisode(Number(b.dataset.episode));return;}if(b.dataset.view){navigate(b.dataset.view);return;}if(b.dataset.jump!==undefined){jump(Number(b.dataset.jump));return;}
 switch(b.dataset.action){case 'request-reset':requestProgressReset(b.dataset.resetScope,Number(b.dataset.resetPart));break;case 'cancel-reset':document.querySelector('#progress-reset-dialog')?.close();break;case 'confirm-reset':confirmProgressReset();break;case 'undo-reset':undoProgressReset();break;case 'english':toggleEnglish();break;case 'kana':kana=!kana;if(kana)studio.record('hint','reading');render();break;case 'notes':notes=!notes;render();break;case 'save-line':studio.saveLine();break;case 'next':nextLine();break;case 'previous':jump(state.current-1,{keepPosition:true});break;case 'export':exportProgress();break;}
});
document.addEventListener('change',async event=>{if(event.target.id==='episode-picker'){changeEpisode(Number(event.target.value));return;}if(whole.change(event.target))return;if(await studio.change(event.target))return;if(event.target.id==='import-progress'){const file=event.target.files[0];if(!file)return;try{if(file.size>10000000)throw Error();const data=JSON.parse(await file.text());if(data.app!=='tokyo-girl-study'||![1,2,3].includes(data.state?.version))throw Error();course=mergeCourses(course,hydrateCourse(data.state));course.activeEpisode=scene.episode;course.activeAt=Date.now();state=course.episodes[scene.episode];save();studio.reset();navigate(course.readingView);toast('Backup merged. Existing progress and notes are retained.');}catch{toast('Choose a valid Tokyo Girl backup smaller than 10 MB.');}}});
document.addEventListener('selectionchange',()=>studio.captureSelection());
document.addEventListener('input',event=>{if(!familiarList.input(event.target))studio.input(event.target);});
document.addEventListener('submit',event=>{event.preventDefault();if(!whole.search(event.target))studio.submit(event.target);});
window.addEventListener('storage',event=>{if(event.key===KEY&&event.newValue){whole.flush();course=mergeCourses(course,hydrateCourse(event.newValue));state=course.episodes[scene.episode];if(!document.activeElement?.matches('input,textarea,select')&&!studio.recording)render();}});
window.addEventListener('online',()=>sync.now());
window.addEventListener('hashchange',()=>{if(['#read','#whole'].includes(location.hash))navigate(location.hash.slice(1));});
window.addEventListener('beforeunload',()=>{whole.flush();studio.stop();});
document.addEventListener('keydown',event=>{if(event.target.matches('[data-token]')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.click();return;}if(!event.altKey||event.ctrlKey||event.metaKey||event.target.matches('input,textarea,select')||view!=='read')return;if(event.key==='ArrowRight'){event.preventDefault();nextLine();}else if(event.key==='ArrowLeft'){event.preventDefault();jump(state.current-1,{keepPosition:true});}else if(event.key.toLowerCase()==='e'){event.preventDefault();toggleEnglish();}});
setInterval(()=>{if(view==='review'&&studio.idleReview()&&!document.activeElement?.matches('input,textarea,select'))render();},15000);
installReadingHintsHelp();
if(explicitView)rememberReadingView(course,view);render();if(explicitView)persist();sync.start();
