import {episodes} from './course.js';
import {normalizeWord, normalizeReading} from './shared-familiarity.js';
import {dictionaryMeanings} from './word-meanings-data.js';

// Conservative base forms, used only if a matching dictionary verb/adjective exists.
export function meaningForms(word) {
  const forms = [];
  const add = (ending, replacements, kind) => {
    if (word.length > ending.length && word.endsWith(ending)) for (const replacement of replacements) forms.push({word:word.slice(0,-ending.length)+replacement, kind, negative:/ない|なくて|ません/.test(ending)});
  };
  for (const ending of ['ました','ません','ます','たい','たくて','なくて','ない','れば','られる','られた','られて']) add(ending,['る'],'verb');
  for (const ending of ['って','った','ったり']) add(ending,['う','つ','る'],'verb');
  for (const ending of ['んで','んだ']) add(ending,['む','ぶ','ぬ'],'verb');
  for (const ending of ['いて','いた']) add(ending,['く'],'verb');
  for (const ending of ['いで','いだ']) add(ending,['ぐ'],'verb');
  for (const ending of ['して','した']) add(ending,['す'],'verb');
  for (const ending of ['て','た','てる']) add(ending,['る'],'verb');
  for (const ending of ['くて','かった','くない','く']) add(ending,['い'],'adjective');
  for (const [stem,end] of [['い','う'],['き','く'],['ぎ','ぐ'],['し','す'],['ち','つ'],['に','ぬ'],['び','ぶ'],['み','む'],['り','る']]) {
    for (const ending of ['ます','ました','ません','たい']) add(stem+ending,[end],'verb');
  }
  return forms.filter(form => /[一-龯]/.test(form.word));
}

// Context-specific names and grammatical fragments need more than a dictionary homophone.
const lessonMeanings = {
  '三軒茶屋':'Sangenjaya, a neighborhood in Tokyo', '三茶':'Sancha, short for Sangenjaya', '三宿':'Mishuku, a neighborhood in Tokyo',
  '三角地帯':'the Triangle District in Sangenjaya', '赤鬼':'Akaoni, a sake restaurant; literally “red ogre”', '床島':'Tokoshima, a yakitori restaurant',
  '六本木':'Roppongi, a district in Tokyo', '下北沢':'Shimokitazawa, a neighborhood in Tokyo', '恵比寿':'Ebisu, a district in Tokyo; also the name of a deity',
  '表参道':'Omotesando, a district and avenue in Tokyo; also a shrine’s main approach',
  '綾':'Aya (a character’s name)', '直樹':'Naoki (a character’s name)', '有希':'Yuki (a character’s name)', '涼子':'Ryoko (a character’s name)',
  '私':'I; me', '人':'person; people', '仕事':'work; job', '夕|せき':'Seki (a restaurant’s name)',
  '駅':'train station', '下げない':'do not lower; do not reduce', '強くない':'not strong; here, not able to handle much alcohol',
  'の':'of; possession; also turns a clause into a noun', 'に':'to; at; in; marks a target, time, or location',
  'は':'marks the topic (“as for …”)', 'が':'marks the subject; also “but” between clauses', 'を':'marks the object of an action',
  'で':'at; by; with; marks where or how an action happens', 'と':'and; with; also marks a quotation', 'も':'also; too; even',
  'よ':'adds emphasis or presents information to the listener', 'ね':'seeks agreement or shared understanding', 'よね':'seeks confirmation (“right?”)',
  'か':'marks a question or an alternative (“or”)', 'な':'links a な-adjective; also a sentence-ending particle',
  'だ':'is; am; are (plain form)', 'です':'is; am; are (polite form)', 'ます':'polite verb ending', 'た':'past/completed-action ending',
  'て':'links actions or forms requests; verb ending', 'って':'casual quotation or topic marker', 'ん':'often short for explanatory の; meaning depends on the sentence',
  'っ':'small っ: part of a word or ending; no independent English meaning', 'ー':'lengthens a vowel; no independent English meaning',
  'られる':'can; be …ed; or respectful verb ending, depending on the verb', 'れる':'passive/potential verb ending; meaning depends on the verb',
  'れ':'part of a verb ending; no fixed meaning on its own', 'し':'often part of する (“do”); also links reasons', 'まし':'part of a polite verb ending',
  'い':'often part of いる (“be; exist”) or another verb; no fixed meaning on its own',
  'き':'often a form of 来る (“come”) or part of another verb', 'り':'part of a verb or ending; no fixed meaning on its own',
  'る':'part of a verb ending; no fixed meaning on its own', 'く':'often part of a verb or adjective ending',
  'す':'part of a verb or polite ending; no fixed meaning on its own', 'せ':'often part of a verb or causative ending (“make; let”)',
  'ま':'often a shortened まあ (“well …”) or part of a longer word', 'ら':'plural suffix or part of a verb ending',
  'や':'and … among others; also a sentence-ending particle', 'へ':'to; toward (direction)', 'さ':'casual emphasis; also forms nouns describing a quality',
  'あ':'ah; oh', 'え':'huh?; oh; an expression of surprise or hesitation', 'から':'from; since; because', 'まで':'until; as far as',
  'お':'polite or respectful prefix', 'ご':'polite or respectful prefix',
  'てる':'casual form of ている: be doing; be in a resulting state', 'じゃ':'casual form of では; often used before a negative',
  'なりたい':'want to become', '会います':'meet; see someone (polite)', '行ったり':'go, among other activities',
  '似てる':'look alike; resemble', '減って':'decreasing; becoming less (from 減る)', '聞こえません':'cannot hear; is not audible (polite)',
};
const reviewed = new Map(), contexts = [];
function add(word, reading, meaning) {
  if (!word || !meaning) return;
  const key = normalizeWord(word), entries = reviewed.get(key) || [];
  if (!entries.some(entry => entry.reading === normalizeReading(reading) && entry.meaning === meaning)) entries.push({reading:normalizeReading(reading), meaning});
  reviewed.set(key, entries);
}
for (const episode of Object.values(episodes)) {
  for (const line of episode.lines) { add(line.term, line.reading, line.meaning); contexts.push(line); }
  for (const pack of Object.values(episode.packs)) for (const phrase of pack.phrases || []) add(phrase.surface, phrase.reading, phrase.meaning);
}
const matchesReading = (entry, reading) => !reading || !entry.reading || normalizeReading(entry.reading) === reading;
function dictionary(word, reading = '', kind = '') {
  const entries = (Object.hasOwn(dictionaryMeanings, word) ? dictionaryMeanings[word] : []).filter(entry => matchesReading(entry, reading) && (!kind || entry.pos.some(pos => pos.includes(kind))));
  return entries[0];
}

export function wordMeaning(word, reading = '', expressions = []) {
  word = normalizeWord(word); reading = normalizeReading(reading);
  const personal = expressions.filter(entry => !entry.deleted && normalizeWord(entry.term) === word && entry.meaning?.trim() && matchesReading(entry, reading)).sort((a,b) => b.updatedAt-a.updatedAt)[0];
  if (personal) return {text:personal.meaning, label:personal.provenance === 'lesson' ? 'Lesson meaning' : 'Your meaning', added:personal.provenance === 'lesson'};
  const reviewedEntries = (reviewed.get(word) || []).filter(entry => matchesReading(entry, reading));
  if (reviewedEntries.length) return {text:[...new Set(reviewedEntries.map(entry => entry.meaning))].slice(0,2).join(' / '), label:'Lesson meaning', added:true};
  const key = Object.hasOwn(lessonMeanings, `${word}|${reading}`) ? `${word}|${reading}` : word;
  const meaning = Object.hasOwn(lessonMeanings, key) ? lessonMeanings[key] : null;
  if (meaning) return {text:meaning, label:'Study meaning', added:true};
  const exact = dictionary(word, reading);
  if (exact) return {text:exact.meanings.slice(0,2).join(' / '), label:'Dictionary meaning', added:true};
  const bases = meaningForms(word).map(form => ({...form, entry:dictionary(form.word, '', form.kind)})).filter(form => form.entry);
  const unique = [...new Map(bases.map(base => [base.word,base])).values()];
  if (unique.length === 1) return {text:unique[0].entry.meanings[0], label:`${unique[0].negative ? 'Negative form' : 'Form'} of ${unique[0].word} · base meaning`, added:true};
  // A fragment or name may lack a reliable stand-alone gloss. Show real sentence
  // context rather than attach a meaning from an unrelated homophone.
  const context = contexts.find(line => line.ja.includes(word));
  if (context) return {text:context.en, label:'Sentence meaning · this item is part of the Japanese line', japanese:context.ja, added:true};
  return {text:'No verified English meaning available for this item.', label:'Meaning not yet available', added:false};
}
