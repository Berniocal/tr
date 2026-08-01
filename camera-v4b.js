function v4CandidatePool(anchor){
  const top=anchor.suit.ranked.slice(0,anchor.suit.confidence>=.62?1:2).map(x=>x.suit);
  let pool=CARDS.filter(card=>card.strength===anchor.strength&&(!top.length||top.includes(card.suit)));
  if(!pool.length)pool=CARDS.filter(card=>card.strength===anchor.strength);
  return pool;
}

function v4RankAnchor(anchor){
  const profiles=v3Profiles(),pool=v4CandidatePool(anchor),ranked=[];
  const topSuit=anchor.suit.ranked[0]?.suit||null;
  const secondSuit=anchor.suit.ranked[1]?.suit||null;
  for(const card of pool){
    const profile=profiles.get(card.id);
    const textResult=profile?v3ProfileScore(anchor.text,profile):{score:0,nameScore:0,ruleScore:0,matched:0};
    let suitScore=0;
    if(card.suit===topSuit)suitScore=.62+.38*anchor.suit.confidence;
    else if(card.suit===secondSuit)suitScore=.35*(1-anchor.suit.confidence);
    const score=.38+.31*suitScore+.20*textResult.nameScore+.14*textResult.ruleScore+
      Math.min(.08,textResult.matched*.025);
    ranked.push({card,score,textResult,suitScore});
  }
  ranked.sort((a,b)=>b.score-a.score);
  const best=ranked[0],second=ranked[1]||{score:0};
  const uniqueByEvidence=pool.length===1&&anchor.suit.confidence>=.62&&
    (best?.textResult.nameScore>=.35||best?.textResult.matched>=1||anchor.suit.confidence>=.82);
  const strongText=best&&(best.textResult.nameScore>=.72||
    (best.textResult.matched>=2&&best.textResult.ruleScore>=.34&&best.score-second.score>=.045));
  const accepted=!!best&&(uniqueByEvidence||strongText)&&best.score>=.66;
  return {ranked,best,second,accepted,uniqueByEvidence,strongText,pool};
}

function v4AnchorCandidate(anchor){
  const decision=v4RankAnchor(anchor);
  const suitName=anchor.suit.ranked[0]?.suit||null;
  const suitConfidence=anchor.suit.confidence;
  const candidateIds=decision.ranked.slice(0,8).map(item=>item.card.id);
  if(!decision.accepted){
    return {
      id:"",score:0,line:anchor.text.slice(0,140),x:anchor.x,y:anchor.y,
      manual:false,uncertain:true,candidateIds,
      evidence:{strength:anchor.strength,suit:suitName,suitConfidence},
      method:"neurčeno"
    };
  }
  const item=decision.best;
  return {
    id:item.card.id,score:Math.min(.99,item.score),line:anchor.text.slice(0,140),
    x:anchor.x,y:anchor.y,manual:false,candidateIds,
    evidence:{strength:anchor.strength,suit:suitName,suitConfidence},
    method:decision.uniqueByEvidence?"barva + síla":"barva + síla + text"
  };
}

function v4ValidateDirectCandidate(candidate,anchors){
  let nearest=null;
  for(const anchor of anchors){
    const distance=Math.hypot(candidate.x-anchor.x,candidate.y-anchor.y);
    if(!nearest||distance<nearest.distance)nearest={anchor,distance};
  }
  const diag=Math.hypot(v3CurrentBase?.width||1,v3CurrentBase?.height||1);
  if(nearest&&nearest.distance<diag*.18){
    const card=BY_ID[candidate.id],anchor=nearest.anchor;
    const topSuit=anchor.suit.ranked[0]?.suit;
    const hardSuit=anchor.suit.confidence>=.62;
    if(card.strength!==anchor.strength)return null;
    if(hardSuit&&topSuit&&card.suit!==topSuit)return null;
    candidate.score=Math.min(.99,candidate.score+.1+.1*anchor.suit.confidence);
    candidate.evidence={strength:anchor.strength,suit:topSuit,suitConfidence:anchor.suit.confidence};
    candidate.method="název + ověření";
    return candidate;
  }
  return candidate.score>=.91?candidate:null;
}

let v3CurrentBase=null;

function v4RecognizeData(data,canvas,turns,base){
  v3CurrentBase=base;
  const lines=v3Lines(data);
  const anchors=v4StrengthAnchors(data,canvas,turns,base);
  const candidates=anchors.map(v4AnchorCandidate);
  const direct=v3DirectCandidates(lines,canvas,turns,base)
    .map(candidate=>v4ValidateDirectCandidate(candidate,anchors))
    .filter(Boolean);
  return {anchors,candidates:[...candidates,...direct]};
}

function v4MergeKnown(map,candidate){
  if(!candidate.id)return;
  const old=map.get(candidate.id);
  if(!old||candidate.score>old.score)map.set(candidate.id,candidate);
}

function v4MergeUnknown(list,candidate,base){
  if(candidate.id)return;
  const radius=Math.hypot(base.width,base.height)*.075;
  const old=list.find(item=>Math.hypot(item.x-candidate.x,item.y-candidate.y)<radius);
  if(!old){list.push(candidate);return;}
  const oldCount=old.candidateIds?.length??99,newCount=candidate.candidateIds?.length??99;
  if(newCount<oldCount||candidate.evidence?.suitConfidence>(old.evidence?.suitConfidence||0)){
    Object.assign(old,candidate);
  }
}

function v4RemoveUnknownNearKnown(unknown,known,base){
  const radius=Math.hypot(base.width,base.height)*.09;
  return unknown.filter(item=>![...known.values()].some(card=>Math.hypot(item.x-card.x,item.y-card.y)<radius));
}

function v4RecommendedOptions(item){
  const recommended=(item.candidateIds||[]).filter(id=>BY_ID[id]);
  const rest=CARDS.map(card=>card.id).filter(id=>!recommended.includes(id));
  let html='<option value="">— neurčeno —</option>';
  if(recommended.length){
    html+='<optgroup label="Doporučené podle barvy a síly">'+recommended.map(id=>{
      const card=BY_ID[id];
      return `<option value="${id}" ${item.id===id?"selected":""}>${escapeHtml(card.cs)} · ${SUITS[card.suit]} · ${card.strength}</option>`;
    }).join("")+'</optgroup>';
  }
  html+='<optgroup label="Všechny karty">'+rest.map(id=>{
    const card=BY_ID[id];
    return `<option value="${id}" ${item.id===id?"selected":""}>${escapeHtml(card.cs)} · ${SUITS[card.suit]} · ${card.strength}</option>`;
  }).join("")+'</optgroup>';
  return html;
}

function renderScanCandidates(){
  const root=document.getElementById("scanResults");
  if(!scanCandidates.length){
    root.innerHTML='<div class="scanempty">Žádná karta nebyla spolehlivě rozpoznána. Aplikace raději nic nedoplnila, než aby kartu odhadla chybně.</div>';
    return;
  }
  root.innerHTML=scanCandidates.map((item,index)=>{
    const evidence=item.evidence||{};
    const suitText=evidence.suit?`${SUITS[evidence.suit]||evidence.suit} ${Math.round((evidence.suitConfidence||0)*100)} %`:"neurčena";
    const strengthText=Number.isFinite(evidence.strength)?String(evidence.strength):"neurčena";
    const meta=item.uncertain
      ?`Neurčeno · barva: ${suitText} · síla: ${strengthText}. Vyber jednu z doporučených možností.`
      :`${item.method||"OCR"} · shoda ${Math.round((item.score||0)*100)} % · barva: ${suitText} · síla: ${strengthText}`;
    return `
      <div class="scanrow" data-scan-row="${index}">
        <select class="scanselect" aria-label="Rozpoznaná karta">${v4RecommendedOptions(item)}</select>
        <button class="btn small danger" type="button" data-scan-remove="${index}">Odebrat</button>
        <div class="scanmeta">${escapeHtml(meta)}</div>
      </div>`;
  }).join("");
}
