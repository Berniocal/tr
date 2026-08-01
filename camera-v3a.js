/* OCR v3
   - čte fotografii po otočení 0°, 90°, 180° a 270°
   - spojuje části názvů, které OCR rozdělilo do více řádků
   - při nečitelném názvu porovnává i jedinečná slova z textu schopnosti karty
   - při slabém výsledku použije detailní překrývající se výřezy
*/

const V3_STOP_WORDS=new Set([
  "bonus","postih","postihy","karta","karty","kartu","karet","body","bodu",
  "zakladni","sila","sily","ruce","ruky","tvoje","svoje","sve","tve","dalsi",
  "tato","tento","teto","jsou","bude","budou","maji","ma","mit","neni","neni-li"
]);
let v3ProfilesCache=null;

function v3Tokenize(value){
  return normalizeOcr(value).split(/\s+/).filter(token=>token.length>=4&&!V3_STOP_WORDS.has(token));
}

function v3Profiles(){
  if(v3ProfilesCache&&v3ProfilesCache.size===CARDS.length)return v3ProfilesCache;
  const docs=new Map();
  const df=new Map();
  for(const card of CARDS){
    const nameTokens=v3Tokenize(card.cs);
    const ruleTokens=v3Tokenize(card.rule);
    const tokens=[...new Set([...nameTokens,...ruleTokens])];
    docs.set(card.id,{card,nameTokens,ruleTokens,tokens});
    for(const token of tokens)df.set(token,(df.get(token)||0)+1);
  }
  const total=CARDS.length;
  const profiles=new Map();
  for(const [id,doc] of docs){
    const weighted=doc.tokens.map(token=>{
      const rarity=Math.log((total+1)/((df.get(token)||0)+1))+1;
      const nameBoost=doc.nameTokens.includes(token)?1.45:1;
      return {token,weight:rarity*nameBoost};
    }).sort((a,b)=>b.weight-a.weight).slice(0,12);
    profiles.set(id,{...doc,weighted,totalWeight:weighted.reduce((sum,x)=>sum+x.weight,0)});
  }
  v3ProfilesCache=profiles;
  return profiles;
}

function v3WordSimilarity(a,b){
  if(a===b)return 1;
  if(!a||!b)return 0;
  const short=Math.min(a.length,b.length)<=5;
  const score=similarity(a,b);
  return score>=(short?.82:.74)?score:0;
}

function v3ProfileScore(text,profile){
  const textTokens=[...new Set(v3Tokenize(text))];
  if(!textTokens.length)return {score:0,matched:0,nameScore:0};
  let sum=0,matched=0;
  for(const item of profile.weighted){
    let best=0;
    for(const token of textTokens){
      best=Math.max(best,v3WordSimilarity(item.token,token));
      if(best===1)break;
    }
    if(best){
      sum+=item.weight*best;
      matched++;
    }
  }
  const ruleScore=profile.totalWeight?sum/profile.totalWeight:0;
  const nameScore=Math.max(
    scoreCardLine(text,profile.card.cs),
    v2BestWindowSimilarity(text,profile.card.cs)
  );
  return {score:Math.max(nameScore,ruleScore*.88+nameScore*.22),matched,nameScore,ruleScore};
}

function v3BaseCanvas(source){
  const width=source.width||source.naturalWidth;
  const height=source.height||source.naturalHeight;
  const maxSide=2500;
  const scale=Math.min(1.7,maxSide/Math.max(width,height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;
  if("filter" in ctx)ctx.filter="contrast(1.18) saturate(.88)";
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas;
}

function v3RotateCanvas(source,turns){
  const t=((turns%4)+4)%4;
  if(t===0)return source;
  const canvas=document.createElement("canvas");
  if(t%2){canvas.width=source.height;canvas.height=source.width;}
  else{canvas.width=source.width;canvas.height=source.height;}
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(t===1){ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);}
  else if(t===2){ctx.translate(canvas.width,canvas.height);ctx.rotate(Math.PI);}
  else{ctx.translate(0,canvas.height);ctx.rotate(-Math.PI/2);}
  ctx.drawImage(source,0,0);
  return canvas;
}

function v3UnrotatePoint(x,y,turns,base){
  const t=((turns%4)+4)%4;
  if(t===0)return {x,y};
  if(t===1)return {x:y,y:base.height-x};
  if(t===2)return {x:base.width-x,y:base.height-y};
  return {x:base.width-y,y:x};
}

function v3Bbox(line){
  const b=line?.bbox||line?.boundingBox;
  if(!b)return null;
  const x0=Number(b.x0??b.left??0),y0=Number(b.y0??b.top??0);
  return {
    x0,y0,
    x1:Number(b.x1??(x0+Number(b.width||0))),
    y1:Number(b.y1??(y0+Number(b.height||0)))
  };
}

function v3Lines(data){
  return v2CollectLines(data).map(line=>{
    const bbox=v3Bbox(line);
    return {
      ...line,bbox,
      cx:bbox?(bbox.x0+bbox.x1)/2:0,
      cy:bbox?(bbox.y0+bbox.y1)/2:0,
      width:bbox?bbox.x1-bbox.x0:0,
      height:bbox?bbox.y1-bbox.y0:0
    };
  }).filter(line=>line.text&&String(line.text).trim());
}

function v3JoinedLineGroups(lines,canvas){
  const variants=[];
  for(const line of lines){
    variants.push({text:line.text,bbox:line.bbox,confidence:line.confidence||0});
    if(!line.bbox)continue;
    const row=lines.filter(other=>{
      if(!other.bbox)return false;
      const overlap=Math.min(line.bbox.y1,other.bbox.y1)-Math.max(line.bbox.y0,other.bbox.y0);
      const minHeight=Math.max(1,Math.min(line.height,other.height));
      const vertical=overlap/minHeight>.25||Math.abs(line.cy-other.cy)<Math.max(line.height,other.height)*.72;
      const gap=Math.max(0,Math.max(line.bbox.x0,other.bbox.x0)-Math.min(line.bbox.x1,other.bbox.x1));
      return vertical&&gap<Math.max(canvas.width*.055,Math.max(line.height,other.height)*2.5);
    }).sort((a,b)=>a.bbox.x0-b.bbox.x0);
    if(row.length<2)continue;
    const x0=Math.min(...row.map(x=>x.bbox.x0)),y0=Math.min(...row.map(x=>x.bbox.y0));
    const x1=Math.max(...row.map(x=>x.bbox.x1)),y1=Math.max(...row.map(x=>x.bbox.y1));
    variants.push({
      text:row.map(x=>x.text).join(" "),bbox:{x0,y0,x1,y1},
      confidence:row.reduce((sum,x)=>sum+(x.confidence||0),0)/row.length
    });
  }
  const seen=new Set();
  return variants.filter(item=>{
    const key=normalizeOcr(item.text);
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
}

function v3DirectCandidates(lines,canvas,turns,base){
  const candidates=[];
  for(const group of v3JoinedLineGroups(lines,canvas)){
    const match=v2CardMatch(group.text);
    if(!match)continue;
    const letters=normalizeOcr(BY_ID[match.id].cs).replace(/ /g,"").length;
    const threshold=letters<=4?.78:letters<=7?.66:letters<=11?.61:.57;
    let dark=false;
    if(group.bbox){
      const stats=v2BackgroundStats(canvas,group.bbox);
      dark=stats.mean<170&&stats.dark>.38;
    }
    if(match.score<threshold+(dark?0:.07))continue;
    const cx=group.bbox?(group.bbox.x0+group.bbox.x1)/2:canvas.width/2;
    const cy=group.bbox?(group.bbox.y0+group.bbox.y1)/2:canvas.height/2;
    const point=v3UnrotatePoint(cx,cy,turns,base);
    candidates.push({
      id:match.id,score:Math.min(1,match.score+(dark?.045:0)),line:group.text,
      x:point.x,y:point.y,manual:false,method:"název"
    });
  }
  return candidates;
}
