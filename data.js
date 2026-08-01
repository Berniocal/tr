"use strict";

const SUITS = {
  land:"Země", flood:"Potopa", weather:"Počasí", flame:"Oheň", army:"Armáda",
  wizard:"Čaroděj", leader:"Vůdce", beast:"Tvor", weapon:"Zbraň", artifact:"Artefakt", wild:"Divoká"
};
const SUIT_ORDER = ["land","flood","weather","flame","army","wizard","leader","beast","weapon","artifact","wild"];

const CARDS = [
["FR01","Hora","Mountain","land",9,"+50, máš-li Kouř a Požár. Odstraňuje postih ze všech Potop."],
["FR02","Jeskyně","Cavern","land",6,"+25, máš-li Trpasličí pěchotu nebo Draka. Odstraňuje postih ze všeho Počasí."],
["FR03","Zvonice","Bell Tower","land",8,"+15, máš-li alespoň jednoho Čaroděje."],
["FR04","Les","Forest","land",7,"+12 za každého Tvora nebo za Elfí lučištníky."],
["FR05","Elementál země","Earth Elemental","land",4,"+15 za každou další Zemi."],
["FR06","Fontána života","Fountain of Life","flood",1,"Přidej nejvyšší základní sílu jedné Zbraně, Potopy, Ohně, Země nebo Počasí ve své ruce."],
["FR07","Bažina","Swamp","flood",18,"−3 za každou Armádu nebo Oheň."],
["FR08","Stoletá voda","Great Flood","flood",32,"Vymaže všechny Armády, Země kromě Hory a Ohně kromě Blesku."],
["FR09","Ostrov","Island","flood",14,"Odstraňuje postih z jedné Potopy nebo Ohně."],
["FR10","Elementál vody","Water Elemental","flood",4,"+15 za každou další Potopu."],
["FR11","Bouře","Rainstorm","weather",8,"+10 za každou Potopu. Vymaže všechny Ohně kromě Blesku."],
["FR12","Sněhová vánice","Blizzard","weather",30,"Vymaže všechny Potopy. −5 za každou Armádu, Vůdce, Tvora a Oheň."],
["FR13","Kouř","Smoke","weather",27,"Je vymazán, nemáš-li alespoň jeden Oheň."],
["FR14","Tornádo","Whirlwind","weather",13,"+40, máš-li Bouři a k ní Sněhovou vánici nebo Stoletou vodu."],
["FR15","Elementál vzduchu","Air Elemental","weather",4,"+15 za každé další Počasí."],
["FR16","Požár","Wildfire","flame",40,"Vymaže téměř všechny karty kromě vyjmenovaných chráněných typů a karet."],
["FR17","Svíčka","Candle","flame",2,"+100, máš-li Knihu proměn, Zvonici a alespoň jednoho Čaroděje."],
["FR18","Kovárna","Forge","flame",9,"+9 za každou Zbraň nebo Artefakt."],
["FR19","Blesk","Lightning","flame",11,"+30, máš-li Bouři."],
["FR20","Elementál ohně","Fire Elemental","flame",4,"+15 za každý další Oheň."],
["FR21","Rytířky","Knights","army",20,"−8, nemáš-li alespoň jednoho Vůdce."],
["FR22","Elfí lučištníci","Elven Archers","army",10,"+5, nemáš-li žádné Počasí."],
["FR23","Těžká jízda","Light Cavalry","army",17,"−2 za každou Zemi."],
["FR24","Trpasličí pěchota","Dwarvish Infantry","army",15,"−2 za každou jinou Armádu."],
["FR25","Hraničáři","Rangers","army",5,"+10 za každou Zemi. Odstraňují slovo Armáda ze všech postihů."],
["FR26","Sběratel","Collector","wizard",7,"Bonus za 3, 4 nebo 5 různých karet stejné barvy: +10, +40 nebo +100."],
["FR27","Pán šelem","Beastmaster","wizard",9,"+9 za každého Tvora. Odstraňuje postihy na všech Tvorech."],
["FR28","Nekromant","Necromancer","wizard",3,"Dovoluje přidat jako osmou kartu Armádu, Vůdce, Čaroděje nebo Tvora."],
["FR29","Nejvyšší mág","Warlock Lord","wizard",25,"−10 za každého dalšího Čaroděje nebo Vůdce."],
["FR30","Kouzelnice","Enchantress","wizard",5,"+5 za každou Zemi, Počasí, Potopu a Oheň."],
["FR31","Král","King","leader",8,"+5 za každou Armádu, nebo +20 za každou Armádu, máš-li Královnu."],
["FR32","Královna","Queen","leader",6,"+5 za každou Armádu, nebo +20 za každou Armádu, máš-li Krále."],
["FR33","Princezna","Princess","leader",2,"+8 za každou Armádu, Čaroděje nebo dalšího Vůdce."],
["FR34","Velitel","Warlord","leader",4,"Přidej součet základních sil všech Armád."],
["FR35","Císařovna","Empress","leader",15,"+10 za každou Armádu. −5 za každého dalšího Vůdce."],
["FR36","Jednorožec","Unicorn","beast",9,"+30 s Princeznou, jinak +15 s Císařovnou, Královnou nebo Kouzelnicí."],
["FR37","Bazilišek","Basilisk","beast",35,"Vymaže všechny Armády, Vůdce a další Tvory."],
["FR38","Válečný oř","Warhorse","beast",6,"+14, máš-li Vůdce nebo Čaroděje."],
["FR39","Drak","Dragon","beast",30,"−40, nemáš-li alespoň jednoho Čaroděje."],
["FR40","Hydra","Hydra","beast",12,"+28, máš-li Bažinu."],
["FR41","Válečná loď","Warship","weapon",23,"Je vymazána bez Potopy. Odstraňuje slovo Armáda z postihů na Potopách."],
["FR42","Magická hůl","Magic Wand","weapon",1,"+25, máš-li alespoň jednoho Čaroděje."],
["FR43","Kethský meč","Sword of Keth","weapon",7,"+10 s Vůdcem, nebo +40 s Kethským štítem a Vůdcem."],
["FR44","Elfský luk","Elven Longbow","weapon",3,"+30 s Elfími lučištníky, Velitelem nebo Pánem šelem."],
["FR45","Bojová vzducholoď","War Dirigible","weapon",35,"Je vymazána bez Armády nebo máš-li jakékoli Počasí."],
["FR46","Kethský štít","Shield of Keth","artifact",4,"+15 s Vůdcem, nebo +40 s Kethským mečem a Vůdcem."],
["FR47","Krystal řádu","Gem of Order","artifact",5,"Bonus za postupku základních sil: +10 až +150 podle délky."],
["FR48","Strom světa","World Tree","artifact",2,"+50, mají-li všechny nevymazané karty rozdílné barvy."],
["FR49","Kniha proměn","Book of Changes","artifact",3,"Může změnit barvu jedné jiné karty. Jméno, síla a text zůstávají."],
["FR50","Ochranná runa","Protection Rune","artifact",1,"Odstraňuje postihy ze všech karet v ruce."],
["FR51","Měňavec","Shapeshifter","wild",0,"Může kopírovat jméno a barvu Artefaktu, Vůdce, Čaroděje, Zbraně nebo Tvora ve hře."],
["FR52","Přelud","Mirage","wild",0,"Může kopírovat jméno a barvu Počasí, Armády, Země, Potopy nebo Ohně ve hře."],
["FR53","Dvojník","Doppelgänger","wild",0,"Může kopírovat jméno, barvu, základní sílu a postih jiné karty ve tvé ruce, ale ne bonus."]
].map(([id,cs,en,suit,strength,rule])=>({id,cs,en,suit,strength,rule}));

const BY_ID = Object.fromEntries(CARDS.map(c=>[c.id,c]));
const ACTION_IDS = new Set(["FR09","FR49","FR51","FR52","FR53"]);
const COPY_SUIT_SHAPESHIFTER = new Set(["artifact","leader","wizard","weapon","beast"]);
const COPY_SUIT_MIRAGE = new Set(["army","land","weather","flood","flame"]);
const STANDARD_SUITS = SUIT_ORDER.filter(x=>x!=="wild");

function storageGet(key){ try{return localStorage.getItem(key)}catch(e){return null} }
function storageSet(key,value){ try{localStorage.setItem(key,value)}catch(e){} }

let state = {
  selected: [],
  actions: {},
  filter: "all",
  search: "",
  theme: storageGet("tr_theme") || "light"
};
let currentActionId = null;
let draft = {};
let lastResult = null;
let scanImageSource = null;
let scanCandidates = [];
let scanBusy = false;
let tesseractLoader = null;
let scanRunId = 0;
