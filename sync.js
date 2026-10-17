import {mergeStates} from './study.js';
export function cloudSync({getState,applyState,status,lines,enabled=true,merge=(a,b)=>mergeStates(a,b,lines)}){
 if(!enabled){
  const local=()=>status('Progress stays in this browser');
  return {start:local,now:local,changed:local,get ready(){return true;}};
 }
 // Hosting can weaken or replace HTTP ETags; use the unmodified R2 revision in JSON.
 let timer,busy=false,again=false,etag=null,ready=false;
 const request=async(method,body)=>{const r=await fetch('/api/study',{method,credentials:'same-origin',headers:method==='PUT'?{'Content-Type':'application/json','X-Tokyo-Study':'1',...(etag?{'If-Match':etag}:{})}:{},...(body?{body:JSON.stringify(body)}:{})});if(r.status===401)throw new Error('Sign in for cloud saving');if(r.status===409)return null;if(!r.ok)throw new Error('Offline or cloud saving unavailable');const data=await r.json();etag=data.revision||null;return data;};
 async function run(){if(busy){again=true;return;}busy=true;status('Saving…');try{
   const remote=await request('GET');if(remote?.state)applyState(merge(getState(),remote.state));ready=true;
   for(let tries=0;tries<3;tries++){const snapshot=getState(),savedAt=snapshot.updatedAt;const result=await request('PUT',snapshot);if(result){if(getState().updatedAt!==savedAt)again=true;status('Saved across devices');break;}const fresh=await request('GET');if(fresh?.state)applyState(merge(getState(),fresh.state));if(tries===2)throw new Error('Another device is active; retry shortly');}
  }catch(e){status(`${e.message}. Saved on this device.`);}finally{busy=false;if(again){again=false;timer=setTimeout(run,2000);}}}
 return {start:run,now:run,changed(){clearTimeout(timer);timer=setTimeout(run,1800);},get ready(){return ready;}};
}
