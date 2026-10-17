import {blank,hydrate,mergeStates} from './study.js';
import {episodes} from './course.js';
import {explicitReadings} from './readings.js';
import {registerFamiliarReadings, sharedReading, setReadingFamiliarity} from './word-familiarity.js';
import {mergeFamiliarity} from './shared-familiarity.js';
registerFamiliarReadings([...explicitReadings, ...Object.values(episodes).flatMap(episode => Object.values(episode.packs).flatMap(pack => (pack.phrases || []).map(phrase => [phrase.surface, phrase.reading])))]);

function sharedKnown(course) {
 const collections = [course.known];
 for (const [number, state] of Object.entries(course.episodes)) {
  const lesson = episodes[number];
  collections.push(Object.fromEntries(Object.entries(state.known).map(([key, record]) => {
   // Older font-only marks used the entire line's kana as the word's reading.
   const wasLineReading = lesson.lines.some(line => line.kana === record.reading && line.ja.includes(record.word) && line.ja.replace(/[^\p{L}\p{N}]/gu, '') !== record.word.replace(/[^\p{L}\p{N}]/gu, ''));
   return [key, {...record, reading:wasLineReading ? '' : record.reading}];
  })));
 }
 const records = mergeFamiliarity(...collections);
 course.known = mergeFamiliarity(Object.fromEntries(Object.entries(records).map(([key, record]) => [key, {...record, reading:sharedReading(record.word, record.reading)}])));
 // Previously untouched episodes should honor migrated familiar marks too.
 const latest = Math.max(0, ...Object.values(course.known).filter(record => record.value).map(record => record.updatedAt));
 for (const state of Object.values(course.episodes)) if (latest && state.prefs.readingMode === 'all' && state.prefs.updatedAt < latest) {
  state.prefs.readingMode = 'learning'; state.prefs.updatedAt = latest;
 }
 return course;
}

export function setCourseReadingFamiliarity(course, episode, word, reading, familiar, now = Date.now()) {
 const state = course.episodes[episode];
 setReadingFamiliarity(state, word, reading, familiar, {known:course.known, learningMode:true, now});
 for (const other of Object.values(course.episodes)) if (other !== state && other.prefs.readingMode === 'all') {
  other.prefs.readingMode = 'learning'; other.prefs.updatedAt = Math.max(now, other.prefs.updatedAt + 1);
 }
 course.updatedAt = Math.max(course.updatedAt, now);
}
const stamp=n=>Number.isFinite(n)&&n>=0?Math.min(n,Date.now()+86400000):0;
export const isReadingView=value=>value==='whole'||value==='read';
export function entryReadingView(course,hash=''){return isReadingView(hash.slice(1))?hash.slice(1):course.readingView;}
export function rememberReadingView(course,view,now=Date.now()){
 if(!isReadingView(view))return false;
 course.readingView=view;course.readingViewAt=now;course.updatedAt=Math.max(course.updatedAt,now);return true;
}
export function blankCourse(){return {version:3,activeEpisode:1,activeAt:0,readingView:'whole',readingViewAt:0,updatedAt:0,known:{},episodes:Object.fromEntries(Object.keys(episodes).map(n=>[n,blank()]))};}
export function hydrateCourse(input){
 let data;try{data=typeof input==='string'?JSON.parse(input):input;}catch{return blankCourse();}
 const course=blankCourse();
 if([1,2].includes(data?.version)){course.activeEpisode=2;course.episodes[2]=hydrate(data,episodes[2].lines);course.episodes[2].positionAt ||= course.episodes[2].updatedAt||1;course.updatedAt=course.episodes[2].updatedAt;course.activeAt=course.episodes[2].positionAt||course.updatedAt||1;return sharedKnown(course);}
 if(data?.version!==3)return course;
 course.activeEpisode=Number.isInteger(data.activeEpisode)&&Object.hasOwn(episodes,data.activeEpisode)?data.activeEpisode:1;
 course.activeAt=stamp(data.activeAt);course.updatedAt=stamp(data.updatedAt);
 if(isReadingView(data.readingView)){course.readingView=data.readingView;course.readingViewAt=stamp(data.readingViewAt);}
 for(const n of Object.keys(episodes))course.episodes[n]=hydrate(data.episodes?.[n],episodes[n].lines);
 course.known = mergeFamiliarity(data.known);
 return sharedKnown(course);
}
export function mergeCourses(local,remote){
 const a=hydrateCourse(local),b=hydrateCourse(remote);
 for(const n of Object.keys(episodes))a.episodes[n]=mergeStates(a.episodes[n],b.episodes[n],episodes[n].lines);
 a.known = mergeFamiliarity(a.known,b.known);
 if(b.activeAt>a.activeAt){a.activeEpisode=b.activeEpisode;a.activeAt=b.activeAt;}
 if(b.readingViewAt>a.readingViewAt){a.readingView=b.readingView;a.readingViewAt=b.readingViewAt;}
 a.updatedAt=Math.max(a.updatedAt,b.updatedAt);
 return sharedKnown(a);
}
