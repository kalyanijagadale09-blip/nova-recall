/* NOVA Recall: on-device engine for the mobile/PWA build.
   Mirrors the Python server (nova/*.py) endpoint for endpoint, storing everything in the phone's localStorage,
   so the same interface (app.js) runs with no server. */
(function(){
"use strict";
const STOP=new Set("a an the of in on at to for and or is are was were be been being it its this that these those with as by from which who whom what when where how can could will would should may might do does did has have had into than then so such not no also their there they them his her he she we you i if but about over under between using used use called known more most other each any all both one two while until".split(" "));
const INTERVALS={1:0,2:1,3:3,4:7,5:14,6:30};
const STARTER=`# Operating Systems

Process: an instance of a program that is currently being executed
Thread: the smallest unit of execution within a process
Deadlock: a situation where processes wait forever for resources held by each other

Q: What are the four necessary conditions for deadlock?
A: Mutual exclusion, hold and wait, no preemption, and circular wait

Q: What is the difference between a process and a thread?
A: A process has its own memory space while threads of the same process share memory

- Round robin scheduling gives each process a fixed time quantum in turns.
- Paging divides physical memory into fixed-size frames to avoid external fragmentation.
- A semaphore is a synchronization variable used to control access to shared resources.

# Data Structures

Stack - a linear structure that follows last in first out order
Queue - a linear structure that follows first in first out order
Binary search runs in logarithmic time but requires a sorted array.
A hash table maps keys to values using a hash function for fast lookup.
`;
const LS=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v===null?d:v}catch(e){return d}};
const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const ymd=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>ymd(new Date());
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
let notes=LS("nova_notes",null);if(notes===null)notes=STARTER;
const S={progress:LS("nova_progress",{}),history:LS("nova_history",[]),mistakes:LS("nova_mistakes",{}),state:LS("nova_state",{})};

/* ---- grading (nova/grading.py) ---- */
const stem=w=>{for(const s of ["ing","ed","es","ly","s"])if(w.endsWith(s)&&w.length-s.length>=3)return w.slice(0,-s.length);return w};
function kws(t){const o=[];for(const w of (t.toLowerCase().match(/[a-z0-9]+/g)||[])){if(STOP.has(w)||(w.length<=2&&!/^\d+$/.test(w)))continue;o.push([stem(w),w])}return o}
function ukws(t){const seen=new Set();return kws(t).filter(([s])=>!seen.has(s)&&seen.add(s))}
function sim(a,b){if(a===b)return 1;if(a.length<4||b.length<4)return 0;const bg=s=>{const r=[];for(let i=0;i<s.length-1;i++)r.push(s.slice(i,i+2));return r};
  const A=bg(a),B=bg(b),used=new Array(B.length).fill(false);let m=0;for(const x of A){const j=B.findIndex((y,k)=>!used[k]&&y===x);if(j>=0){used[j]=true;m++}}return 2*m/(A.length+B.length)}
const matches=(s,pool)=>pool.some(p=>sim(s,p)>=.8);
function grade(card,reply){const exp=ukws(card.answer);if(!exp.length)return{verdict:"wrong",hit:[],missed:[],marks:0};
  const given=kws(reply).map(x=>x[0]);const hit=exp.filter(([s])=>matches(s,given)).map(x=>x[1]),missed=exp.filter(([s])=>!matches(s,given)).map(x=>x[1]);
  const sc=hit.length/exp.length,verdict=sc>=.6?"correct":sc>=.3?"partial":"wrong";return{verdict,hit,missed,marks:{correct:2,partial:1,wrong:0}[verdict]}}
const isCloze=c=>c.question.startsWith("Fill in the blank");
function hint(c,l){const k=ukws(c.answer).map(x=>x[1]);if(!k.length)return"Think about the definition in your notes.";const f=k[0];
  if(isCloze(c))return l===1?`It starts with ${f[0]} and has ${f.length} letters.`:`It starts with ${f.slice(0,3)}.`;
  return l===1?`The answer has ${k.length} key terms. One starts with ${f[0]}.`:`One key term is ${f}.`}
function mnemonic(a){const parts=a.split(/[,;]\s*/).map(s=>s.replace(/^and\s+/i,"").trim()).filter(Boolean);if(parts.length<3||parts.length>7)return"";
  return parts.map(p=>{const k=kws(p)[0];return(k?k[1]:p)[0].toUpperCase()}).join("")}
function makeOpts(c,cards){let same=cards.filter(x=>x.id!==c.id&&isCloze(x)===isCloze(c)&&x.answer.toLowerCase()!==c.answer.toLowerCase()).map(x=>x.answer);
  same=[...new Set(same)].sort((a,b)=>Math.abs(a.length-c.answer.length)-Math.abs(b.length-c.answer.length)).slice(0,6);const wrong=shuffle(same).slice(0,3);
  if(wrong.length<3)return null;const options=shuffle([c.answer,...wrong]);return{options,correct:options.indexOf(c.answer)}}
const plain=c=>c.question.replace("Fill in the blank: ","").replace("_____","...");
function narrate(c){if(isCloze(c))return c.question.replace("Fill in the blank: ","").replace("_____",c.answer);const m=c.question.match(/^What is (.+)\?$/);return m?`${m[1]} is ${c.answer}.`:`${c.question} ${c.answer}.`}
const letter=p=>p>=85?"A":p>=70?"B":p>=55?"C":p>=40?"D":"F";

/* ---- notes -> cards (nova/notes.py) ---- */
function hash(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return"c"+(h>>>0).toString(36)}
const mk=(topic,kind,q,a)=>({id:hash(q+"|"+a),topic,kind,question:q.trim(),answer:a.trim()});
function cloze(s){if(s.split(/\s+/).length<6)return null;const c=(s.match(/[A-Za-z][A-Za-z\-']+/g)||[]).filter(w=>!STOP.has(w.toLowerCase())&&w.length>=5);if(!c.length)return null;
  const t=c.reduce((a,b)=>b.length>a.length?b:a);return["Fill in the blank: "+s.replace(new RegExp("\\b"+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b"),"_____"),t]}
function parse(text){const cards=[];let topic="Notes";const L=text.split("\n");let i=0;
  while(i<L.length){let line=L[i++].trim();if(!line)continue;
    if(line.startsWith("#")){topic=line.replace(/^#+/,"").trim()||topic;continue}
    let m=line.match(/^q\s*[:.)]\s*(.+)$/i);
    if(m){while(i<L.length&&!L[i].trim())i++;const a=i<L.length&&L[i].trim().match(/^a\s*[:.)]\s*(.+)$/i);if(a){i++;cards.push(mk(topic,"qa",m[1],a[1]))}continue}
    line=line.replace(/^([-*\u2022]\s+|\d+[.)]\s+)/,"");
    m=line.match(/^([^:]{2,40}?)(?:\s*(?:::|:|\u2014|\u2013)\s+|\s+-\s+)(.{12,})$/);
    if(m&&m[1].split(/\s+/).length<=6){cards.push(mk(topic,"def","What is "+m[1].trim()+"?",m[2]));continue}
    const c=cloze(line);if(c)cards.push(mk(topic,"cloze",c[0],c[1]))}
  const seen=new Set();return cards.filter(c=>!seen.has(c.id)&&seen.add(c.id))}
const cards=()=>parse(notes);

/* ---- store (nova/store.py) ---- */
const isDue=id=>!!S.progress[id]&&S.progress[id].due<=today();
function record(c,v){const s=S.progress[c.id]||{box:1,seen:0,correct:0};s.seen++;
  if(v==="correct"){s.box=Math.min(6,s.box+1);s.correct++}else if(v==="wrong")s.box=1;
  const d=new Date();d.setDate(d.getDate()+INTERVALS[s.box]);s.due=ymd(d);S.progress[c.id]=s;
  if(v==="correct")delete S.mistakes[c.id];else{const o=S.mistakes[c.id]||{n:0};S.mistakes[c.id]={q:c.question,a:c.answer,t:c.topic,n:o.n+1}}
  put("nova_progress",S.progress);put("nova_mistakes",S.mistakes)}
function pick(all,count,topic,mode){const pool=all.filter(c=>!topic||topic==="ALL"||c.topic===topic);
  const due=pool.filter(c=>isDue(c.id)).sort((a,b)=>S.progress[a.id].box-S.progress[b.id].box),fresh=shuffle(pool.filter(c=>!S.progress[c.id]));
  const rest=shuffle(pool.filter(c=>!due.includes(c)&&!fresh.includes(c)));const chosen=due.concat(fresh,rest).slice(0,count);return mode==="deck"?chosen:shuffle(chosen)}
function logSession(r,n){const d=today();const row=S.history.find(h=>h.d===d);if(row){row.n+=n;row.r+=r}else S.history.push({d,n,r});S.history=S.history.slice(-60);put("nova_history",S.history)}
function streak(){const days=new Set(S.history.map(h=>h.d));const d=new Date();let n=0;if(!days.has(ymd(d)))d.setDate(d.getDate()-1);while(days.has(ymd(d))){n++;d.setDate(d.getDate()-1)}return n}
function summary(all){let seen=0,ok=0,mast=0,due=0;const topics={};
  all.forEach(c=>{const s=S.progress[c.id],t=topics[c.topic]||(topics[c.topic]={seen:0,ok:0});if(s){t.seen+=s.seen;t.ok+=s.correct;seen+=s.seen;ok+=s.correct;if(s.box>=5)mast++}if(!s||isDue(c.id))due++});
  return{seen,ok,mastered:mast,due,topics,accuracy:seen?Math.round(ok/seen*100):0}}
function dashboard(){const all=cards(),s=summary(all),week=[];
  for(let k=6;k>=0;k--){const d=new Date();d.setDate(d.getDate()-k);const h=S.history.find(x=>x.d===ymd(d))||{n:0,r:0};week.push({day:d.toLocaleDateString([],{weekday:"short"}),n:h.n,r:h.r})}
  const boxes=[0,0,0,0,0,0];all.forEach(c=>{boxes[S.progress[c.id]?S.progress[c.id].box-1:0]++});
  const topics=Object.entries(s.topics).filter(([,v])=>v.seen).map(([k,v])=>({topic:k,seen:v.seen,accuracy:Math.round(v.ok/v.seen*100)})).sort((a,b)=>a.accuracy-b.accuracy);
  return{streak:streak(),accuracy:s.accuracy,mastered:s.mastered,due:s.due,week,topics,boxes,mistakes:Object.entries(S.mistakes).map(([id,v])=>({id,...v}))}}
function examText(){const e=S.state.exam;if(!e)return"No exam saved yet. Add one in Study tools.";
  const days=Math.round((new Date(e.date+"T00:00:00")-new Date(new Date().toDateString()))/864e5);if(isNaN(days))return"Pick a valid exam date.";
  if(days<0)return e.name+" has passed.";if(days===0)return e.name+" is today. Good luck!";const due=summary(cards()).due;return`${days} days until ${e.name}. You have ${due} cards to review, about ${Math.ceil(due/days)} a day.`}

/* ---- assistant (nova/assistant.py) ---- */
const SITES={youtube:"https://www.youtube.com",google:"https://www.google.com",gmail:"https://mail.google.com",github:"https://github.com",wikipedia:"https://www.wikipedia.org","google meet":"https://meet.google.com",maps:"https://maps.google.com",whatsapp:"https://web.whatsapp.com"};
const tidy=x=>Math.round(x*1e6)/1e6;
function calc(t){t=t.replace(/,/g,"");let m=t.match(/square root of\s+(\d+(?:\.\d+)?)/);if(m)return tidy(Math.sqrt(+m[1]));
  m=t.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)\s*of\s*(\d+(?:\.\d+)?)/);if(m)return tidy(m[1]/100*m[2]);
  t=t.replace(/\b(calculate|compute|what is|what's|whats|equals?|please)\b/g," ").replace(/to the power of|raised to/g,"**").replace(/multiplied by|\btimes\b|\binto\b/g,"*").replace(/divided by|\bover\b/g,"/").replace(/\bplus\b|\band\b/g,"+").replace(/\bminus\b/g,"-").replace(/(?<=\d)\s*x\s*(?=\d)/g,"*");
  if(!/\d/.test(t)||!/[+\-*\/%]/.test(t)||!/^[\d\s.+\-*\/%()]+$/.test(t))return null;
  const tk=t.match(/\d+(?:\.\d+)?|\*\*|[+\-*\/%()]/g);let i=0;
  const prim=()=>{const x=tk[i++];if(x==="("){const v=ex();i++;return v}if(x==="-")return -prim();if(x===undefined||!/^\d/.test(x))throw 0;return +x};
  const pw=()=>{let b=prim();if(tk[i]==="**"){i++;const e=pw();if(Math.abs(e)>1000)throw 0;b=Math.pow(b,e)}return b};
  const term=()=>{let v=pw();while(["*","/","%"].includes(tk[i])){const o=tk[i++],r=pw();if(o==="/"&&r===0)throw 0;v=o==="*"?v*r:o==="/"?v/r:v%r}return v};
  const ex=()=>{let v=term();while(tk[i]==="+"||tk[i]==="-"){const o=tk[i++],r=term();v=o==="+"?v+r:v-r}return v};
  try{const v=ex();return i<tk.length||!isFinite(v)?null:tidy(v)}catch(e){return null}}
async function wiki(q){const s=await(await fetch("https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&origin=*&search="+encodeURIComponent(q))).json();
  if(!s[1].length)return null;const p=await(await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/"+encodeURIComponent(s[1][0].replace(/ /g,"_")))).json();
  return(p.extract||"").split(/(?<=[.!?])\s+/).slice(0,2).join(" ")||null}
const norm=s=>s.toLowerCase().replace(/[\u2018\u2019\u02bc`]/g,"'").replace(/[.,!?;]+$/g,"").replace(/\s+/g," ").trim().replace(/^(hey |ok |okay )?nova[, ]*/,"").replace(/^(can|could|would) you (please )?/,"").replace(/^please /,"").trim();
const gq=q=>"https://www.google.com/search?q="+encodeURIComponent(q);
async function route(text){const t=norm(text);let m;const now=new Date();
  if(/^(hello|hi|hey)\b/.test(t))return{say:"Hello! Ask me the time, a calculation, to search the web, or to quiz you."};
  if(/\b(what time|the time|current time|time now|time is it|time please)\b/.test(t)||t==="time")return{say:"It's "+now.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})};
  if(/\b(the date|todays date|today's date|what day|current date|date today|date now)\b/.test(t)||t==="date")return{say:"Today is "+now.toLocaleDateString([],{weekday:"long",day:"numeric",month:"long",year:"numeric"})};
  if(m=t.match(/(?:start|set)(?: a)?(?: focus| study)? timer(?: for)? (\d+)/)||t.match(/(?:start|set)(?: a)? (\d+) minute (?:focus |study )?timer/))return{say:`Timer started for ${m[1]} minutes.`,action:{type:"timer",minutes:+m[1]}};
  if(/start (a )?(pomodoro|focus)/.test(t))return{say:"Focus timer started.",action:{type:"timer",minutes:25}};
  if(m=t.match(/remind me (?:in (\d+) minutes? )?to (.+?)(?: in (\d+) minutes?)?$/)){const n=+(m[1]||m[3]||10);return{say:`Okay, I'll remind you to ${m[2]} in ${n} minutes.`,action:{type:"remind",text:m[2],minutes:n}}}
  if(/exam|countdown/.test(t))return{say:examText()};
  if(/quiz me|(start|begin).*(quiz|session)/.test(t))return{say:"Starting your quiz.",action:{type:"quiz"}};
  if(/progress|dashboard|streak/.test(t)){const s=summary(cards());return{say:`You have a ${streak()} day streak, ${s.accuracy} percent accuracy, ${s.mastered} cards mastered and ${s.due} to review.`,action:{type:"tab",tab:"dash"}}}
  if(m=t.match(/^(?:open|launch|go to)\s+(.+)/)){const k=m[1].replace(/^the /,"");return SITES[k]?{say:"Opening "+k+".",link:SITES[k]}:{say:"Searching for "+k+".",link:gq(k)}}
  if(m=t.match(/^play\s+(.+?)(?: on youtube)?$/))return{say:"Searching YouTube for "+m[1]+".",link:"https://www.youtube.com/results?search_query="+encodeURIComponent(m[1])};
  if(m=t.match(/^(?:search|google|look up)(?: for)?\s+(.+)/))return{say:"Searching the web for "+m[1]+".",link:gq(m[1])};
  const c=calc(t);if(c!==null)return{say:"The answer is "+c+"."};
  if(m=t.match(/^(?:who is|who was|what is|what are|what was|tell me about|define|explain)\s+(.+)/)){try{const w=await wiki(m[1].replace(/^(a|an|the)\s+/,""));if(w)return{say:w}}catch(e){return{say:"I couldn't reach Wikipedia. Check your internet connection."}}}
  return{say:"I'm not sure about that. I've added a web search link below if you want it.",link:gq(t),noopen:true}}

/* ---- PDF import (pdf.js loaded on demand) ---- */
const PDFV="3.11.174";
const loadPdf=()=>new Promise((ok,no)=>{if(window.pdfjsLib)return ok(window.pdfjsLib);const s=document.createElement("script");
  s.src=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFV}/pdf.min.js`;s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFV}/pdf.worker.min.js`;ok(pdfjsLib)};
  s.onerror=()=>no(new Error("PDF library needs internet"));document.head.append(s)});
const toLines=txt=>txt.replace(/\s+/g," ").split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>{const n=s.split(/\s+/).length;return n>=7&&n<=32&&/^[A-Z0-9]/.test(s)&&/[a-z]/.test(s)});
window.NOVA_PDF=async file=>{const lib=await loadPdf();const doc=await lib.getDocument({data:await file.arrayBuffer()}).promise;const out=[];
  for(let p=1;p<=Math.min(doc.numPages,40)&&out.length<150;p++){const tc=await(await doc.getPage(p)).getTextContent();for(const l of toLines(tc.items.map(i=>i.str).join(" ")))if(out.length<150)out.push(l)}
  if(out.length){notes=notes.replace(/\s*$/,"")+"\n\n# "+file.name.replace(/\.pdf$/i,"")+"\n"+out.join("\n")+"\n";put("nova_notes",notes)}return{count:out.length,cards:cards().length}};

/* ---- the API (same paths and shapes as nova/server.py) ---- */
const rich=(c,all,mode)=>{const o={...c,keywords:ukws(c.answer).map(x=>x[1]),hints:[hint(c,1),hint(c,2)],mnemonic:mnemonic(c.answer),plain:plain(c)};if(mode==="mcq")o.mcq=makeOpts(c,all);return o};
const find=id=>cards().find(c=>c.id===id);
window.NOVA_LOCAL=true;
window.NOVA_API=async(path,b={})=>{b=b||{};
  switch(path){
    case"/notes":return{text:notes,count:cards().length};
    case"/notes/save":notes=b.text||"";put("nova_notes",notes);return{count:cards().length};
    case"/notes/append":notes=notes.replace(/\s*$/,"")+"\n\n"+(b.text||"").trim()+"\n";put("nova_notes",notes);return{count:cards().length};
    case"/topics":{const all=cards();return{topics:[...new Set(all.map(c=>c.topic))],concepts:all.map(c=>({id:c.id,label:plain(c).slice(0,70)}))}}
    case"/session":{const all=cards(),mode=b.mode||"std";return{cards:pick(all,+b.count||6,b.topic,mode).map(c=>rich(c,all,mode))}}
    case"/grade":{const c=find(b.id);return c?grade(c,b.reply||""):{error:"unknown card"}}
    case"/record":{const c=find(b.id);if(c)record(c,b.verdict||"wrong");return{ok:true}}
    case"/finish":{const res=b.results||[],right=res.filter(r=>r.verdict==="correct").length;if(res.length)logSession(right,res.length);
      const marks=res.reduce((s,r)=>s+(r.marks!==undefined?r.marks:{correct:2,partial:1,wrong:0}[r.verdict]),0),top=res.length*2,percent=top?Math.round(marks/top*100):0,map=Object.fromEntries(cards().map(c=>[c.id,c]));
      return{right,total:res.length,marks:b.mode==="exam"?marks/2:marks,max:top,percent,grade:letter(percent),review:res.filter(r=>r.verdict!=="correct"&&map[r.id]).map(r=>({question:plain(map[r.id]),answer:map[r.id].answer}))}}
    case"/teach":{const all=cards(),given=kws(b.text||"").map(x=>x[0]);let items=[];
      if((b.target||"").startsWith("C:")){const c=all.find(x=>x.id===b.target.slice(2));if(c)items=ukws(c.answer).map(([s,w])=>({label:w,hit:matches(s,given)}))}
      else items=all.filter(c=>"T:"+c.topic===b.target).map(c=>{const k=ukws(c.answer).map(x=>x[0]);return{label:plain(c).slice(0,48),hit:k.length>0&&k.filter(s=>matches(s,given)).length/k.length>=.5}});
      const covered=items.filter(i=>i.hit).length;return{items,covered,total:items.length,percent:items.length?Math.round(covered/items.length*100):0,missing:items.filter(i=>!i.hit).map(i=>i.label)}}
    case"/revision":return{items:cards().filter(c=>!b.topic||b.topic==="ALL"||"T:"+c.topic===b.topic).map(c=>({id:c.id,topic:c.topic,line:narrate(c),question:c.question,plain:plain(c),answer:c.answer}))};
    case"/dashboard":return dashboard();
    case"/mistakes/clear":S.mistakes={};put("nova_mistakes",S.mistakes);return{ok:true};
    case"/assist":return route(b.text||"");
    case"/exam":if(b.date){S.state.exam={name:b.name||"Your exam",date:b.date};put("nova_state",S.state)}return{exam:S.state.exam||null,text:examText()};
  }
  return{error:"not found"}};
})();
