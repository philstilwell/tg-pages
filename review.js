export const DAY=86400000, MINUTE=60000;
export const INTERVALS=[1,3,7,14,30,60];
export function schedule(card,grade,now=Date.now()) {
  if(!['again','hard','good'].includes(grade)) throw new Error('Unknown review grade');
  const stage=Number.isInteger(card.stage)?card.stage:0;
  const next={...card,reviews:(card.reviews||0)+1,lastReviewed:now,lastGrade:grade};
  if(grade==='again') return {...next,stage:0,due:now+MINUTE,lapses:(card.lapses||0)+1};
  if(grade==='hard') return {...next,stage,due:now+DAY};
  return {...next,stage:Math.min(stage+1,INTERVALS.length),due:now+INTERVALS[Math.min(stage,INTERVALS.length-1)]*DAY};
}
export function newCards(line,now=Date.now()) {
  const kinds=/[一-龯々]/.test(line.ja)?['meaning','reading']:['meaning'];
  return kinds.map(kind=>({id:line.id+':'+kind,lineId:line.id,kind,stage:0,due:now,reviews:0,lapses:0,created:now}));
}
export function dueCards(cards,lines,furthest,now=Date.now()) {
  const order=new Map(lines.map((l,i)=>[l.id,i]));
  return Object.values(cards).filter(c=>order.has(c.lineId)&&order.get(c.lineId)<=furthest&&c.due<=now)
    .sort((a,b)=>order.get(a.lineId)-order.get(b.lineId)||a.kind.localeCompare(b.kind));
}
export function loadState(raw,count,validIds) {
  const base={version:1,current:0,furthest:0,completed:false,read:[],font:true,cards:{},history:[]};
  try {
    const s=JSON.parse(raw); if(!s||s.version!==1)return base;
    const valid=new Set(validIds), integer=(v,f)=>Number.isInteger(v)?v:f;
    const furthest=Math.min(count-1,Math.max(0,integer(s.furthest,0)));
    const cards={};
    for(const c of Object.values(s.cards||{})) {
      if(!c||!valid.has(c.lineId)||!['meaning','reading'].includes(c.kind)||c.id!==c.lineId+':'+c.kind||!Number.isFinite(c.due))continue;
      if(validIds.indexOf(c.lineId)>furthest)continue;
      cards[c.id]={...c,stage:Math.max(0,Math.min(INTERVALS.length,integer(c.stage,0))),reviews:Math.max(0,integer(c.reviews,0)),lapses:Math.max(0,integer(c.lapses,0))};
    }
    const read=Array.from(new Set(Array.isArray(s.read)?s.read.filter(id=>valid.has(id)&&validIds.indexOf(id)<=furthest):[]));
    return {...base,current:Math.min(furthest,Math.max(0,integer(s.current,0))),furthest,completed:s.completed===true&&read.length===count,read,font:s.font!==false,cards,history:Array.isArray(s.history)?s.history.filter(h=>h&&typeof h.id==='string'&&Number.isFinite(h.at)).slice(-200):[]};
  }catch{return base;}
}
