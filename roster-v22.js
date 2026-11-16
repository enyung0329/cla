'use strict';
let roster = [];
function normalizedText(s) { return s.normalize('NFKC').replace(/\r/g,'').replace(/\\(?=\s*(?:\n|$))/g,'').replace(/\\([.])/g,'$1').replace(/[‐‑–—]/g,'-').replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g,'$1'); }
function parseBirthday(value) {
  value=normalizedText(value).trim();
  if(/^\d{6,7}$/.test(value))value=value.slice(0,-4)+'/'+value.slice(-4,-2)+'/'+value.slice(-2);
  let m=normalizedText(value).trim().match(/^(?:民國)?\s*(\d{1,4})[\/年.\-](\d{1,2})[\/月.\-](\d{1,2})日?$/);
  if(!m) return null;
  let y=+m[1]; if(y<1911)y+=1911;
  const d=new Date(y,+m[2]-1,+m[3]);
  return d.getFullYear()===y&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?d:null;
}
function rocBirthday(value) { const d=parseBirthday(value);return d?String(d.getFullYear()-1911).padStart(3,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0'):value; }
function isoBirthday(value) { const d=parseBirthday(value);return d?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'):''; }
function anniversary(d,years,months=0) {const start=new Date(d.getFullYear()+years,d.getMonth()+months,1);const last=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();return new Date(start.getFullYear(),start.getMonth(),Math.min(d.getDate(),last));}
function rosterAge(birth,end) {
  const bd=parseBirthday(birth),ed=parseBirthday(end);if(!bd||!ed||ed<bd)return null;
  let full=ed.getFullYear()-bd.getFullYear();if(ed<anniversary(bd,full))full--;
  return {full,rounded:full+(ed>=anniversary(bd,full,6)?1:0)};
}
function parseRosterText(raw) {
 let text=normalizedText(raw);const people=[];
 text=text.replace(/\[護照資料開始\]([\s\S]*?)\[護照資料結束\]/g,(_,block)=>{const p=parsePassportFields(block);if(p)people.push(p);return '';});
 // Anchors are birthdays, allowing name and ID to appear before or after them.
 const dates=[...text.matchAll(/(?:民國\s*)?\b\d{2,4}[\/年.\-]\d{1,2}[\/月.\-]\d{1,2}日?|\b\d{6,7}\b/g)].filter(m=>{if(!/^\d{6,7}$/.test(m[0]))return true;const start=text.lastIndexOf('\n',m.index)+1,end=text.indexOf('\n',m.index);const row=text.slice(start,end<0?text.length:end);return parseBirthday(m[0])&&(/生日|出生|[A-Z][12]\d{8}/i.test(row)||/[\u3400-\u9fff]{2,5}\s+\d{6,7}/.test(row));});
 for(let i=0;i<dates.length;i++) {
  const date=dates[i];let start=text.lastIndexOf('\n',date.index)+1,end=text.indexOf('\n',date.index);if(end<0)end=text.length;
  if(i&&dates[i-1].index>=start)start=dates[i-1].index+dates[i-1][0].length;
  if(i+1<dates.length&&dates[i+1].index<end)end=date.index+date[0].length;
  let line=text.slice(start,end);
  if(/出發|回國|去程日期|回程日期/.test(line)&&!/[A-Z][12]\d{8}/i.test(line))continue;
  // Include adjacent lines for vertical pasted forms without swallowing other records.
  const localNameText=line.replace(date[0],'').replace(/出生日期|出生年月日|生日|民國|性別|男|女/g,'');
  if(!/[A-Z][A-Z0-9]{5,11}/i.test(line)&&!/[\u3400-\u9fff]{2,}|[A-Za-z]+\s+[A-Za-z]+/.test(localNameText)) { start=i?dates[i-1].index+dates[i-1][0].length:0;end=i+1<dates.length?dates[i+1].index:text.length;line=text.slice(start,end); }
  const id=(line.match(/\b[A-Z][12]\d{8}\b/i)||line.match(/\b[A-Z]{2}\d{8}\b/i)||line.match(/\b[A-Z]{1,3}\d{5,10}\b/i)||[''])[0].toUpperCase();
  let clean=line.replace(date[0],' ').replace(id,' ').replace(/(?:民國|出生日期|出生年月日|生日|姓名|證號|身分證字號|身份證字號|護照號碼|居留證|本國人|外國人|性別|男|女|電話|地址|[：:,;|\t\d])/g,' ');
  const names=clean.match(/[\u3400-\u9fff]{2,5}/g)||[];
  const labeledName=line.match(/(?:要保人姓名|被保險人姓名|姓名)\s*[:：]\s*([^\n]+)/);
  let name=labeledName?labeledName[1].trim():(names[0]||((clean.match(/[A-Za-z]+(?:[ -][A-Za-z]+)+/)||[''])[0].trim()));
  people.push({nationality:/^[A-Z][12]\d{8}$/.test(id)?'本國人':id?'外國人':'',id,name,birth:rocBirthday(date[0]),gender:/女/.test(line)?'女':/男/.test(line)?'男':/^[A-Z][12]\d{8}$/.test(id)?(id[1]==='1'?'男':'女'):''});
 }
 // Preserve people with an ID but missing birthday for manual completion.
 for(const line of text.split('\n')) {
  const ids=[...line.matchAll(/\b[A-Z]{1,3}\d{5,10}\b/gi)];
  for(const match of ids) {
   const id=match[0].toUpperCase();if(people.some(p=>p.id.toUpperCase()===id))continue;
   if(/航班|去程|回程|計畫代號|預估保費/.test(line))continue;
   const name=(line.replace(match[0],'').replace(/姓名|證號|身分證字號|身份證字號|本國人|外國人|男|女/g,'').match(/[\u3400-\u9fff]{2,5}/)||[''])[0];
   people.push({nationality:/^[A-Z][12]\d{8}$/.test(id)?'本國人':'外國人',id,name,birth:'',gender:/女/.test(line)?'女':/男/.test(line)?'男':''});
  }
 }
 const phone=(text.match(/(?<![A-Z0-9])(?:(?:\+886[- ]?9\d{2}|09\d{2})[- ]?\d{3}[- ]?\d{3}|0[2-8][- ]?\d{3,4}[- ]?\d{4}(?:\s*(?:#|分機)\d+)?)(?!\d)/i)||[''])[0];
 const address=(text.match(/(?:地址|住址|通訊地址)\s*[:：]?\s*([^\n]+)/)||[])[1]||'';
 const flight=(label)=>((text.match(new RegExp('(?:'+label+')[^\\nA-Za-z]*([A-Za-z0-9]{2}\\s?\\d{2,4})','i'))||[])[1]||'').replace(/\s/g,'').toUpperCase();
 const bareFlights=text.split('\n').map(s=>s.trim()).filter(s=>/^[A-Z0-9]{2}\s?\d{2,4}$/i.test(s)).map(s=>s.replace(/\s/g,'').toUpperCase());
 const locationLabel=(text.match(/(?:旅遊地點|旅遊國家|目的地)\s*[:：]\s*([^\n]+)/)||[])[1];
 const countries=['日本','越南','韓國','南韓','泰國','中國大陸','香港','澳門','新加坡','馬來西亞','印尼','菲律賓','美國','加拿大','英國','法國','德國','義大利','意大利','瑞士','澳洲','紐西蘭','台灣','臺灣'];
 const destination=locationLabel?.trim()||countries.filter(c=>text.includes(c)).join('、');
 const countMatch=text.match(/([0-9]+|[一二兩三四五六七八九十百]+)\s*(?:個人|人)(?![\u3400-\u9fff])/);
 const chineseCount=s=>{const digits={一:1,二:2,兩:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};if(/^\d+$/.test(s))return +s;let sum=0,current=0;for(const c of s){if(c==='十'||c==='百'){sum+=(current||1)*(c==='十'?10:100);current=0;}else current=digits[c]||0;}return sum+current;};
 const total=countMatch?chineseCount(countMatch[1]):0;
 return {people,phone,address,destination,total,flightGo:flight('去程|出發航班')||bareFlights[0]||'',flightBack:flight('回程|回國航班')||bareFlights[1]||''};
}
function parsePassportFields(text) {
 const get=label=>((text.match(new RegExp('(?:^|\\n)'+label+'\\s*[:：]\\s*([^\\n]+)'))||[])[1]||'').trim();
 const id=get('身分證號'),name=get('中文姓名'),birth=get('出生日期'),passportNo=get('護照號碼'),englishName=get('英文姓名');
 if(!name&&!id&&!passportNo)return null;
 return {nationality:/^[A-Z][12]\d{8}$/.test(id)?'本國人':'',id,name,birth:rocBirthday(birth),gender:get('性別')||(/^[A-Z][12]\d{8}$/.test(id)?(id[1]==='1'?'男':'女'):''),passportNo,englishName};
}
function rosterIssues(p) {
 const a=rosterAge(p.birth,document.getElementById('endDate').value),issues=[];
 if(!p.name||!p.id||!p.nationality||!p.gender)issues.push('資料待補');
 if(!parseBirthday(p.birth))issues.push('生日待確認');
 if(p.nationality==='本國人'&&!validateTwId(p.id))issues.push('證號待確認');
 if(!a)issues.push('年齡待確認');else if(a.full<15)issues.push('未滿15足歲，請核對方案');
 return issues.join('；');
}
function renderRoster() {
 const body=document.getElementById('rosterBody');body.replaceChildren();
 roster.forEach((p,i)=>{
  const tr=document.createElement('tr');const cell=()=>{const td=document.createElement('td');tr.append(td);return td;};cell().textContent=i+1;
  for(const key of ['nationality','id','name','englishName','passportNo','birth','gender']) {
   const td=cell(),el=document.createElement(key==='nationality'||key==='gender'?'select':'input');
   if(el.tagName==='SELECT')for(const v of key==='nationality'?['','本國人','外國人']:['','男','女']){const o=document.createElement('option');o.value=v;o.textContent=v||'待確認';el.append(o);}
   el.value=p[key]||'';el.setAttribute('aria-label',`第${i+1}人 ${key}`);el.style.width=key==='englishName'?'180px':key==='birth'?'125px':key==='name'?'120px':'115px';
   el.addEventListener('change',()=>{p[key]=key==='birth'?rocBirthday(el.value):el.value.trim();renderRoster();syncRepresentative();});td.append(el);
  }
  const a=rosterAge(p.birth,document.getElementById('endDate').value);cell().textContent=a?a.rounded:'待確認';
  const td=cell();td.append(document.createTextNode(rosterIssues(p)));const del=document.createElement('button');del.textContent='刪除';del.type='button';del.onclick=()=>{roster.splice(i,1);renderRoster();syncRepresentative();};td.append(del);body.append(tr);
 });
}
function syncRepresentative() {
 document.getElementById('totalPeople').value=roster.length||'';
 const p=roster[0];if(!p)return;
 for(const [key,id] of [['name','policyHolderName'],['id','policyHolderID']])document.getElementById(id).value=p[key];
 document.getElementById('policyHolderBirth').value=isoBirthday(p.birth);
 document.getElementById('insuredRep').value=p.name;
}
function rosterNotification() {
 if(!roster.length)return '投保名冊（年齡以回國日計，滿六個月進位）：';
 return '投保名冊（年齡以回國日計，滿六個月進位）：\n'+roster.map((p,i)=>{
 const a=rosterAge(p.birth,document.getElementById('endDate').value);
 const fields=[i+1,p.nationality,p.id,p.name,p.birth,p.gender,a?a.rounded+'歲':''].map(v=>v===''?'待確認':v);
 const issues=rosterIssues(p);if(issues)fields.push(issues);
 if(p.passportNo)fields.push('護照號碼：'+p.passportNo);if(p.englishName)fields.push('英文姓名：'+p.englishName);
 return fields.join(' / ');
 }).join('\n');
}
document.getElementById('parseRoster').onclick=()=>{
 const parsed=parseRosterText(document.getElementById('rosterSource').value);
 if(parsed.people.length){roster=parsed.people;renderRoster();syncRepresentative();}
 for(const [key,id] of [['phone','contactPhone'],['address','address'],['destination','travelLocation'],['flightGo','flightGo'],['flightBack','flightBack']])if(parsed[key])document.getElementById(id).value=parsed[key];
 if(parsed.total)document.getElementById('totalPeople').value=parsed.total;
 const details=[parsed.destination&&'地點：'+parsed.destination,parsed.total&&'總人數：'+parsed.total,parsed.flightGo&&'去程：'+parsed.flightGo,parsed.flightBack&&'回程：'+parsed.flightBack].filter(Boolean);
 document.getElementById('rosterStatus').textContent=(parsed.people.length?`已建立 ${roster.length} 人名冊。`:'未辨識到旅客名冊，原名冊保留。')+details.join('；')+'。請核對全部欄位，未辨識資料可手動補上。';
};
document.getElementById('addRoster').onclick=()=>{roster.push({nationality:'',id:'',name:'',birth:'',gender:''});renderRoster();syncRepresentative();};
document.getElementById('endDate').addEventListener('change',renderRoster);
document.getElementById('endDate').addEventListener('input',renderRoster);
document.getElementById('exportRoster').onclick=()=>{
 const rows=[['序號','本國人/外國人','證號','姓名','英文姓名','護照號碼','民國生日','性別','年齡','核對事項'],...roster.map((p,i)=>[i+1,p.nationality,p.id,p.name,p.englishName||'',p.passportNo||'',p.birth,p.gender,rosterAge(p.birth,document.getElementById('endDate').value)?.rounded??'待確認',rosterIssues(p)])];
 const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='旺旺旅平名冊-v22.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
