'use strict';
async function readOfficeFile(file,appendText,recognizeImage,loadScript) {
 const bytes=new Uint8Array(await file.arrayBuffer()),name=file.name.toLowerCase();
 if(/\.(xlsx|xls|csv|tsv|doc)$/.test(name))await loadScript('xlsx.full.min.js','XLSX');
 if(name.endsWith('.doc')){appendText(readLegacyDoc(bytes));return;}
 if(/\.(xlsx|xls|csv|tsv)$/.test(name)){
  const wb=XLSX.read(bytes,{type:'array',cellDates:true,dateNF:'yyyy-mm-dd'});
  for(const sn of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,dateNF:'yyyy-mm-dd',defval:''});appendText(rows.map(row=>row.join('\t')).join('\n'));}
 }
 if(/\.(docx|xlsx)$/.test(name)){
  await loadScript('fflate.min.js','fflate');
  let total=0;
  const entries=fflate.unzipSync(bytes,{filter:entry=>{total+=entry.originalSize;if(total>100*1024*1024)throw new Error('解壓縮內容超過100 MB，請先分割檔案。');return /^(?:word\/document\.xml|word\/media\/|xl\/media\/)/.test(entry.name);}});
  if(name.endsWith('.docx')){
   const xml=entries['word/document.xml'];if(!xml)throw new Error('無法讀取 Word 文件內容，請確認為有效的 .docx 檔。');
   const documentXml=new DOMParser().parseFromString(new TextDecoder().decode(xml),'application/xml');
   if(documentXml.getElementsByTagName('parsererror').length)throw new Error('Word 文件格式損毀，請重新另存。');
   const plain=node=>Array.from(node.getElementsByTagNameNS('*','t')).map(t=>t.textContent).join('');
   const body=documentXml.getElementsByTagNameNS('*','body')[0],lines=[];
   const walk=node=>{for(const child of Array.from(node.children)){if(child.localName==='tbl'){for(const row of Array.from(child.getElementsByTagNameNS('*','tr')))lines.push(Array.from(row.children).filter(c=>c.localName==='tc').map(plain).join('\t'));}else if(child.localName==='p')lines.push(plain(child));else walk(child);}};
   if(body)walk(body);appendText(lines.join('\n'));
  }
  for(const [n,data] of Object.entries(entries))if(/\/(?:media)\/.*\.(png|jpe?g|webp|bmp|gif)$/i.test(n)){
   const url=URL.createObjectURL(new Blob([data]));try{appendText(await recognizeImage(url));}finally{URL.revokeObjectURL(url);}
  }
 }
}
function readLegacyDoc(bytes) {
 const cfb=XLSX.CFB.read(bytes,{type:'array'}),find=n=>cfb.FileIndex.find(e=>e.name===n)?.content;
 const word=find('WordDocument');if(!word)throw new Error('無法讀取 .doc，請在 Word 另存成 .docx 後再試。');
 const u16=(a,p)=>a[p]|a[p+1]<<8,u32=(a,p)=>(a[p]|a[p+1]<<8|a[p+2]<<16|a[p+3]<<24)>>>0;
 if(u16(word,10)&0x0100)throw new Error('Word 檔案有密碼，請先解除密碼。');
 const table=find(u16(word,10)&0x0200?'1Table':'0Table');if(!table)throw new Error('此舊版 .doc 不支援，請另存成 .docx。');
 const fc=u32(word,0x1a2),length=u32(word,0x1a6);let pos=fc;const end=fc+length;
 if(end>table.length)throw new Error('Word 文件索引損毀，請另存成 .docx。');
 while(pos<end&&table[pos]===1)pos+=3+u16(table,pos+1);
 if(table[pos]!==2)throw new Error('無法讀取此舊版 Word，請另存成 .docx。');
 const size=u32(table,pos+1),count=(size-4)/12;pos+=5;
 if(!Number.isInteger(count)||count<0||pos+size>table.length)throw new Error('Word 文件索引格式有誤。');
 let text='';const limit=u32(word,0x4c);
 for(let i=0;i<count;i++){
  const start=u32(table,pos+4*i),stop=Math.min(u32(table,pos+4*(i+1)),limit);if(stop<=start)continue;
  const piece=pos+4*(count+1)+8*i,offset=u32(table,piece+2),compressed=!!(offset&0x40000000),at=(offset&0x3fffffff)/(compressed?2:1),length=(stop-start)*(compressed?1:2);
  if(at+length>word.length)throw new Error('Word 文字資料不完整。');text+=new TextDecoder(compressed?'windows-1252':'utf-16le').decode(word.slice(at,at+length));
 }
 if(!text.trim())throw new Error('舊版 Word 沒有可讀文字；若內含掃描圖片，請另存為 .docx 或 PDF。');
 return text.replace(/[\r\x07\x0b\x0c]/g,'\n').replace(/[\x00-\x08\x0e-\x1f]/g,'');
}
