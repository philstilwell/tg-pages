// Learner recordings stay in this browser; no speech service or generated voice.
const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('tokyo-girl-recordings',1);r.onupgradeneeded=()=>r.result.createObjectStore('takes',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export async function storeTake(take){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('takes','readwrite');tx.objectStore('takes').put(take);tx.oncomplete=()=>{db.close();resolve(take);};tx.onerror=()=>{db.close();reject(tx.error);};});}
export async function takesFor(lineId){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('takes').objectStore('takes').getAll();r.onsuccess=()=>{db.close();resolve(r.result.filter(t=>t.lineId===lineId).sort((a,b)=>b.at-a.at));};r.onerror=()=>{db.close();reject(r.error);};});}
export function createRecorder(onState,onSaved,onError){
  let recorder,stream,timeout,busy=false,request=0;
  const release=s=>s?.getTracks().forEach(t=>t.stop());
  const stop=()=>{request++;clearTimeout(timeout);if(recorder?.state==='recording')recorder.stop();release(stream);busy=false;};
  return {stop,async start(lineId){
    if(busy)return;
    busy=true;
    const ticket=++request;
    try{
      if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder)throw new Error('Recording is unavailable in this browser. You can upload a recording instead.');
      const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
      if(ticket!==request){release(acquired);return;}
      stream=acquired;
      const chunks=[],takeRecorder=new MediaRecorder(acquired);
      recorder=takeRecorder;
      takeRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      takeRecorder.onstop=async()=>{
        release(acquired);clearTimeout(timeout);busy=false;onState(false);
        if(!chunks.length)return;
        try{const blob=new Blob(chunks,{type:takeRecorder.mimeType});await storeTake({id:crypto.randomUUID(),lineId,at:Date.now(),blob,type:'practice'});onSaved();}
        catch{onError('The recording could not be saved. Browser storage may be full.');}
      };
      takeRecorder.start();onState(true);timeout=setTimeout(stop,120000);
    }catch(e){if(ticket!==request)return;stop();onState(false);onError(e.name==='NotAllowedError'?'Microphone permission was declined. You can upload a recording instead.':e.message);}
  }};
}
