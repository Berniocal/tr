(function(){
  if(!BY_ID.FR54){
    const jester={
      id:"FR54",
      cs:"Šašek",
      en:"Jester",
      suit:"wizard",
      strength:3,
      rule:"+3 za každou další kartu v ruce s lichou základní silou. Nebo +50, mají-li všechny karty v ruce lichou základní sílu."
    };
    CARDS.push(jester);
    BY_ID.FR54=jester;
  }

  const originalScoreBonus=RealmHand.prototype.scoreBonus;
  RealmHand.prototype.scoreBonus=function(card){
    if(card.id==="FR54"){
      const oddCount=this.active().filter(x=>Math.abs(x.effectiveStrength)%2===1).length;
      return oddCount===this.cards().length?50:Math.max(0,(oddCount-1)*3);
    }
    return originalScoreBonus.call(this,card);
  };
})();
