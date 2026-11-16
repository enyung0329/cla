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
 for(const candidate of text.toUpperCase().match(/[A-Z][12]\d{8}/g)||[])if(validateTwId(candidate))return candidate;
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
async function recognizeTaiwanPassport(source,text,worker,base,status,data={}) {
 if(!/護照|PASSPORT|P\s*<\s*TWN/i.test(text)||!/TWN|CHINA|中華/i.test(text))return null;
 status.textContent='偵測到台灣護照，核對護照資料欄位中…';
 let image=source,url;
 if(typeof source==='string'){image=new Image();image.src=source;await image.decode();}
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 const lines=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
 const words=lines.flatMap(l=>l.words||[]);
 const surname=words.find(w=>/^[A-Z]{2,},$/.test(w.text));
 const englishLine=surname?lines.find(l=>l.words?.includes(surname)):null;
 const number=words.find(w=>/^\d{9}$/.test(w.text)&&w.bbox.x0>width*.35&&(!surname||w.bbox.y0<surname.bbox.y0));
 const baseline=englishLine?.baseline;
 const angle=baseline?Math.max(-.12,Math.min(.12,Math.atan2(baseline.y1-baseline.y0,baseline.x1-baseline.x0))):0;
 const cropPixels=rect=>{const [x,y,w,h]=rect,c=document.createElement('canvas'),scale=Math.min(3,2000/w);c.width=Math.ceil(w*scale);c.height=Math.ceil(h*scale);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.translate(c.width/2,c.height/2);ctx.scale(scale,scale);ctx.rotate(-angle);ctx.drawImage(image,-(x+w/2),-(y+h/2));return c;};
 const crop=region=>cropPixels([width*region[0],height*region[1],width*region[2],height*region[3]]);
 const eng=await Tesseract.createWorker('eng_best',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false});
 const fields={name:'',englishName:'',id:'',birth:'',passportNo:'',gender:''};
 try{
  const n=number?.bbox,pw=n?n.x1-n.x0:0,py=n?(n.y0+n.y1)/2:0;
  const read=async(c,mode,white)=>{await eng.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:white});return (await eng.recognize(c)).data.text.trim();};
  if(number)fields.passportNo=number.text;
  for(const key of ['id','birth']){
   const rect=number?[n.x0-.12*pw,py+(key==='id'?.52:.83)*pw,1.65*pw,.48*pw]:null;
   const c=rect?cropPixels(rect):crop(key==='id'?[.55,.466,.19,.04]:[.55,.52,.2,.045]);
   try{for(const mode of ['6','11']){const value=await read(c,mode,'');fields[key]=key==='id'?passportIdCandidate(value):passportMonthDate(value);if(fields[key])break;}
    if(!fields[key])for(const top of [0,.15,.30,.45,.6]){const strip=document.createElement('canvas');strip.width=c.width;strip.height=Math.ceil(c.height*.36);strip.getContext('2d').drawImage(c,0,c.height*top,c.width,c.height*.36,0,0,strip.width,strip.height);try{for(const mode of ['7','13']){const value=await read(strip,mode,'');fields[key]=key==='id'?passportIdCandidate(value):passportMonthDate(value);if(fields[key])break;}}finally{strip.width=strip.height=0;}if(fields[key])break;}
   }finally{c.width=c.height=0;}
   if(key==='id'&&!fields.id&&number)for(const offset of [.73,.64,.55,.85]){const tight=cropPixels([n.x0-.1*pw,py+offset*pw,1.5*pw,.24*pw]);try{for(const mode of ['7','13']){fields.id=passportIdCandidate(await read(tight,mode,''));if(fields.id)break;}}finally{tight.width=tight.height=0;}if(fields.id)break;}
  }
  if(!fields.id){
   const fast=await Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false});
   try{const rectangles=number?[[n.x0-.1*pw,py+.73*pw,1.5*pw,.24*pw],[n.x0-.1*pw,py+.64*pw,1.5*pw,.24*pw]]:[];rectangles.push([width*.55,height*.466,width*.19,height*.04]);
    for(const r of rectangles){const c=cropPixels(r);try{for(const mode of ['13','7']){await fast.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'});fields.id=passportIdCandidate((await fast.recognize(c)).data.text);if(fields.id)break;}}finally{c.width=c.height=0;}if(fields.id)break;}
   }finally{await fast.terminate();}
  }
  let nameRect;
  if(surname){const b=surname.bbox,h=b.y1-b.y0;nameRect=[b.x0-h*.25,b.y0-h*2.1,number?pw*.95:width*.18,h*1.95];}
  const chinese=await Tesseract.createWorker('chi_tra_best',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,workerBlobURL:false});
  const c=nameRect?cropPixels(nameRect):crop([.30,.375,.25,.043]);const padded=document.createElement('canvas');padded.width=c.width+80;padded.height=c.height+80;const pc=padded.getContext('2d');pc.fillStyle='#fff';pc.fillRect(0,0,padded.width,padded.height);pc.drawImage(c,40,40);
  try{await chinese.setParameters({tessedit_pageseg_mode:'7'});const value=normalizedText((await chinese.recognize(padded)).data.text);fields.name=(value.match(/[\u3400-\u9fff]{2,4}/)||[''])[0];
   if(nameRect){const [x,y,w,h]=nameRect;const nearby=words.filter(v=>v.confidence>=65&&/^[\u3400-\u9fff]+$/.test(v.text)&&v.bbox.x0>=x&&v.bbox.x1<=x+w&&(v.bbox.y0+v.bbox.y1)/2>=y&&(v.bbox.y0+v.bbox.y1)/2<=y+h).sort((a,b)=>a.bbox.x0-b.bbox.x0).map(v=>v.text).join('');if(/^[\u3400-\u9fff]{2,4}$/.test(nearby))fields.name=nearby;}
  }finally{c.width=c.height=padded.width=padded.height=0;await chinese.terminate();}
 }finally{await eng.terminate();}
 const english=(englishLine?.text||text).replace(/[—–-]+/g,'-').match(/\b([A-Z]{2,}),\s*([A-Z]+(?:\s*-\s*[A-Z]+)*)/m);if(english)fields.englishName=english[1]+','+english[2].replace(/\s/g,'');
 if(!fields.id)fields.id=(text.match(/\b[A-Z][12]\d{8}\b/)||[''])[0];
 if(!fields.name){const m=text.match(/(?:姓名[^\n]*\n)\s*([\u3400-\u9fff]{2,4})/);if(m)fields.name=m[1];}
 if(!fields.birth)fields.birth=passportMonthDate(text.match(/(?:Date of birth|出生日期)[\s\S]{0,80}/i)?.[0]||'');
 if(fields.id)fields.gender=fields.id[1]==='1'?'男':'女';
 if(!fields.passportNo){const m=text.match(/(?:Passport No\.?|護照號碼)[\s\S]{0,80}?\b(\d{9})\b/i);if(m)fields.passportNo=m[1];}
 if(!fields.name&&!fields.id&&!fields.passportNo)return null;
 return passportBlock(fields);
}
