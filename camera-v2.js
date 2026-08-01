/* Vylepšené OCR: fotografie se rozdělí na překrývající se výřezy.
   Z OCR se přijímají hlavně velké nápisy na tmavém titulním pruhu karty. */

function canvasForOcr(source){
  const width=source.width||source.naturalWidth;
  const height=source.height||source.naturalHeight;
  const maxSide=2200;
  const scale=Math.min(1,maxSide/Math.max(width,height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas;
}

function v2Compact(value){
  return normalizeOcr(value).replace(/\b\d+\b/g," ").replace(/\s+/g," ").trim();
}

function v2BestWindowSimilarity(text,name){
  const compactText=v2Compact(text).replace(/ /g,"");
  const compactName=v2Compact(name).replace(/ /g,"");
  if(!compactText||!compactName)return 0;
  if(compactText.includes(compactName))return 1;
  let best=similarity(compactText,compactName);
  const min=Math.max(2,compactName.length-3);
  const max=Math.min(compactText.length,compactName.length+4);
  for(let len=min;len<=max;len++){
    for(let i=0;i+len<=compactText.length;i++){
      best=Math.max(best,similarity(compactText.slice(i,i+len),compactName));
    }
  }
  return best;
}

function v2CardMatch(text){
  let winner=null;
  for(const card of CARDS){
    const score=Math.max(scoreCardLine(text,card.cs),v2BestWindowSimilarity(text,card.cs));
    if(!winner||score>winner.score)winner={id:card.id,score};
  }
  return winner;
}

function v2CollectLines(data){
  const lines=[];
  const add=line=>{
    if(!line||!String(line.text||"").trim())return;
    const b=line.bbox||line.boundingBox||null;
    lines.push({
      text:String(line.text||""),
      confidence:Number(line.confidence||line.conf||0),
      bbox:b?{x0:Number(b.x0??b.left??0),y0:Number(b.y0??b.top??0),x1:Number(b.x1??((b.left||0)+(b.width||0))),y1:Number(b.y1??((b.top||0)+(b.height||0)))}:null
    });
  };
  if(Array.isArray(data?.lines))data.lines.forEach(add);
  if(!lines.length&&Array.isArray(data?.blocks)){
    for(const block of data.blocks){
      if(Array.isArray(block.paragraphs)){
        for(const paragraph of block.paragraphs){
          if(Array.isArray(paragraph.lines))paragraph.lines.forEach(add);
        }
      }
      if(Array.isArray(block.lines))block.lines.forEach(add);
    }
  }
  if(!lines.length){
    String(data?.text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(text=>lines.push({text,confidence:0,bbox:null}));
  }
  return lines;
}

function v2BackgroundStats(canvas,bbox){
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  const pad=4;
  const x=Math.max(0,Math.floor(bbox.x0-pad));
  const y=Math.max(0,Math.floor(bbox.y0-pad));
  const w=Math.max(1,Math.min(canvas.width-x,Math.ceil(bbox.x1-bbox.x0+2*pad)));
  const h=Math.max(1,Math.min(canvas.height-y,Math.ceil(bbox.y1-bbox.y0+2*pad)));
  let pixels;
  try{pixels=ctx.getImageData(x,y,w,h).data;}catch(e){return {mean:255,dark:0};}
  let sum=0,dark=0,count=0;
  const step=Math.max(1,Math.floor(Math.sqrt((w*h)/5000)));
  for(let py=0;py<h;py+=step){
    for(let px=0;px<w;px+=step){
      const i=(py*w+px)*4;
      const lum=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
      sum+=lum;if(lum<160)dark++;count++;
    }
  }
  return {mean:count?sum/count:255,dark:count?dark/count:0};
}

function v2TitleGroups(data,tile){
  const raw=v2CollectLines(data);
  const darkLines=[];
  const minHeight=tile.canvas.height*.018;
  for(const line of raw){
    if(!line.bbox)continue;
    const width=line.bbox.x1-line.bbox.x0;
    const height=line.bbox.y1-line.bbox.y0;
    if(width<tile.canvas.width*.035||height<minHeight)continue;
    const stats=v2BackgroundStats(tile.canvas,line.bbox);
    if(stats.mean>148||stats.dark<.48)continue;
    darkLines.push({...line,width,height,stats});
  }
  darkLines.sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1)||a.bbox.x0-b.bbox.x0);
  const groups=[];
  for(const line of darkLines){
    const cy=(line.bbox.y0+line.bbox.y1)/2;
    let chosen=null;
    for(const group of groups){
      const gy=(group.y0+group.y1)/2;
      const vertical=Math.abs(cy-gy)<=Math.max(line.height,group.y1-group.y0)*.78;
      const gap=Math.max(0,Math.max(group.x0,line.bbox.x0)-Math.min(group.x1,line.bbox.x1));
      const horizontal=gap<=Math.max(tile.canvas.width*.065,Math.max(line.height,group.y1-group.y0)*2.8);
      if(vertical&&horizontal){chosen=group;break;}
    }
    if(!chosen){
      chosen={lines:[],x0:line.bbox.x0,y0:line.bbox.y0,x1:line.bbox.x1,y1:line.bbox.y1};
      groups.push(chosen);
    }
    chosen.lines.push(line);
    chosen.x0=Math.min(chosen.x0,line.bbox.x0);chosen.y0=Math.min(chosen.y0,line.bbox.y0);
    chosen.x1=Math.max(chosen.x1,line.bbox.x1);chosen.y1=Math.max(chosen.y1,line.bbox.y1);
  }
  return groups.map(group=>{
    const sorted=[...group.lines].sort((a,b)=>a.bbox.x0-b.bbox.x0);
    return {
      text:sorted.map(x=>x.text).join(" "),
      confidence:sorted.reduce((a,x)=>a+x.confidence,0)/sorted.length,
      bbox:{x0:group.x0,y0:group.y0,x1:group.x1,y1:group.y1}
    };
  });
}

function v2FallbackGroups(data){
  return v2CollectLines(data).filter(x=>!x.bbox&&v2Compact(x.text).length<=28).map(x=>({text:x.text,confidence:x.confidence,bbox:null}));
}

function v2CandidatesFromResult(data,tile){
  const groups=v2TitleGroups(data,tile);
  const candidates=[];
  const sourceGroups=groups.length?groups:v2FallbackGroups(data);
  for(const group of sourceGroups){
    const match=v2CardMatch(group.text);
    if(!match)continue;
    const letters=v2Compact(BY_ID[match.id].cs).replace(/ /g,"").length;
    const threshold=group.bbox?(letters<=4?.82:letters<=7?.72:letters<=11?.67:.64):.88;
    if(match.score<threshold)continue;
    const confidenceBoost=Math.max(0,Math.min(.05,(group.confidence||0)/2000));
    const score=Math.min(1,match.score+confidenceBoost);
    const centerX=group.bbox?(group.bbox.x0+group.bbox.x1)/2:tile.canvas.width/2;
    const centerY=group.bbox?(group.bbox.y0+group.bbox.y1)/2:tile.canvas.height/2;
    candidates.push({
      id:match.id,
      score,
      line:group.text,
      x:tile.sx+centerX/tile.scaleX,
      y:tile.sy+centerY/tile.scaleY,
      manual:false
    });
  }
  const best=new Map();
  for(const candidate of candidates){
    const old=best.get(candidate.id);
    if(!old||candidate.score>old.score)best.set(candidate.id,candidate);
  }
  return [...best.values()];
}

function v2MakeTiles(base,cols,rows,overlap,label){
  const tiles=[];
  const cellW=base.width/cols,cellH=base.height/rows;
  for(let row=0;row<rows;row++){
    for(let col=0;col<cols;col++){
      const sx=Math.max(0,Math.floor(col*cellW-cellW*overlap));
      const sy=Math.max(0,Math.floor(row*cellH-cellH*overlap));
      const ex=Math.min(base.width,Math.ceil((col+1)*cellW+cellW*overlap));
      const ey=Math.min(base.height,Math.ceil((row+1)*cellH+cellH*overlap));
      const sw=ex-sx,sh=ey-sy;
      const targetMax=1550;
      const scale=Math.min(2.6,targetMax/Math.max(sw,sh));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(sw*scale));
      canvas.height=Math.max(1,Math.round(sh*scale));
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if("filter" in ctx)ctx.filter="contrast(1.12) saturate(.92)";
      ctx.drawImage(base,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
      tiles.push({canvas,sx,sy,sw,sh,scaleX:canvas.width/sw,scaleY:canvas.height/sh,label,row,col});
    }
  }
  return tiles;
}

function v2MergeCandidate(map,candidate){
  const old=map.get(candidate.id);
  if(!old||candidate.score>old.score)map.set(candidate.id,candidate);
}

async function v2RecognizeTile(worker,tile){
  let result;
  try{
    result=await worker.recognize(tile.canvas,{}, {blocks:true,text:true});
  }catch(error){
    result=await worker.recognize(tile.canvas);
  }
  return v2CandidatesFromResult(result.data,tile);
}

async function recognizeScan(){
  if(!scanImageSource||scanBusy)return;
  const run=++scanRunId;
  setScanBusy(true);
  setScanStatus("Načítám rozpoznávání textu…",4);
  let worker=null;
  try{
    const Tesseract=await loadTesseract();
    worker=await Tesseract.createWorker("ces",1,{logger:message=>{
      if(run!==scanRunId)return;
      const labels={
        "loading tesseract core":"Načítám OCR jádro…",
        "initializing tesseract":"Spouštím OCR…",
        "loading language traineddata":"Načítám češtinu…",
        "initializing api":"Připravuji češtinu…"
      };
      if(labels[message.status])setScanStatus(labels[message.status],6+(Number(message.progress)||0)*14);
    }});
    await worker.setParameters({tessedit_pageseg_mode:"11",preserve_interword_spaces:"1",user_defined_dpi:"300"});
    const base=canvasForOcr(scanImageSource);
    const coarse=v2MakeTiles(base,2,3,.18,"základní");
    const fine=v2MakeTiles(base,3,4,.22,"detailní");
    const found=new Map();
    let done=0;
    const total=coarse.length+fine.length;

    for(const tile of coarse){
      if(run!==scanRunId)return;
      setScanStatus(`Čtu fotografii po částech… ${done+1}/${coarse.length}`,20+(done/total)*75);
      for(const candidate of await v2RecognizeTile(worker,tile))v2MergeCandidate(found,candidate);
      done++;
    }

    let target=found.has("FR28")?8:7;
    if(found.size<target){
      for(const tile of fine){
        if(run!==scanRunId)return;
        setScanStatus(`Dohledávám hůře čitelné názvy… ${done-coarse.length+1}/${fine.length}`,20+(done/total)*75);
        for(const candidate of await v2RecognizeTile(worker,tile))v2MergeCandidate(found,candidate);
        done++;
        target=found.has("FR28")?8:7;
        if(found.size>=target)break;
      }
    }

    if(run!==scanRunId)return;
    scanCandidates=[...found.values()].sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,8);
    renderScanCandidates();
    setScanStatus(scanCandidates.length
      ?`Rozpoznáno ${scanCandidates.length} ${scanCandidates.length===1?"karta":scanCandidates.length<5?"karty":"karet"}. Zkontroluj výsledek.`
      :"Názvy se nepodařilo spolehlivě přečíst. Zkus lepší světlo nebo přidej karty ručně.",100);
  }catch(error){
    console.error(error);
    if(run===scanRunId)setScanStatus(`Rozpoznání selhalo: ${error.message||"neznámá chyba"}`,0);
  }finally{
    if(worker)try{await worker.terminate()}catch(e){}
    if(run===scanRunId)setScanBusy(false);
  }
}
