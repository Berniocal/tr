async function recognizeScan(){
  if(!scanImageSource||scanBusy)return;
  const run=++scanRunId;
  setScanBusy(true);
  setScanStatus("Načítám rozpoznávání textu…",3);
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
      if(labels[message.status])setScanStatus(labels[message.status],5+(Number(message.progress)||0)*12);
    }});
    await worker.setParameters({
      tessedit_pageseg_mode:"11",preserve_interword_spaces:"1",user_defined_dpi:"300"
    });

    const base=v3BaseCanvas(scanImageSource);
    const found=new Map();
    const angles=[0,1,2,3];
    for(let i=0;i<angles.length;i++){
      if(run!==scanRunId)return;
      const turns=angles[i];
      const degrees=turns*90;
      setScanStatus(`Čtu fotografii otočenou o ${degrees}°…`,18+i*14);
      const rotated=v3RotateCanvas(base,turns);
      for(const candidate of await v3RecognizeCanvas(worker,rotated,turns,base))v2MergeCandidate(found,candidate);
      const target=found.has("FR28")?8:7;
      if(found.size>=target)break;
    }

    let target=found.has("FR28")?8:7;
    if(found.size<target){
      const tiles=v2MakeTiles(base,2,3,.22,"detailní");
      for(let i=0;i<tiles.length;i++){
        if(run!==scanRunId)return;
        setScanStatus(`Dohledávám malé nebo neostré názvy… ${i+1}/${tiles.length}`,74+(i/tiles.length)*22);
        for(const candidate of await v3RecognizeDetailTile(worker,tiles[i]))v2MergeCandidate(found,candidate);
        target=found.has("FR28")?8:7;
        if(found.size>=target)break;
      }
    }

    if(run!==scanRunId)return;
    scanCandidates=[...found.values()]
      .sort((a,b)=>a.y-b.y||a.x-b.x)
      .slice(0,8);
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
