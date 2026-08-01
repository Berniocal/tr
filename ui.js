function conditionalReason(id){
  if(id==="FR13") return "Kouř nemá v ruce žádný Oheň.";
  if(id==="FR41") return "Válečná loď nemá v ruce žádnou Potopu.";
  if(id==="FR45") return "Bojová vzducholoď nemá Armádu nebo je v ruce Počasí.";
  return "Nesplněná podmínka karty.";
}
function actionLabel(id){
  const a=state.actions[id];
  if(!a) return "Nenastaveno";
  if(id==="FR49"){
    return `${BY_ID[a.target]?.cs||"?"} → ${SUITS[a.suit]||"?"}`;
  }
  return BY_ID[a.target]?.cs||"Nenastaveno";
}
function maxAllowed(){
  return state.selected.includes("FR28")?8:7;
}
function extraNecromancerValid(){
  if(state.selected.length<=7) return true;
  if(!state.selected.includes("FR28")) return false;
  return state.selected.some(id=>id!=="FR28" && ["army","leader","wizard","beast"].includes(BY_ID[id].suit));
}
function canAdd(id){
  if(state.selected.includes(id)) return true;
  const next=[...state.selected,id];
  if(next.length<=7) return true;
  if(next.length>8) return false;
  if(!next.includes("FR28")) return false;
  return next.some(x=>x!=="FR28" && ["army","leader","wizard","beast"].includes(BY_ID[x].suit));
}
function saveState(){
  storageSet("tr_state",JSON.stringify({selected:state.selected,actions:state.actions}));
}
function loadState(){
  try{
    const s=JSON.parse(storageGet("tr_state"));
    if(s?.selected && Array.isArray(s.selected)){
      state.selected=s.selected.filter(id=>BY_ID[id]).slice(0,8);
      state.actions=s.actions&&typeof s.actions==="object"?s.actions:{};
    }
  }catch(e){}
}
function render(){
  document.documentElement.dataset.theme=state.theme;
  document.getElementById("themeBtn").textContent=state.theme==="dark"?"☀":"☾";
  renderFilters();
  renderLibrary();
  const result=new RealmHand(state.selected,state.actions).calculate();
  lastResult=result;
  document.getElementById("total").textContent=result.total;
  document.getElementById("count").textContent=state.selected.length;
  document.getElementById("limit").textContent=maxAllowed();
  renderNotice(result);
  renderHand(result);
  saveState();
}
function renderFilters(){
  const items=[["all","Vše"],...SUIT_ORDER.map(s=>[s,SUITS[s]])];
  document.getElementById("filters").innerHTML=items.map(([id,name])=>
    `<button class="chip ${state.filter===id?"active":""}" data-filter="${id}">${name}</button>`
  ).join("");
}
function renderLibrary(){
  const q=state.search.trim().toLocaleLowerCase("cs");
  const cards=CARDS.filter(c=>(state.filter==="all"||c.suit===state.filter)&&(!q||c.cs.toLocaleLowerCase("cs").includes(q)||c.en.toLowerCase().includes(q)));
  const el=document.getElementById("library");
  if(!cards.length){el.innerHTML='<div class="empty">Žádná karta neodpovídá hledání.</div>';return;}
  el.innerHTML=cards.map(c=>`
    <button class="cardpick s-${c.suit} ${state.selected.includes(c.id)?"selected":""}" data-id="${c.id}" title="${escapeHtml(c.rule)}">
      <div class="title"><span>${escapeHtml(c.cs)}</span><span class="strength">${c.strength}</span></div>
      <div class="type">${SUITS[c.suit]} · ${c.id.replace("FR","")}${state.selected.includes(c.id)?" · ✓ v ruce":""}</div>
    </button>`).join("");
}
function renderNotice(result){
  const el=document.getElementById("notice");
  let text="",cls="notice";
  if(state.selected.length===0) text="Vyber karty ze seznamu vlevo.";
  else if(state.selected.length<7) text=`Pro běžnou ruku ještě chybí ${7-state.selected.length} ${7-state.selected.length===1?"karta":"karty"}. Průběžné skóre je ${result.total}.`;
  else if(state.selected.length===8 && !extraNecromancerValid()){text="Osmá karta není platná pro Nekromanta.";cls+=" warn";}
  else text=`Ruka je připravená. Celkem ${result.total} bodů.`;
  el.innerHTML=`<div class="${cls}">${text}</div>`;
}
function renderHand(result){
  const el=document.getElementById("hand");
  if(!result.cards.length){el.innerHTML='<div class="empty">Zatím tu nejsou žádné karty.</div>';return;}
  el.innerHTML=result.cards.map(c=>{
    const special=ACTION_IDS.has(c.id);
    const bonus=c.bonusPoints?` · bonus ${signed(c.bonusPoints)}`:"";
    const penalty=c.penaltyPoints?` · postih ${signed(c.penaltyPoints)}`:"";
    const copied=c.magic && (["FR51","FR52","FR53"].includes(c.id))
      ? `<span class="magic">jako ${escapeHtml(c.effectiveDisplayName)}</span>`:"";
    const changed=c.magic && !["FR51","FR52","FR53"].includes(c.id)
      ? `<span class="magic">${SUITS[c.effectiveSuit]}</span>`:"";
    let status="";
    if(c.blanked) status=`<div class="ruleline bad"><strong>VYMAZÁNA:</strong> ${escapeHtml(c.blankReason)}</div>`;
    else if(c.penaltyCleared) status=`<div class="ruleline good"><strong>Postih odstraněn.</strong></div>`;
    return `<article class="handcard s-${c.effectiveSuit} ${c.blanked?"blanked":""}">
      <div class="handtop">
        <div class="suitbar"></div>
        <div class="handmain">
          <div class="handname">${escapeHtml(c.displayName)} ${copied}${changed}</div>
          <div class="breakdown">${c.blanked?"0 bodů":`základ ${c.effectiveStrength}${bonus}${penalty}`}</div>
        </div>
        <div class="cardpoints">${c.points}</div>
      </div>
      ${special?`<div class="ruleline"><strong>Schopnost:</strong> ${escapeHtml(actionLabel(c.id))}</div>`:""}
      ${status}
      <div class="ruleline">${escapeHtml(c.rule)}</div>
      <div class="handactions">
        ${special?`<button class="btn small" data-action="${c.id}">Nastavit</button>`:""}
        <button class="btn small danger" data-remove="${c.id}">Odebrat</button>
      </div>
    </article>`;
  }).join("");
}
function signed(n){return n>0?`+${n}`:`${n}`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
