export function sourceLabel(line){
 const s=line.source;
 return `${s.title} · ${s.sheet} · ${s.rows.length>1?'rows '+s.rows.join('–'):'row '+s.row}`;
}
