function normalizeOcr(value){
  return String(value||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("cs")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}
function levenshtein(a,b){
  if(a===b)return 0;
  if(!a.length)return b.length;
  if(!b.length)return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i),cur=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    cur[0]=i;
    for(let j=1;j<=b.length;j++) cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    [prev,cur]=[cur,prev];
  }
  return prev[b.length];
}
function similarity(a,b){
  const max=Math.max(a.length,b.length);
  return max?1-levenshtein(a,b)/max:1;
}
function scoreCardLine(rawLine,cardName){
  const line=normalizeOcr(rawLine).replace(/\b\d+\b/g," ").replace(/\s+/g," ").trim();
  const name=normalizeOcr(cardName);
  if(!line||!name)return 0;
  if(line===name)return 1;
  const lt=line.split(" "),nt=name.split(" ");
  let best=0;
  const minLen=Math.max(1,nt.length-1),maxLen=Math.min(lt.length,nt.length+2);
  for(let len=minLen;len<=maxLen;len++){
    for(let i=0;i+len<=lt.length;i++){
      const part=lt.slice(i,i+len).join(" ");
      let sc=similarity(part,name);
      if(part===name)sc=1;
      if(i===0 && part.startsWith(name))sc=Math.max(sc,.96);
      if(lt.length>nt.length+3)sc-=.13;
      best=Math.max(best,sc);
    }
  }
  return Math.max(0,best);
}
function confidenceThreshold(name){
  const n=normalizeOcr(name).replace(/ /g,"").length;
  if(n<=4)return .93;
  if(n<=7)return .84;
  if(n<=11)return .77;
  return .70;
}
function extractScanCandidates(data){
  let lines=[];
  if(Array.isArray(data?.lines) && data.lines.length){
    lines=data.lines.map((line,index)=>({
      text:line.text||"",
      confidence:Number(line.confidence||0),
      index,
      x:Number(line.bbox?.x0||0),
      y:Number(line.bbox?.y0||index),
      height:Math.max(1,Number((line.bbox?.y1||0)-(line.bbox?.y0||0)))
    }));
  }else{
    lines=String(data?.text||"").split(/\r?\n/).filter(Boolean).map((text,index)=>({text,index,x:0,y:index,height:1,confidence:0}));
  }
  const heights=lines.map(l=>l.height).sort((a,b)=>a-b);
  const median=heights.length?heights[Math.floor(heights.length/2)]:1;
  const found=[];
  for(const line of lines){
    let winner=null;
    for(const card of CARDS){
      let score=scoreCardLine(line.text,card.cs);
      if(line.height>median*1.35)score+=.035;
      if(line.confidence>75)score+=.015;
      score=Math.min(1,score);
      if(!winner||score>winner.score)winner={id:card.id,score,line:line.text,x:line.x,y:line.y,index:line.index};
    }
    if(winner && winner.score>=confidenceThreshold(BY_ID[winner.id].cs))found.push(winner);
  }
  const unique=new Map();
  for(const item of found){
    const old=unique.get(item.id);
    if(!old||item.score>old.score)unique.set(item.id,item);
  }
  return [...unique.values()].sort((a,b)=>a.y-b.y||a.x-b.x||a.index-b.index).slice(0,8);
}
function cardOptions(selected=""){
  return `<option value="">— vyber kartu —</option>`+CARDS.map(c=>`<option value="${c.id}" ${selected===c.id?"selected":""}>${escapeHtml(c.cs)} · ${SUITS[c.suit]}</option>`).join("");
}
function renderScanCandidates(){
  const root=document.getElementById("scanResults");
  if(!scanCandidates.length){
    root.innerHTML='<div class="scanempty">Žádná karta nebyla spolehlivě rozpoznána. Můžeš přidat řádky ručně nebo pořídit lepší fotografii.</div>';
    return;
  }
  root.innerHTML=scanCandidates.map((item,index)=>`
    <div class="scanrow" data-scan-row="${index}">
      <select class="scanselect" aria-label="Rozpoznaná karta">${cardOptions(item.id)}</select>
      <button class="btn small danger" type="button" data-scan-remove="${index}">Odebrat</button>
      <div class="scanmeta">${item.manual?"Přidáno ručně":`Shoda ${Math.round(item.score*100)} % · OCR: „${escapeHtml(String(item.line||"").trim().slice(0,90))}“`}</div>
    </div>`).join("");
}
function setScanStatus(text,progress=0){
  document.getElementById("scanStatus").textContent=text;
  document.getElementById("scanProgress").style.width=`${Math.max(0,Math.min(100,progress))}%`;
}
function setScanBusy(value){
  scanBusy=value;
  ["scanAgain","scanAddRow","scanAppend","scanReplace"].forEach(id=>document.getElementById(id).disabled=value);
}
function loadTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(tesseractLoader)return tesseractLoader;
  tesseractLoader=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    script.crossOrigin="anonymous";
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error("OCR knihovna se nenačetla."));
    script.onerror=()=>reject(new Error("Nepodařilo se stáhnout OCR knihovnu."));
    document.head.appendChild(script);
  }).catch(error=>{tesseractLoader=null;throw error;});
  return tesseractLoader;
}
async function imageSourceFromFile(file){
  if("createImageBitmap" in window){
    try{return await createImageBitmap(file,{imageOrientation:"from-image"});}catch(e){}
  }
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Fotografii se nepodařilo otevřít."))};
    img.src=url;
  });
}
function canvasForOcr(source){
  const width=source.width||source.naturalWidth,height=source.height||source.naturalHeight;
  const maxSide=2400,scale=Math.min(1,maxSide/Math.max(width,height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas;
}
async function openScan(file){
  if(!file)return;
  if(!file.type.startsWith("image/")){toast("Vyber fotografii nebo obrázek.");return;}
  try{
    scanImageSource=await imageSourceFromFile(file);
    const previewCanvas=canvasForOcr(scanImageSource);
    document.getElementById("scanPreview").src=previewCanvas.toDataURL("image/jpeg",.86);
    scanCandidates=[];
    renderScanCandidates();
    document.getElementById("scanBack").classList.add("show");
    document.body.style.overflow="hidden";
    setScanStatus("Fotografie připravena. Spouštím rozpoznání…",2);
    setTimeout(recognizeScan,80);
  }catch(error){toast(error.message||"Fotografii se nepodařilo načíst.");}
}
async function recognizeScan(){
  if(!scanImageSource||scanBusy)return;
  const run=++scanRunId;
  setScanBusy(true);
  setScanStatus("Načítám rozpoznávání textu…",5);
  let worker=null;
  try{
    const Tesseract=await loadTesseract();
    worker=await Tesseract.createWorker("ces",1,{logger:message=>{
      if(run!==scanRunId)return;
      const labels={
        "loading tesseract core":"Načítám OCR jádro…",
        "initializing tesseract":"Spouštím OCR…",
        "loading language traineddata":"Načítám češtinu…",
        "initializing api":"Připravuji češtinu…",
        "recognizing text":"Čtu názvy karet…"
      };
      const base=message.status==="recognizing text"?35:8;
      const span=message.status==="recognizing text"?63:25;
      setScanStatus(labels[message.status]||"Připravuji rozpoznání…",base+(Number(message.progress)||0)*span);
    }});
    await worker.setParameters({tessedit_pageseg_mode:"11",preserve_interword_spaces:"1"});
    const canvas=canvasForOcr(scanImageSource);
    const result=await worker.recognize(canvas);
    if(run!==scanRunId)return;
    scanCandidates=extractScanCandidates(result.data);
    renderScanCandidates();
    setScanStatus(scanCandidates.length?`Rozpoznáno ${scanCandidates.length} ${scanCandidates.length===1?"karta":scanCandidates.length<5?"karty":"karet"}. Zkontroluj výsledek.`:"Názvy se nepodařilo spolehlivě přečíst. Zkus lepší světlo nebo přidej karty ručně.",100);
  }catch(error){
    if(run===scanRunId)setScanStatus(`Rozpoznání selhalo: ${error.message||"neznámá chyba"}`,0);
  }finally{
    if(worker)try{await worker.terminate()}catch(e){}
    if(run===scanRunId)setScanBusy(false);
  }
}
function closeScan(){
  scanRunId++;
  document.getElementById("scanBack").classList.remove("show");
  document.body.style.overflow="";
  document.getElementById("cameraInput").value="";
  scanCandidates=[];
  if(scanImageSource?.close)try{scanImageSource.close()}catch(e){}
  scanImageSource=null;
}
function scannedIds(){
  return [...document.querySelectorAll(".scanselect")].map(s=>s.value).filter(Boolean).filter((id,index,arr)=>arr.indexOf(id)===index);
}
function applyScannedCards(replace){
  const ids=scannedIds();
  if(!ids.length){toast("Nejdřív vyber alespoň jednu kartu.");return;}
  if(replace){state.selected=[];state.actions={};}
  const ordered=ids.includes("FR28")?["FR28",...ids.filter(id=>id!=="FR28")]:ids;
  let added=0,skipped=0;
  for(const id of ordered){
    if(state.selected.includes(id))continue;
    if(canAdd(id)){state.selected.push(id);added++;}
    else skipped++;
  }
  closeScan();render();
  toast(skipped?`Přidáno ${added} karet, ${skipped} se nevešlo do ruky.`:`Přidáno ${added} karet z fotografie.`);
}
