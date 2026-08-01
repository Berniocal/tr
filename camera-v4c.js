async function v4WorkerResult(worker,canvas){
  try{return await worker.recognize(canvas,{}, {blocks:true,text:true});}
  catch(error){return await worker.recognize(canvas);}
}

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
      if(labels[message.status])setScanStatus(labels[message.status],4+(Number(message.progress)||0)*10);
    }});
    await worker.setParameters({
      tessedit_pageseg_mode:"11",preserve_interword_spaces:"1",user_defined_dpi:"300",
      tessedit_char_whitelist:""
    });

    const base=v3BaseCanvas(scanImageSource);
    const known=new Map(),unknown=[];
    const rotations=[];
    for(let turns=0;turns<4;turns++)rotations.push({turns,canvas:v3RotateCanvas(base,turns)});

    for(let i=0;i<rotations.length;i++){
      if(run!==scanRunId)return;
      const {turns,canvas}=rotations[i];
      setScanStatus(`Čtu názvy a text karet — otočení ${turns*90}°…`,15+i*13);
      const result=await v4WorkerResult(worker,canvas);
      const observation=v4RecognizeData(result.data,canvas,turns,base);
      for(const candidate of observation.candidates){
        if(candidate.id)v4MergeKnown(known,candidate);
        else v4MergeUnknown(unknown,candidate,base);
      }
    }

    let unresolved=v4RemoveUnknownNearKnown(unknown,known,base);
    let observedCount=known.size+unresolved.length;

    /* Když běžné OCR nenašlo většinu očekávané ruky, proběhne samostatný
       průchod jen pro čísla v levém horním kroužku. */
    if(observedCount<5){
      await worker.setParameters({
        tessedit_pageseg_mode:"11",tessedit_char_whitelist:"0123456789",preserve_interword_spaces:"0"
      });
      for(let i=0;i<rotations.length;i++){
        if(run!==scanRunId)return;
        const {turns,canvas}=rotations[i];
        setScanStatus(`Dohledávám čísla v kroužcích — otočení ${turns*90}°…`,68+i*7);
        const result=await v4WorkerResult(worker,canvas);
        for(const anchor of v4StrengthAnchors(result.data,canvas,turns,base)){
          const candidate=v4AnchorCandidate(anchor);
          if(candidate.id)v4MergeKnown(known,candidate);
          else v4MergeUnknown(unresolved,candidate,base);
        }
      }
      await worker.setParameters({tessedit_char_whitelist:"",preserve_interword_spaces:"1"});
    }

    unresolved=v4RemoveUnknownNearKnown(unresolved,known,base);
    const all=[...known.values(),...unresolved]
      .sort((a,b)=>a.y-b.y||a.x-b.x)
      .slice(0,8);
    scanCandidates=all;
    renderScanCandidates();

    const recognized=all.filter(item=>item.id).length;
    const uncertain=all.length-recognized;
    if(all.length){
      const suffix=uncertain?` ${uncertain} ${uncertain===1?"kartu se nepodařilo určit":"karty se nepodařilo určit"}.`:"";
      setScanStatus(`Spolehlivě rozpoznáno ${recognized} z ${all.length}.${suffix}`,100);
    }else{
      setScanStatus("Nepodařilo se získat dostatek shodných znaků. Žádná karta nebyla automaticky doplněna.",100);
    }
  }catch(error){
    console.error(error);
    if(run===scanRunId)setScanStatus(`Rozpoznání selhalo: ${error.message||"neznámá chyba"}`,0);
  }finally{
    if(worker)try{await worker.terminate()}catch(error){}
    if(run===scanRunId)setScanBusy(false);
  }
}
