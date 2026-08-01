function cloneCard(base){
  return {
    ...base,
    name: base.en,
    displayName: base.cs,
    originalSuit: base.suit,
    effectiveSuit: base.suit,
    effectiveName: base.en,
    effectiveDisplayName: base.cs,
    effectiveStrength: base.strength,
    effectId: base.id,
    penaltyEffectId: base.id,
    magic: false,
    blanked: false,
    penaltyCleared: false,
    blankReason: "",
    bonusPoints: 0,
    penaltyPoints: 0,
    points: base.strength
  };
}

class RealmHand {
  constructor(ids, actions){
    this.actions = actions || {};
    this.map = {};
    this.order = [];
    for(const id of ids){
      if(BY_ID[id] && !this.map[id]){
        this.map[id] = cloneCard(BY_ID[id]);
        this.order.push(id);
      }
    }
  }
  cards(){ return this.order.map(id=>this.map[id]).filter(Boolean); }
  get(id){ return this.map[id]; }
  active(){ return this.cards().filter(c=>!c.blanked); }
  containsName(name){ return this.active().some(c=>c.effectiveName===name); }
  countName(name){ return this.active().filter(c=>c.effectiveName===name).length; }
  containsId(id, allowBlanked=false){ const c=this.get(id); return !!c && (allowBlanked || !c.blanked); }
  containsSuit(suit){ return this.active().some(c=>c.effectiveSuit===suit); }
  containsSuitExcluding(suit,id){ return this.active().some(c=>c.id!==id && c.effectiveSuit===suit); }
  countSuit(suit){ return this.active().filter(c=>c.effectiveSuit===suit).length; }
  countSuitExcluding(suit,id){ return this.active().filter(c=>c.id!==id && c.effectiveSuit===suit).length; }
  armyWordCleared(card){
    return this.containsId("FR25",true) || (card.effectiveSuit==="flood" && this.containsId("FR41",true));
  }
  applyActions(){
    // Dvojník → Přelud → Měňavec → Kniha proměn → Ostrov
    const d=this.get("FR53");
    const da=this.actions.FR53;
    if(d && da?.target && this.get(da.target) && da.target!=="FR53"){
      const t=this.get(da.target);
      d.effectiveName=t.effectiveName;
      d.effectiveDisplayName=t.effectiveDisplayName;
      d.effectiveSuit=t.effectiveSuit;
      d.effectiveStrength=t.effectiveStrength;
      d.effectId=t.effectId;
      d.penaltyEffectId=t.penaltyEffectId;
      d.magic=true;
    }
    for(const id of ["FR52","FR51"]){
      const c=this.get(id), a=this.actions[id];
      if(!c || !a?.target || !BY_ID[a.target]) continue;
      const t=BY_ID[a.target];
      const allowed=id==="FR52"?COPY_SUIT_MIRAGE:COPY_SUIT_SHAPESHIFTER;
      if(allowed.has(t.suit)){
        c.effectiveName=t.en;
        c.effectiveDisplayName=t.cs;
        c.effectiveSuit=t.suit;
        c.magic=true;
      }
    }
    const b=this.get("FR49"), ba=this.actions.FR49;
    if(b && ba?.target && ba?.suit && this.get(ba.target) && ba.target!=="FR49" && STANDARD_SUITS.includes(ba.suit)){
      const t=this.get(ba.target);
      t.effectiveSuit=ba.suit;
      t.magic=true;
    }
    const island=this.get("FR09"), ia=this.actions.FR09;
    if(island && ia?.target && this.get(ia.target)){
      island.islandTarget=ia.target;
      this.get(ia.target).magic=true;
    }
  }
  clearPenalties(){
    for(const c of this.cards()){
      if(c.id==="FR50"){
        for(const t of this.cards()) t.penaltyCleared=true;
      }
      if(c.id==="FR01"){
        for(const t of this.cards()) if(t.effectiveSuit==="flood") t.penaltyCleared=true;
      }
      if(c.id==="FR02"){
        for(const t of this.cards()) if(t.effectiveSuit==="weather") t.penaltyCleared=true;
      }
      if(c.id==="FR27"){
        for(const t of this.cards()) if(t.effectiveSuit==="beast") t.penaltyCleared=true;
      }
      if(c.id==="FR09" && c.islandTarget && this.get(c.islandTarget)){
        const t=this.get(c.islandTarget);
        if(t.effectiveSuit==="flood" || t.effectiveSuit==="flame") t.penaltyCleared=true;
      }
    }
  }
  blanksBy(by,target){
    if(by.penaltyCleared) return false;
    const id=by.penaltyEffectId;
    switch(id){
      case "FR08":
        return (target.effectiveSuit==="army" && !this.armyWordCleared(by)) ||
          (target.effectiveSuit==="land" && target.effectiveName!=="Mountain") ||
          (target.effectiveSuit==="flame" && target.effectiveName!=="Lightning");
      case "FR11":
        return target.effectiveSuit==="flame" && target.effectiveName!=="Lightning";
      case "FR12":
        return target.effectiveSuit==="flood";
      case "FR16":
        return !(
          ["flame","wizard","weather","weapon","artifact","wild"].includes(target.effectiveSuit) ||
          ["Mountain","Great Flood","Island","Unicorn","Dragon"].includes(target.effectiveName)
        );
      case "FR37":
        return (target.effectiveSuit==="army" && !this.armyWordCleared(by)) ||
          target.effectiveSuit==="leader" ||
          (target.effectiveSuit==="beast" && target.id!==by.id);
      default:return false;
    }
  }
  conditionallyBlanked(card){
    if(card.penaltyCleared) return false;
    switch(card.penaltyEffectId){
      case "FR13": return !this.containsSuit("flame");
      case "FR41": return !this.containsSuit("flood");
      case "FR45": return (!this.containsSuit("army") && !this.armyWordCleared(card)) || this.containsSuit("weather");
      default:return false;
    }
  }
  recursivelyBlanked(card,stack=[]){
    const blankers=this.active().filter(by=>by.id!==card.id && this.blanksBy(by,card));
    if(!blankers.length) return false;
    for(const by of blankers){
      if(this.blanksBy(card,by)) return true;
      if(stack.includes(by.id)) return true;
    }
    for(const by of blankers){
      if(!this.recursivelyBlanked(by,[...stack,by.id])) return true;
    }
    return false;
  }
  applyBlanking(){
    const toBlank=[];
    for(const c of this.active()){
      if(this.recursivelyBlanked(c,[c.id])) toBlank.push(c);
    }
    for(const c of toBlank) c.blanked=true;

    let changed;
    do{
      changed=false;
      for(const c of this.active().sort((a,b)=>a.id.localeCompare(b.id))){
        if(this.conditionallyBlanked(c)){ c.blanked=true; changed=true; }
      }
    }while(changed);

    for(const c of this.cards()){
      if(!c.blanked) continue;
      if(this.conditionallyBlanked(c)){
        c.blankReason = conditionalReason(c.penaltyEffectId);
      }else{
        const by=this.active().find(x=>this.blanksBy(x,c));
        c.blankReason=by?`Vymazává karta ${by.effectiveDisplayName}.`:"Vymazání vzniklo vzájemným nebo řetězeným účinkem.";
      }
    }
  }
  scoreBonus(c){
    switch(c.id){
      case "FR01": return this.containsName("Smoke")&&this.containsName("Wildfire")?50:0;
      case "FR02": return this.containsName("Dwarvish Infantry")||this.containsName("Dragon")?25:0;
      case "FR03": return this.containsSuit("wizard")?15:0;
      case "FR04": return 12*this.countSuit("beast")+(this.containsName("Elven Archers")?12:0);
      case "FR05": return 15*this.countSuitExcluding("land",c.id);
      case "FR06":{
        let max=0;
        for(const x of this.active()) if(["weapon","flood","flame","land","weather"].includes(x.effectiveSuit)) max=Math.max(max,x.effectiveStrength);
        return max;
      }
      case "FR10": return 15*this.countSuitExcluding("flood",c.id);
      case "FR11": return 10*this.countSuit("flood");
      case "FR14": return this.containsName("Rainstorm")&&(this.containsName("Blizzard")||this.containsName("Great Flood"))?40:0;
      case "FR15": return 15*this.countSuitExcluding("weather",c.id);
      case "FR17": return this.containsName("Book of Changes")&&this.containsName("Bell Tower")&&this.containsSuit("wizard")?100:0;
      case "FR18": return 9*(this.countSuit("weapon")+this.countSuit("artifact"));
      case "FR19": return this.containsName("Rainstorm")?30:0;
      case "FR20": return 15*this.countSuitExcluding("flame",c.id);
      case "FR22": return this.containsSuit("weather")?0:5;
      case "FR25": return 10*this.countSuit("land");
      case "FR26":{
        const groups={};
        for(const x of this.active()){
          groups[x.effectiveSuit]??=new Set();
          groups[x.effectiveSuit].add(x.effectiveName);
        }
        let b=0;
        for(const set of Object.values(groups)){
          const n=set.size;b+=n===3?10:n===4?40:n>=5?100:0;
        }
        return b;
      }
      case "FR27": return 9*this.countSuit("beast");
      case "FR30": return 5*(this.countSuit("land")+this.countSuit("weather")+this.countSuit("flood")+this.countSuit("flame"));
      case "FR31": return (this.containsName("Queen")?20:5)*this.countSuit("army");
      case "FR32": return (this.containsName("King")?20:5)*this.countSuit("army");
      case "FR33": return 8*(this.countSuit("army")+this.countSuit("wizard")+this.countSuitExcluding("leader",c.id));
      case "FR34":{
        let n=0;for(const x of this.active()) if(x.effectiveSuit==="army") n+=x.effectiveStrength;return n;
      }
      case "FR35": return 10*this.countSuit("army");
      case "FR36": return this.containsName("Princess")?30:(this.containsName("Empress")||this.containsName("Queen")||this.containsName("Enchantress")?15:0);
      case "FR38": return this.containsSuit("leader")||this.containsSuit("wizard")?14:0;
      case "FR40": return this.containsName("Swamp")?28:0;
      case "FR42": return this.containsSuit("wizard")?25:0;
      case "FR43": return this.containsSuit("leader")?(this.containsName("Shield of Keth")?40:10):0;
      case "FR44": return this.containsName("Elven Archers")||this.containsName("Warlord")||this.containsName("Beastmaster")?30:0;
      case "FR46": return this.containsSuit("leader")?(this.containsName("Sword of Keth")?40:15):0;
      case "FR47": return gemBonus(this.active().map(x=>x.effectiveStrength));
      case "FR48":{
        const suits=this.active().map(x=>x.effectiveSuit);
        return new Set(suits).size===suits.length?50:0;
      }
      default:return 0;
    }
  }
  scorePenalty(c){
    if(c.penaltyCleared) return 0;
    switch(c.penaltyEffectId){
      case "FR07":{
        let n=this.countSuit("flame"); if(!this.armyWordCleared(c)) n+=this.countSuit("army"); return -3*n;
      }
      case "FR12":{
        let n=this.countSuit("leader")+this.countSuit("beast")+this.countSuit("flame");
        if(!this.armyWordCleared(c)) n+=this.countSuit("army"); return -5*n;
      }
      case "FR21": return this.containsSuit("leader")?0:-8;
      case "FR23": return -2*this.countSuit("land");
      case "FR24": return this.armyWordCleared(c)?0:-2*this.countSuitExcluding("army",c.id);
      case "FR29": return -10*(this.countSuit("leader")+this.countSuitExcluding("wizard",c.id));
      case "FR35": return -5*this.countSuitExcluding("leader",c.id);
      case "FR39": return this.containsSuit("wizard")?0:-40;
      default:return 0;
    }
  }
  calculate(){
    this.applyActions();
    this.clearPenalties();
    this.applyBlanking();
    let total=0;
    for(const c of this.cards()){
      if(c.blanked){c.points=0;continue;}
      c.bonusPoints=this.scoreBonus(c);
      c.penaltyPoints=this.scorePenalty(c);
      c.points=c.effectiveStrength+c.bonusPoints+c.penaltyPoints;
      total+=c.points;
    }
    return {total,cards:this.cards()};
  }
}

function gemBonus(values){
  const strengths=[...values].sort((a,b)=>a-b);
  let bonus=0, found=true;
  while(found){
    let run=[];
    for(const n of strengths){
      if(run.length && n===run[run.length-1]+1) run.push(n);
      else if(run.length<3 && !run.includes(n)) run=[n];
    }
    if(run.length<3){found=false;break;}
    for(const n of run) strengths.splice(strengths.indexOf(n),1);
    bonus += run.length===3?10:run.length===4?30:run.length===5?60:run.length===6?100:150;
  }
  return bonus;
}
