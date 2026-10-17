// Keep compounds intact so browser line wrapping cannot change their font reading.
// Explicit ruby fills missing hints or corrects the place name; blue marks additions.
const words=[
 ['三軒茶屋','さんげんぢゃや'],['少し','すこし'],['飲食店'],['深夜'],['多い'],['彼氏'],['行ったり'],['幸せ'],['私'],['今'],['仕事'],['色々'],['忙しくて','いそがしくて'],['腹'],['減って'],['三茶'],['たこ焼き屋'],['思って'],['餃子','ぎょうざ'],['屋'],['人達','ひとたち'],['粉もの','こなもの'],['好き'],['気'],['手出ない','てでない'],['熱い','あつい'],['会います'],['冗談'],['近所'],['生活'],['似てる'],['酒'],['強い'],['強くない'],
 ['直樹','なおき'],['有希','ゆうき'],['腐れ縁','くされえん'],['閉店'],['聞こえません'],['昼間'],['日本酒','にほんしゅ'],['卵焼き','たまごやき'],['蕎麦','そば'],['大人','おとな'],['夕','せき'],['和食','わしょく'],['栄通り','さかえどおり'],['土井','どい'],['健太郎','けんたろう'],['三角地帯','さんかくちたい'],['赤鬼','あかおに'],['奥座敷','おくざしき'],['品揃え','しなぞろえ'],['半端','はんぱ'],['美味い','うまい'],['床島','とこしま'],['焼き鳥','やきとり'],['若者','わかもの'],['一緒くた','いっしょくた'],['五日','いつか'],['自炊','じすい'],['偉い','えらい'],['西友','せいゆう'],['1人暮らし','ひとりぐらし'],['一人暮らし','ひとりぐらし'],['特売','とくばい'],['食材','しょくざい'],['笑顔','えがお'],['風邪','かぜ'],['眼鏡','めがね'],['誕生日','たんじょうび'],['女子力','じょしりょく'],['人気','にんき'],['期待値','きたいち'],['一生','いっしょう'],['高望み','たかのぞみ'],['上から目線','うえからめせん'],['裏原','うらはら'],['山手線','やまのてせん'],['渋谷','しぶや'],['原宿','はらじゅく'],['内回り','うちまわり'],['外回り','そとまわり'],['一周','いっしゅう'],['不倫','ふりん'],['取引先','とりひきさき'],['手近','てぢか'],['圭介','けいすけ'],['圭祐','けいすけ'],['涼子','りょうこ'],['幕引き','まくひき'],['乾杯','かんぱい'],['自己紹介','じこしょうかい'],['和也','かずや'],['北川','きたがわ'],['斉藤','さいとう'],['綾','あや'],['小川','おがわ'],['手芸','しゅげい'],['席替え','せきがえ'],['お代わり','おかわり'],['大丈夫','だいじょうぶ'],['上司','じょうし'],['原色','げんしょく'],['華やか','はなやか'],['お腹','おなか'],['盛り合わせ','もりあわせ'],['泡','あわ'],['習い事','ならいごと'],['真面目','まじめ'],['人間力','にんげんりょく'],['合コン','ごうこん'],['会議室','かいぎしつ'],['尋常','じんじょう'],['奥さん','おくさん'],['販促','はんそく'],['部長','ぶちょう'],['興信所','こうしんじょ'],['今月','こんげつ'],['美容院','びよういん'],['我慢','がまん'],['九州','きゅうしゅう'],['縫製','ほうせい'],['課長','かちょう'],['待遇','たいぐう'],['昇進','しょうしん'],['懲罰','ちょうばつ'],['人事','じんじ'],['大騒ぎ','おおさわぎ'],['妻子持ち','さいしもち'],['癖','くせ'],['吉田','よしだ'],['皆さん','みなさん'],['世話','せわ'],['出ない','でない'],['間もなく','まもなく'],['日','ひ'],['入れなく','はいれなく'],['奇','き'],['何と言っても','なんといっても'],['週五日','しゅういつか'],['１人暮らし','ひとりぐらし'],['24時間','にじゅうよじかん'],['遅く','おそく'],['決めて','きめて'],['着いて','ついて'],['来る','くる'],['話','はなし'],['話せる','はなせる'],['何でも','なんでも'],['何ですか','なんですか'],['何','なに'],['下げない','さげない'],['超','ちょう'],['手出された','てだされた'],['人','ひと'],['入れて','いれて'],['頼み','たのみ'],['頼んで','たのんで'],['別に','べつに'],['急に','きゅうに'],['時','とき'],['明らか','あきらか'],['時間','じかん'],['話題','わだい'],['人間','にんげん']
].sort((a,b)=>b[0].length-a[0].length);
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const explicitReadings = words.filter(([,reading]) => reading);
const segmenter=new Intl.Segmenter('ja',{granularity:'word'});
const regexEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function readingTokens(text,{episode=2}={}){
  // Episode 2 includes context-specific readings such as the restaurant 夕 (せき).
  // Other episodes use their own curated phrase readings and the font dictionary.
  const activeWords=episode===2?words:[];
  // Include the current sentence's whole words before matching short overrides.
  // This prevents 今 from splitting 今月, for example.
  const overrides=activeWords.filter(([,reading])=>reading).map(([word])=>word);
  const byWord=new Map([...segmenter.segment(text)].filter(s=>s.isWordLike&&!overrides.some(w=>s.segment.includes(w))).map(s=>[s.segment,undefined]));
  for(const [word,reading] of activeWords)byWord.set(word,reading);
  if(text.includes('大体何なの'))byWord.set('何なの','なんなの');
  const pattern=new RegExp([...byWord.keys()].sort((a,b)=>b.length-a.length).map(regexEscape).join('|'),'g');
  const result=[];let end=0;
  for(const match of text.matchAll(pattern)){
    if(match.index>end)result.push({word:text.slice(end,match.index),plain:true});const word=match[0],reading=byWord.get(word);
    result.push({word,reading});
    end=match.index+word.length;
  }
  if(end<text.length)result.push({word:text.slice(end),plain:true});return result;
}

export function readingMarkup(text,options){return readingTokens(text,options).map(({word,reading,plain})=>plain?esc(word):reading?`<ruby class="manual-reading word">${esc(word)}<rt class="added">${esc(reading)}</rt></ruby>`:`<span class="word">${esc(word)}</span>`).join('');}
