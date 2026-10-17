import {loadState,schedule} from './review.js';
import {setReadingFamiliarity} from './word-familiarity.js';
import {canonicalSource} from './source-info.js';
export const EDITION=canonicalSource.edition;
export const KINDS=['meaning','reading','listening','use'];
const text=(x,n=12000)=>typeof x==='string'?x.slice(0,n):'';
const stamp=x=>Number.isFinite(x)&&x>=0?Math.min(x,Date.now()+86400000):0;
const int=(x,max,f=0)=>Number.isInteger(x)?Math.max(0,Math.min(max,x)):f;
const safeKey=k=>!['__proto__','prototype','constructor'].includes(k);
export function uid(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
export function norm(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/[\s。！？?!、,.「」『』]/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));}
export function blank(){return {version:2,current:0,furthest:0,read:[],readStatus:{},completed:false,positionAt:0,wholePosition:null,updatedAt:0,prefs:{readingMode:'all',listenFirst:false,dailyLimit:20,textSize:1,unstudiedOnly:false,updatedAt:0},expressions:{},cards:{},known:{},notes:{},drafts:{},practice:{},attempts:[],acknowledged:{}};}
export function hydrate(input,lines){
 let s;try{s=typeof input==='string'?JSON.parse(input):input;}catch{return blank();}
 if(!s||![1,2].includes(s.version))return blank();
 if(s.version===1){const old=loadState(JSON.stringify(s),lines.length,lines.map(l=>l.id));const n=blank();Object.assign(n,{current:old.current,furthest:old.furthest,read:old.read,completed:old.completed});n.prefs.readingMode=old.font?'all':'request';
  for(const c of Object.values(old.cards)){const l=lines.find(x=>x.id===c.lineId),id=`legacy-${l.id}`;n.expressions[id]={id,term:l.term||l.ja,reading:l.reading||l.kana,meaning:l.meaning||l.en,contexts:[l.id],lineId:l.id,prompt:'',example:'',provenance:'lesson',edition:'episode-2-transcript-2026-10-16',updatedAt:1};n.cards[c.id]={...c,expressionId:id,updatedAt:c.lastReviewed||c.created||1};}
  n.attempts=old.history.map((h,i)=>({id:`legacy-${h.id}-${h.at}-${i}`,cardId:h.id,lineId:old.cards[h.id]?.lineId,kind:'review',result:h.grade||'',at:h.at,assisted:false})).filter(a=>a.lineId);return n;
 }
 const n=blank(),valid=new Set(lines.map(l=>l.id));n.furthest=int(s.furthest,lines.length-1);n.current=int(s.current,n.furthest);n.positionAt=stamp(s.positionAt);n.updatedAt=stamp(s.updatedAt);
 // Whole episode browsing may reach any line without advancing guided study.
 if(valid.has(s.wholePosition?.lineId))n.wholePosition={lineId:s.wholePosition.lineId,atTop:s.wholePosition.atTop===true,updatedAt:stamp(s.wholePosition.updatedAt)};
 const reached=id=>valid.has(id)&&lines.findIndex(l=>l.id===id)<=n.furthest;
 n.read=[...new Set((Array.isArray(s.read)?s.read:[]).filter(reached))];
 for(const line of lines){const v=s.readStatus?.[line.id];if(!v||typeof v.studied!=='boolean'||(v.studied&&!reached(line.id)))continue;n.readStatus[line.id]={studied:v.studied,updatedAt:stamp(v.updatedAt)};n.read=n.read.filter(id=>id!==line.id);if(v.studied)n.read.push(line.id);}
 n.completed=n.read.length===lines.length;
 const p=s.prefs||{};n.prefs={readingMode:['all','learning','request'].includes(p.readingMode)?p.readingMode:'all',listenFirst:p.listenFirst===true,dailyLimit:int(p.dailyLimit,100,20)||20,textSize:[.9,1,1.15,1.3].includes(p.textSize)?p.textSize:1,unstudiedOnly:p.unstudiedOnly===true,updatedAt:stamp(p.updatedAt)};
 for(const [id,e]of Object.entries(s.expressions||{}).slice(0,2000)){if(!safeKey(id)||!e||!reached(e.lineId))continue;n.expressions[id]={id,lineId:e.lineId,term:text(e.term,2000),reading:text(e.reading,2000),meaning:text(e.meaning,4000),prompt:text(e.prompt,2000),example:text(e.example,4000),contexts:[...new Set([e.lineId,...(Array.isArray(e.contexts)?e.contexts:[]).filter(reached)])],provenance:e.provenance==='lesson'?'lesson':'personal',edition:text(e.edition,100),updatedAt:stamp(e.updatedAt),deleted:e.deleted===true};}
 for(const [id,c]of Object.entries(s.cards||{}).slice(0,8000)){if(!safeKey(id)||!c||!n.expressions[c.expressionId]||!KINDS.includes(c.kind)||!Number.isFinite(c.due))continue;n.cards[id]={id,expressionId:c.expressionId,lineId:n.expressions[c.expressionId].lineId,kind:c.kind,stage:int(c.stage,6),due:c.due,reviews:int(c.reviews,100000),lapses:int(c.lapses,100000),created:stamp(c.created),lastReviewed:stamp(c.lastReviewed),lastGrade:['good','hard','again'].includes(c.lastGrade)?c.lastGrade:undefined,updatedAt:stamp(c.updatedAt),suspended:c.suspended===true};}
 for(const [key,v]of Object.entries(s.known||{}).slice(0,8000))if(safeKey(key)&&v&&typeof v.word==='string')n.known[key]={word:text(v.word,300),reading:text(v.reading,2000),value:v.value===true,updatedAt:stamp(v.updatedAt)};
 for(const [id,v]of Object.entries(s.notes||{}))if(reached(id)&&v)n.notes[id]={text:text(v.text),question:text(v.question),resolved:v.resolved===true,bookmark:text(v.bookmark,20),edition:text(v.edition,200),flag:text(v.flag,4000),flagResolved:v.flagResolved===true,updatedAt:stamp(v.updatedAt)};
 for(const field of ['drafts','practice'])for(const [id,v]of Object.entries(s[field]||{}).slice(0,2500))if(safeKey(id)&&v&&reached(v.lineId))n[field][id]={lineId:v.lineId,text:text(v.text),value:text(v.value,200),updatedAt:stamp(v.updatedAt)};
 n.attempts=(Array.isArray(s.attempts)?s.attempts:[]).filter(a=>a&&reached(a.lineId)&&typeof a.id==='string'&&Number.isFinite(a.at)).slice(-5000).map(a=>({id:a.id,lineId:a.lineId,at:stamp(a.at),kind:text(a.kind,50),result:text(a.result,50),reason:text(a.reason,50),assisted:a.assisted===true,cardId:text(a.cardId,150),exerciseId:text(a.exerciseId,150)}));
 for(const [id,v]of Object.entries(s.acknowledged||{}))if(reached(id)&&v)n.acknowledged[id]={edition:text(v.edition,100),updatedAt:stamp(v.updatedAt)};
 return n;
}
export function mergeStates(a,b,lines){
 a=hydrate(a,lines);b=hydrate(b,lines);const out={...a,furthest:Math.max(a.furthest,b.furthest),read:[...new Set([...a.read,...b.read])],updatedAt:Math.max(a.updatedAt,b.updatedAt)};
 out.readStatus={...a.readStatus};for(const [id,v]of Object.entries(b.readStatus)){const previous=out.readStatus[id];if(!previous||v.updatedAt>previous.updatedAt||(v.updatedAt===previous.updatedAt&&!v.studied))out.readStatus[id]=v;}
 if(b.positionAt>a.positionAt){out.current=b.current;out.positionAt=b.positionAt;}if(b.prefs.updatedAt>a.prefs.updatedAt)out.prefs=b.prefs;
 if(b.wholePosition&&(!a.wholePosition||b.wholePosition.updatedAt>a.wholePosition.updatedAt))out.wholePosition=b.wholePosition;
 for(const field of ['expressions','cards','known','notes','drafts','practice','acknowledged']){out[field]={...a[field]};for(const [key,v]of Object.entries(b[field]))if(!out[field][key]||v.updatedAt>out[field][key].updatedAt)out[field][key]=v;}
 out.attempts=[...new Map([...a.attempts,...b.attempts].map(x=>[x.id,x])).values()].sort((x,y)=>x.at-y.at).slice(-5000);return hydrate(out,lines);
}
export function saveExpression(s,entry,{separate=false}={}){
 const existing=!separate&&Object.values(s.expressions).find(e=>!e.deleted&&norm(e.term)===norm(entry.term)&&norm(e.meaning)===norm(entry.meaning));
 if(existing){existing.contexts=[...new Set([...existing.contexts,entry.lineId])];existing.updatedAt=Date.now();return existing;}
 const id=uid(),e={...entry,id,contexts:[entry.lineId],edition:EDITION,updatedAt:Date.now(),deleted:false};s.expressions[id]=e;return e;
}
export function setSkill(s,e,kind,enabled){let c=Object.values(s.cards).find(x=>x.expressionId===e.id&&x.kind===kind);if(!c&&enabled){c={id:`${e.id}:${kind}`,expressionId:e.id,lineId:e.lineId,kind,stage:0,reviews:0,lapses:0,due:Date.now(),created:Date.now()};s.cards[c.id]=c;}if(c){c.suspended=!enabled;c.updatedAt=Date.now();}}
export function queue(s,now=Date.now(),kind='all'){return Object.values(s.cards).filter(c=>!c.suspended&&!s.expressions[c.expressionId]?.deleted&&s.expressions[c.expressionId]&&c.due<=now&&(kind==='all'||kind===c.kind)).sort((a,b)=>a.lineId.localeCompare(b.lineId,undefined,{numeric:true})||KINDS.indexOf(a.kind)-KINDS.indexOf(b.kind));}
export function localDay(at){const d=new Date(at);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;}
export function reviewedToday(s,now=Date.now()){return s.attempts.filter(a=>a.kind==='review'&&localDay(a.at)===localDay(now)).length;}
export function gradeCard(s,c,grade,reason='',assisted=false,known){const actual=assisted&&grade==='good'?'hard':grade;const now=Date.now();s.cards[c.id]={...schedule(c,actual,now),updatedAt:now};if(c.kind==='reading'&&actual==='again'){const e=s.expressions[c.expressionId];setReadingFamiliarity(s,e.term,e.reading,false,{known,now});}s.attempts.push({id:uid(),lineId:c.lineId,kind:'review',result:actual,reason,assisted,cardId:c.id,at:now});return actual;}
export function checkExact(answer,answers){return answers.some(a=>norm(a)===norm(answer));}
export function searchLines(lines,packs,query,furthest){
 const q=norm(query).replace(/[〜～]/g,'');if(!q)return [];
 const grammar=q==='しまう'?['しまう','しまっ','ちゃう','ちゃっ','ちゃお','じゃう','じゃっ']:[];
 const exactAliases=new Set();for(const l of lines.slice(0,furthest+1))for(const p of packs[l.number]?.phrases||[])if([p.base,...(p.aliases||[])].some(k=>norm(k)===q))exactAliases.add(norm(p.surface));
 return lines.slice(0,furthest+1).filter(l=>[l.ja,l.kana,l.en,l.term,l.meaning,...(packs[l.number]?.phrases||[]).flatMap(p=>[p.surface,p.base,p.reading,p.meaning,...(p.aliases||[])])].filter(Boolean).some(s=>norm(s).includes(q)||[...exactAliases].some(a=>norm(s).includes(a)))||grammar.some(g=>l.ja.includes(g)));
}
export function ankiTSV(entries,lines){const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\r\n]+/g,'<br>').replace(/\t/g,' ');return '#separator:Tab\n#html:true\n#columns:Japanese\tReading\tMeaning\tContext\tSource\tPersonal example\tTags\n'+entries.map(e=>{const l=lines.find(l=>l.id===e.lineId);return [e.term,e.reading,e.meaning,l.ja,`Episode ${l.episode||2} · line ${l.number} · ${e.provenance==='lesson'?'Editorial study entry':'Learner-created entry'}`,e.example,`TokyoGirl::Episode${l.episode||2}`].map(esc).join('\t');}).join('\n');}
