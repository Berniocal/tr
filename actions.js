function toggleCard(id){
  const i=state.selected.indexOf(id);
  if(i>=0){
    state.selected.splice(i,1);
    delete state.actions[id];
    for(const [aid,a] of Object.entries(state.actions)) if(a?.target===id) delete state.actions[aid];
  }else{
    if(!canAdd(id)){toast("Do ruky lze přidat nejvýše 7 karet, případně 8 s Nekromantem.");return;}
    state.selected.push(id);
    if(ACTION_IDS.has(id)) setTimeout(()=>openAction(id),60);
  }
  render();
}
function openAction(id){
  currentActionId=id;
  draft={...(state.actions[id]||{})};
  document.getElementById("modalTitle").textContent=`Nastavit: ${BY_ID[id].cs}`;
  const body=document.getElementById("modalBody");
  if(id==="FR49"){
    const targets=state.selected.filter(x=>x!=="FR49");
    body.innerHTML=`
      <p>Kniha proměn změní pouze barvu jedné jiné karty.</p>
      <div class="field"><label>Karta</label><select id="targetSelect">
        <option value="">— nevybráno —</option>${targets.map(x=>`<option value="${x}" ${draft.target===x?"selected":""}>${escapeHtml(BY_ID[x].cs)}</option>`).join("")}
      </select></div>
      <div class="field"><label>Nová barva</label><select id="suitSelect">
        <option value="">— nevybráno —</option>${STANDARD_SUITS.map(s=>`<option value="${s}" ${draft.suit===s?"selected":""}>${SUITS[s]}</option>`).join("")}
      </select></div>`;
  }else{
    let options=[];
    if(id==="FR51") options=CARDS.filter(c=>COPY_SUIT_SHAPESHIFTER.has(c.suit));
    if(id==="FR52") options=CARDS.filter(c=>COPY_SUIT_MIRAGE.has(c.suit));
    if(id==="FR53") options=state.selected.filter(x=>x!=="FR53").map(x=>BY_ID[x]);
    if(id==="FR09"){
      const previewActions={...state.actions};
      delete previewActions.FR09;
      const previewHand=new RealmHand(state.selected,previewActions);
      previewHand.applyActions();
      options=previewHand.cards().filter(c=>c.id!=="FR09"&&["flood","flame"].includes(c.effectiveSuit)).map(c=>({
        id:c.id,cs:c.displayName,strength:c.effectiveStrength,suit:c.effectiveSuit
      }));
    }
    body.innerHTML=`
      <p>${id==="FR09"?"Vyber Potopu nebo Oheň, jehož postih Ostrov odstraní.":"Vyber kartu, kterou má schopnost použít."}</p>
      <div class="choicegrid">${options.length?options.map(c=>`
        <button class="choice s-${c.suit}" data-choice="${c.id}">
          ${escapeHtml(c.cs)} <span style="float:right">${c.strength}</span><br><small style="color:var(--muted)">${SUITS[c.suit]}</small>
        </button>`).join(""):'<div class="empty">Není dostupná žádná vhodná karta.</div>'}</div>`;
  }
  document.getElementById("modalBack").classList.add("show");
  document.body.style.overflow="hidden";
  highlightChoice();
}
function closeModal(){
  document.getElementById("modalBack").classList.remove("show");
  document.body.style.overflow="";
  currentActionId=null;draft={};
}
function highlightChoice(){
  document.querySelectorAll("[data-choice]").forEach(b=>{
    b.style.outline=b.dataset.choice===draft.target?"3px solid var(--accent)":"";
  });
}
function saveAction(){
  if(!currentActionId)return;
  if(currentActionId==="FR49"){
    const target=document.getElementById("targetSelect")?.value;
    const suit=document.getElementById("suitSelect")?.value;
    if(!target||!suit){toast("Vyber kartu i novou barvu.");return;}
    draft={target,suit};
  }
  if(!draft.target){toast("Vyber kartu, nebo použij „Nepoužít schopnost“.");return;}
  state.actions[currentActionId]={...draft};
  closeModal();render();
}
function clearAction(){
  if(currentActionId) delete state.actions[currentActionId];
  closeModal();render();
}
let toastTimer;
function toast(msg){
  const e=document.getElementById("toast");e.textContent=msg;e.classList.add("show");
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove("show"),2300);
}

document.getElementById("library").addEventListener("click",e=>{
  const b=e.target.closest("[data-id]");if(b)toggleCard(b.dataset.id);
});
document.getElementById("filters").addEventListener("click",e=>{
  const b=e.target.closest("[data-filter]");if(b){state.filter=b.dataset.filter;render();}
});
document.getElementById("search").addEventListener("input",e=>{state.search=e.target.value;renderLibrary();});
document.getElementById("hand").addEventListener("click",e=>{
  const r=e.target.closest("[data-remove]");if(r){toggleCard(r.dataset.remove);return;}
  const a=e.target.closest("[data-action]");if(a)openAction(a.dataset.action);
});
document.getElementById("clearBtn").addEventListener("click",()=>{
  if(state.selected.length && !confirm("Opravdu vymazat celou ruku?"))return;
  state.selected=[];state.actions={};render();
});
document.getElementById("exampleBtn").addEventListener("click",()=>{
  state.selected=["FR01","FR16","FR13","FR08","FR15","FR52","FR14"];
  state.actions={FR52:{target:"FR11"}};
  render();toast("Načten příklad z pravidel.");
});
document.getElementById("themeBtn").addEventListener("click",()=>{
  state.theme=state.theme==="dark"?"light":"dark";storageSet("tr_theme",state.theme);render();
});
document.getElementById("modalClose").addEventListener("click",closeModal);
document.getElementById("modalCancel").addEventListener("click",closeModal);
document.getElementById("modalSave").addEventListener("click",saveAction);
document.getElementById("actionClear").addEventListener("click",clearAction);
document.getElementById("modalBack").addEventListener("click",e=>{if(e.target.id==="modalBack")closeModal();});
document.getElementById("modalBody").addEventListener("click",e=>{
  const c=e.target.closest("[data-choice]");if(c){draft.target=c.dataset.choice;highlightChoice();}
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")closeModal();
});

loadState();
render();
