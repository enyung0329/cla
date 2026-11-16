'use strict';
function passportMonthDate(text) {
 const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 const m=text.toUpperCase().match(/(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{4})/);
 if(!m)return '';const value=m[3]+'-'+String(months.indexOf(m[2])+1).padStart(2,'0')+'-'+m[1].padStart(2,'0');return parseBirthday(value)?value:'';
}
function passportBlock(fields) {
 return '[護照資料開始]\n'+[['中文姓名',fields.name],['英文姓名',fields.englishName],['出生日期',fields.birth],['身分證號',fields.id],['護照號碼',fields.passportNo],['性別',fields.gender]].filter(([,v])=>v).map(([k,v])=>k+'：'+v).join('\n')+'\n[護照資料結束]';
}
function passportIdCandidate(text) {
 const matches=text.toUpperCase().replace(/\s/g,'').match(/[A-Z0-9]{10}/g)||[];
 for(const token of matches){
  if(/^[A-Z][12]\d{8}$/.test(token)&&validateTwId(token))return token;
  const letters={0:['O','Q','D'],1:['I','L'],2:['Z'],5:['S'],8:['B']};
  const numbers={O:'0',Q:'0',D:'0',I:'1',L:'1',Z:'2',S:'5',B:'8'};
  const suffix=token.slice(1).replace(/[OQDILZSB]/g,c=>numbers[c]);
  const candidates=(letters[token[0]]||[token[0]]).map(c=>c+suffix).filter(c=>/^[A-Z][12]\d{8}$/.test(c)&&validateTwId(c));
  if(candidates.length===1)return candidates[0];
 }
 return '';
}
async function recognizeTaiwanPassport(source,text,worker,base,status) {
 if(!/護照|PASSPORT|P\s*<\s*TWN/i.test(text)||!/TWN|CHINA|中華/i.test(text))return null;
 status.textContent='偵測到台灣護照，核對護照資料欄位中…';
 let image=source,url;
 if(typeof source==='string'){image=new Image();image.src=source;await image.decode();}
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 const crop=region=>{const c=document.createElement('canvas');c.width=Math.ceil(width*region[2]*3);c.height=Math.ceil(height*region[3]*3);c.getContext('2d').drawImage(image,width*region[0],height*region[1],width*region[2],height*region[3],0,0,c.width,c.height);return c;};
 const eng=await Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false});
 const fields={name:'',englishName:'',id:'',birth:'',passportNo:'',gender:''};
 try{
  // Relative data-page regions provide a second OCR pass for a full-page passport photo.
  for(const [key,region,white] of [['birth',[.55,.52,.2,.045],'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ '],['id',[.55,.466,.19,.04],'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'],['passportNo',[.55,.326,.17,.04],'0123456789']]){
   const c=crop(region);try{await eng.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:white});const value=(await eng.recognize(c)).data.text.trim();if(key==='birth')fields.birth=passportMonthDate(value);else if(key==='id'){fields.id=passportIdCandidate(value);if(!fields.id){await eng.setParameters({tessedit_pageseg_mode:'13'});fields.id=passportIdCandidate((await eng.recognize(c)).data.text);}}else fields.passportNo=(value.match(/\b\d{9}\b/)||[''])[0];}finally{c.width=c.height=0;}
  }
  const c=crop([.30,.375,.25,.043]);try{await worker.setParameters({tessedit_pageseg_mode:'7'});const value=normalizedText((await worker.recognize(c)).data.text);fields.name=(value.match(/[\u3400-\u9fff]{2,4}/)||[''])[0];}finally{c.width=c.height=0;await worker.setParameters({tessedit_pageseg_mode:'3'});}
 }finally{await eng.terminate();}
 const english=text.match(/(?:^|\n)\s*([A-Z]+),\s*([A-Z]+(?:\s*-\s*[A-Z]+)*)/m);if(english)fields.englishName=english[1]+','+english[2].replace(/\s/g,'');
 if(!fields.id)fields.id=(text.match(/\b[A-Z][12]\d{8}\b/)||[''])[0];
 if(!fields.name){const m=text.match(/(?:姓名[^\n]*\n)\s*([\u3400-\u9fff]{2,4})/);if(m)fields.name=m[1];}
 if(!fields.birth)fields.birth=passportMonthDate(text.match(/(?:Date of birth|出生日期)[\s\S]{0,80}/i)?.[0]||'');
 if(fields.id)fields.gender=fields.id[1]==='1'?'男':'女';
 if(!fields.passportNo){const m=text.match(/(?:Passport No\.?|護照號碼)[\s\S]{0,80}?\b(\d{9})\b/i);if(m)fields.passportNo=m[1];}
 if(!fields.name&&!fields.id&&!fields.passportNo)return null;
 return passportBlock(fields);
}
