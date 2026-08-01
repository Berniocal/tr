/* OCR v4 – ověřování podle barvy typu a základní síly.
   Karta se přijme jen tehdy, když se shoduje více nezávislých znaků.
   Při nejistotě se zobrazí řádek „neurčeno“ místo odhadnuté karty. */

const V4_STRENGTHS=new Set(CARDS.map(card=>card.strength));
const V4_SUIT_COLORS={
  weather:[72,125,181], flood:[39,48,105], flame:[184,38,31], army:[54,55,62],
  wild:[173,169,171], wizard:[191,48,119], leader:[104,65,143], beast:[66,127,76],
  weapon:[132,54,70], artifact:[184,65,43], land:[69,48,47]
};

function v4Clamp(value,min=0,max=1){return Math.max(min,Math.min(max,value));}

function v4RgbToLab(rgb){
  let [r,g,b]=rgb.map(x=>x/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));
  const x=(r*.4124+g*.3576+b*.1805)/.95047;
  const y=(r*.2126+g*.7152+b*.0722);
  const z=(r*.0193+g*.1192+b*.9505)/1.08883;
  const f=t=>t>.008856?Math.cbrt(t):(7.787*t+16/116);
  const fx=f(x),fy=f(y),fz=f(z);
  return [116*fy-16,500*(fx-fy),200*(fy-fz)];
}
function v4LabDistance(a,b){
  const A=v4RgbToLab(a),B=v4RgbToLab(b);
  return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2]);
}
function v4RgbHsv([r,g,b]){
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;
  if(d){
    if(max===r)h=((g-b)/d)%6;
    else if(max===g)h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h=(h*60+360)%360;
  }
  return {h,s:max?d/max:0,v:max};
}

function v4Median(values){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}

function v4RepresentativeColor(canvas,rect){
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  const x=Math.max(0,Math.floor(rect.x0)),y=Math.max(0,Math.floor(rect.y0));
  const w=Math.max(1,Math.min(canvas.width-x,Math.ceil(rect.x1-rect.x0)));
  const h=Math.max(1,Math.min(canvas.height-y,Math.ceil(rect.y1-rect.y0)));
  let data;
  try{data=ctx.getImageData(x,y,w,h).data;}catch(error){return null;}
  const pixels=[];
  const step=Math.max(1,Math.floor(Math.sqrt((w*h)/4500)));
  for(let py=0;py<h;py+=step){
    for(let px=0;px<w;px+=step){
      const i=(py*w+px)*4,r=data[i],g=data[i+1],b=data[i+2];
      const hsv=v4RgbHsv([r,g,b]);
      const beige=r>155&&g>140&&b>115&&Math.max(r,g,b)-Math.min(r,g,b)<65;
      const white=r>205&&g>195&&b>180;
      if(white||beige)continue;
      if(hsv.v<.12||hsv.v>.93)continue;
      pixels.push({r,g,b,s:hsv.s,v:hsv.v});
    }
  }
  if(pixels.length<12)return null;
  pixels.sort((a,b)=>(b.s+.18*(1-Math.abs(b.v-.55)))-(a.s+.18*(1-Math.abs(a.v-.55))));
  const keep=pixels.slice(0,Math.max(12,Math.floor(pixels.length*.45)));
  return [
    Math.round(v4Median(keep.map(p=>p.r))),
    Math.round(v4Median(keep.map(p=>p.g))),
    Math.round(v4Median(keep.map(p=>p.b)))
  ];
}

function v4RankSuits(rgb){
  if(!rgb)return {ranked:[],confidence:0,rgb:null};
  const ranked=Object.entries(V4_SUIT_COLORS)
    .map(([suit,ref])=>({suit,distance:v4LabDistance(rgb,ref)}))
    .sort((a,b)=>a.distance-b.distance);
  const first=ranked[0],second=ranked[1]||{distance:first.distance+1};
  const separation=(second.distance-first.distance)/Math.max(18,second.distance);
  const absolute=1-first.distance/95;
  const confidence=v4Clamp(.58*absolute+.72*separation);
  return {ranked,confidence,rgb};
}

function v4Box(value){
  const b=value?.bbox||value?.boundingBox;
  if(!b)return null;
  const x0=Number(b.x0??b.left??0),y0=Number(b.y0??b.top??0);
  return {x0,y0,x1:Number(b.x1??(x0+Number(b.width||0))),y1:Number(b.y1??(y0+Number(b.height||0)))};
}

function v4Words(data){
  const words=[];
  const add=value=>{
    const text=String(value?.text||"").trim(),bbox=v4Box(value);
    if(text&&bbox)words.push({text,bbox,confidence:Number(value.confidence||value.conf||0)});
  };
  if(Array.isArray(data?.words))data.words.forEach(add);
  if(Array.isArray(data?.blocks)){
    for(const block of data.blocks||[]){
      for(const paragraph of block.paragraphs||[]){
        for(const line of paragraph.lines||[]){
          for(const word of line.words||[])add(word);
        }
      }
      for(const line of block.lines||[])for(const word of line.words||[])add(word);
    }
  }
  const seen=new Set();
  return words.filter(word=>{
    const key=`${word.text}|${Math.round(word.bbox.x0)}|${Math.round(word.bbox.y0)}`;
    if(seen.has(key))return false;seen.add(key);return true;
  });
}

function v4ParseStrength(text){
  let value=String(text||"").trim().replace(/[Oo]/g,"0").replace(/[Il|]/g,"1");
  value=value.replace(/[^0-9]/g,"");
  if(!value||value.length>2)return null;
  const n=Number(value);
  return Number.isInteger(n)&&V4_STRENGTHS.has(n)?n:null;
}

function v4ExpandedBox(box,padX,padY){
  return {x0:box.x0-padX,y0:box.y0-padY,x1:box.x1+padX,y1:box.y1+padY};
}

function v4TitleNear(word,lines,canvas){
  const b=word.bbox,h=Math.max(1,b.y1-b.y0),cy=(b.y0+b.y1)/2;
  let best=null;
  for(const line of lines){
    if(!line.bbox)continue;
    const l=line.bbox,lcy=(l.y0+l.y1)/2,lw=l.x1-l.x0,lh=l.y1-l.y0;
    if(l.x0<b.x0-h*.4||Math.abs(lcy-cy)>Math.max(h,lh)*2.2)continue;
    if(lw<h*2.2||l.x0-b.x1>h*13)continue;
    const stats=v2BackgroundStats(canvas,v4ExpandedBox(l,3,3));
    if(stats.mean>184||stats.dark<.28)continue;
    const distance=Math.abs(lcy-cy)+(l.x0-b.x1)*.2;
    if(!best||distance<best.distance)best={line,distance};
  }
  return best?.line||null;
}

function v4SuitFromStrength(canvas,word){
  const b=word.bbox,h=Math.max(8,b.y1-b.y0),cx=(b.x0+b.x1)/2;
  const rect={
    x0:cx-h*3.7,x1:cx-h*1.15,
    y0:b.y1+h*.35,y1:b.y1+h*9.5
  };
  const rgb=v4RepresentativeColor(canvas,rect);
  return {...v4RankSuits(rgb),rect};
}

function v4LocalText(lines,anchor,canvas){
  const b=anchor.word.bbox,h=Math.max(9,b.y1-b.y0),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
  const x0=cx-h*3.8,x1=cx+h*13.5,y0=cy-h*2.2,y1=cy+h*18.5;
  const local=lines.filter(line=>line.bbox&&
    (line.bbox.x0+line.bbox.x1)/2>=x0&&(line.bbox.x0+line.bbox.x1)/2<=x1&&
    (line.bbox.y0+line.bbox.y1)/2>=y0&&(line.bbox.y0+line.bbox.y1)/2<=y1
  ).sort((a,b)=>(a.bbox.y0-b.bbox.y0)||(a.bbox.x0-b.bbox.x0));
  return local.map(line=>line.text).join(" ").slice(0,650);
}

function v4StrengthAnchors(data,canvas,turns,base){
  const lines=v3Lines(data),words=v4Words(data),anchors=[];
  for(const word of words){
    const strength=v4ParseStrength(word.text);
    if(strength===null)continue;
    const b=word.bbox,h=b.y1-b.y0,w=b.x1-b.x0;
    if(h<canvas.height*.006||h>canvas.height*.075||w>h*3.2)continue;
    const stats=v2BackgroundStats(canvas,v4ExpandedBox(b,h*.75,h*.55));
    const title=v4TitleNear(word,lines,canvas);
    const darkCircle=stats.mean<188&&stats.dark>.22;
    if(!darkCircle||(!title&&word.confidence<62))continue;
    const suit=v4SuitFromStrength(canvas,word);
    const center=v3UnrotatePoint((b.x0+b.x1)/2,(b.y0+b.y1)/2,turns,base);
    const anchor={word,strength,suit,title,x:center.x,y:center.y,turns};
    anchor.text=v4LocalText(lines,anchor,canvas);
    anchors.push(anchor);
  }
  return anchors;
}
