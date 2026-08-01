function v3RegionCandidates(lines,canvas,turns,base){
  const profiles=v3Profiles();
  const candidates=[];
  const rx=canvas.width*.18,ry=canvas.height*.18;
  const anchors=lines.filter(line=>line.bbox&&v3Tokenize(line.text).length);
  for(const anchor of anchors){
    const nearby=lines.filter(line=>line.bbox&&Math.abs(line.cx-anchor.cx)<=rx&&Math.abs(line.cy-anchor.cy)<=ry);
    if(nearby.length<2)continue;
    const text=nearby.sort((a,b)=>a.cy-b.cy||a.cx-b.cx).map(line=>line.text).join(" ");
    const ranked=[];
    for(const [id,profile] of profiles){
      const result=v3ProfileScore(text,profile);
      ranked.push({id,...result});
    }
    ranked.sort((a,b)=>b.score-a.score);
    const best=ranked[0],second=ranked[1]||{score:0};
    if(!best)continue;
    const strongName=best.nameScore>=(normalizeOcr(BY_ID[best.id].cs).length<=7?.70:.62);
    const strongRule=best.matched>=2&&best.ruleScore>=.38&&best.score>=.42&&(best.score-second.score>=.045||best.ruleScore>=.62);
    if(!strongName&&!strongRule)continue;
    const point=v3UnrotatePoint(anchor.cx,anchor.cy,turns,base);
    candidates.push({
      id:best.id,score:Math.min(.97,best.score),line:text.slice(0,130),
      x:point.x,y:point.y,manual:false,method:strongName?"název":"text karty"
    });
  }
  const bestById=new Map();
  for(const candidate of candidates)v2MergeCandidate(bestById,candidate);
  return [...bestById.values()];
}

async function v3RecognizeCanvas(worker,canvas,turns,base){
  let result;
  try{result=await worker.recognize(canvas,{}, {blocks:true,text:true});}
  catch(error){result=await worker.recognize(canvas);}
  const lines=v3Lines(result.data);
  return [
    ...v3DirectCandidates(lines,canvas,turns,base),
    ...v3RegionCandidates(lines,canvas,turns,base)
  ];
}

async function v3RecognizeDetailTile(worker,tile){
  let result;
  try{result=await worker.recognize(tile.canvas,{}, {blocks:true,text:true});}
  catch(error){result=await worker.recognize(tile.canvas);}
  const lines=v3Lines(result.data);
  const direct=v2CandidatesFromResult(result.data,tile);
  const local=[
    ...v3DirectCandidates(lines,tile.canvas,0,tile.canvas),
    ...v3RegionCandidates(lines,tile.canvas,0,tile.canvas)
  ].map(candidate=>({
    ...candidate,
    x:tile.sx+candidate.x/tile.scaleX,
    y:tile.sy+candidate.y/tile.scaleY
  }));
  return [...direct,...local];
}
