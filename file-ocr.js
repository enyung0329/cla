'use strict';
(() => {
 const input=document.getElementById('recognitionFiles'),button=document.getElementById('recognizeFiles'),status=document.getElementById('fileRecognitionStatus');
 const base=new URL('./vendor/',document.baseURI).href;
 let worker=null;
 const loaded=new Map();
 function loadScript(file,globalName) {
  if(window[globalName])return Promise.resolve(window[globalName]);
  if(!loaded.has(file))loaded.set(file,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=base+file;s.onload=()=>resolve(window[globalName]);s.onerror=()=>{loaded.delete(file);s.remove();reject(new Error('無法載入辨識元件，請確認 vendor 資料夾已完整上傳；首次請連網開啟網站完成離線快取。'));};document.head.append(s);}));
  return loaded.get(file);
 }
 async function recognizeImage(image) {
  await loadScript('tesseract.min.js','Tesseract');
  if(!worker)worker=await Tesseract.createWorker('chi_tra+eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false,logger:m=>{if(m.status)status.textContent='圖片辨識中：'+m.status+(Number.isFinite(m.progress)?' '+Math.round(m.progress*100)+'%':'');}});
  const result=await worker.recognize(image);
  return await recognizeTaiwanPassport(image,result.data.text,worker,base,status)||result.data.text;
 }
 async function readPdf(file,onPage) {
  await loadScript('pdf.min.js','pdfjsLib');pdfjsLib.GlobalWorkerOptions.workerSrc=base+'pdf.worker.min.js';
  let pdf;
  try {
   pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,isEvalSupported:false}).promise;
   for(let i=1;i<=pdf.numPages;i++){
    status.textContent=`讀取 ${file.name}：第 ${i} / ${pdf.numPages} 頁`;
    const page=await pdf.getPage(i),content=await page.getTextContent();let text='',lastY=null;
    for(const item of content.items){if(!('str' in item))continue;const y=item.transform[5];if(lastY!==null&&Math.abs(y-lastY)>3)text+='\n';text+=item.str+(item.hasEOL?'\n':' ');lastY=y;}
    if(text.trim().length<10){const viewport=page.getViewport({scale:1});const scale=Math.min(2.5,Math.sqrt(6000000/(viewport.width*viewport.height)));const view=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);try{await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;text=await recognizeImage(canvas);}finally{canvas.width=canvas.height=0;}}
    onPage(text);page.cleanup();
   }
  } finally {if(pdf)await pdf.destroy();}
 }
 button.onclick=async()=>{
  const files=Array.from(input.files||[]);if(!files.length){status.textContent='請先選擇圖片、PDF、Word 或 Excel 檔案。';return;}
  if(files.some(f=>f.size>30*1024*1024)){status.textContent='單一檔案請小於 30 MB，請先縮小或分割檔案。';return;}
  button.disabled=true;input.disabled=true;document.getElementById('parseRoster').disabled=true;
  let completed=0;const errors=[];let added=false;
  const appendText=text=>{if(!text.trim())return;const source=document.getElementById('rosterSource');source.value+=(source.value.trim()?'\n\n':'')+normalizedText(text).trim();added=true;};
  try {
   for(const file of files){
    try{status.textContent='讀取 '+file.name;
     if(/\.(docx|doc|xlsx|xls|csv|tsv)$/i.test(file.name))await readOfficeFile(file,appendText,recognizeImage,loadScript);
     else if(file.type==='application/pdf'||/\.pdf$/i.test(file.name))await readPdf(file,appendText);
     else if(/^image\/(png|jpeg|webp|bmp|gif)$/.test(file.type)||/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)){const url=URL.createObjectURL(file);try{appendText(await recognizeImage(url));}finally{URL.revokeObjectURL(url);}}
     else throw new Error('不支援此格式，請使用圖片、PDF、Word（.docx／.doc）或 Excel（.xlsx／.xls／.csv）。');
     completed++;
    }catch(e){errors.push(file.name+'：'+(e.name==='PasswordException'?'PDF 有密碼，請先解除密碼。':e.message||'辨識失敗，請重試。'));}
   }
   if(added)document.getElementById('parseRoster').onclick();
   status.textContent=`已處理 ${completed} / ${files.length} 個檔案。`+(added?'辨識文字已附加至下方並帶入欄位，請核對姓名、證號、生日。':'未取得文字，請改用清晰圖片或貼上文字。')+(errors.length?'\n'+errors.join('\n'):'');
  }finally{if(worker){try{await worker.terminate();}catch{}worker=null;}button.disabled=false;input.disabled=false;document.getElementById('parseRoster').disabled=false;}
 };
})();
