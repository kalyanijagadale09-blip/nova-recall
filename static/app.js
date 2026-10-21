"use strict";
/* NOVA Recall front end. All grading, scheduling and assistant logic lives in Python (nova/);
   this file handles the screen and the browser's speech engines. */
const $=id=>document.getElementById(id);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const api=window.NOVA_API||(async(path,body)=>{const r=await fetch("/api"+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const j=await r.json();if(j.error)throw new Error(j.error);return j});
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const LANG=navigator.language||"en-US";
const ICON={
  quiz:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  assist:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  cards:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M6 3h12"/>',
  teach:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  viva:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 12l2 2 4-4"/>',
  hands:'<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1"/><rect x="17" y="14" width="4" height="6" rx="1"/>',
  dash:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  tools:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  notes:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'};
const MIC='<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const VIEWS=[["quiz","Quiz"],["assist","Assistant"],["cards","Flashcards"],["teach","Teach it back"],["viva","Viva"],["hands","Hands-free"],["dash","Dashboard"],["tools","Study tools"],["notes","Notes"]];
const setStatus=t=>{$("status").textContent=t};
document.querySelectorAll(".mic").forEach(m=>{if(!m.firstChild)m.innerHTML=MIC});

/* ---------- navigation ---------- */
const nav=$("nav");
VIEWS.forEach(([id,label])=>{const b=el("button");b.id="t-"+id;b.innerHTML=`<svg viewBox="0 0 24 24">${ICON[id]}</svg>`;b.append(label);b.onclick=()=>show(id);nav.append(b)});
function show(name){cancelFlow();if(aRec){try{aRec.abort()}catch(e){}}
  VIEWS.forEach(([id])=>{$("v-"+id).hidden=id!==name;$("t-"+id).classList.toggle("on",id===name)});
  if(name==="dash")renderDash();if(name==="cards")initDeck();if(name==="tools")renderEx();if(name==="notes")loadNotes();
  if(["teach","viva","hands"].includes(name))fillSelects();setTimeout(resumeWake,300)}

/* ---------- speech ---------- */
let run=0,typedRes=null,finishHear=null,flowOn=false,cur=null,aRec=null,dict=null,Q=null;
function say(text,cb){if(!window.speechSynthesis){cb&&cb();return}
  speechSynthesis.cancel();let done=false;const fin=()=>{if(!done){done=true;cb&&cb()}};
  const u=new SpeechSynthesisUtterance(text.replace(/_____/g,"blank"));u.onend=fin;u.onerror=fin;
  speechSynthesis.speak(u);setTimeout(fin,Math.max(3000,text.length*95))}
const speakP=t=>new Promise(r=>say(t,r));
const stopSpeech=()=>{if(window.speechSynthesis)speechSynthesis.cancel()};
function stopRec(){if(cur){try{cur.abort()}catch(e){}cur=null}document.querySelectorAll(".mic.on").forEach(m=>m.classList.remove("on"))}
const setMic=(id,on)=>$(id).classList.toggle("on",on);
const chk=id=>{if(run!==id)throw"x"};
function cancelFlow(){run++;typedRes=null;stopRec();if(finishHear){try{finishHear()}catch(e){}}stopSpeech();flowOn=false;Q=null}
async function flow(fn){cancelFlow();pauseWake();const id=run;flowOn=true;
  try{await fn(id)}catch(e){if(e!=="x")console.error(e)}finally{if(run===id){flowOn=false;setTimeout(resumeWake,500)}}}
/* listen once: resolves with the transcript (or typed text). continuous=true for long explanations. */
function hear(o={}){const out=o.el||null,continuous=!!o.continuous,ms=o.ms||15000;
  return new Promise(res=>{let fin="",done=false,rec=null,stopped=false;const end=Date.now()+ms;
    const finish=v=>{if(done)return;done=true;clearTimeout(tt);cur=null;finishHear=null;typedRes=null;res((v||"").trim())};
    const tt=setTimeout(()=>{stopped=true;if(rec){try{rec.stop()}catch(e){finish(fin)}}else finish(fin)},ms);
    finishHear=()=>{stopped=true;if(rec){try{rec.stop()}catch(e){finish(fin)}}else finish(fin)};
    typedRes=t=>{stopped=true;try{rec&&rec.abort()}catch(e){}finish(t)};
    if(!SR){setStatus("Type your answer below");return}
    const start=()=>{rec=new SR();cur=rec;rec.lang=LANG;rec.interimResults=true;rec.continuous=continuous;const base=fin;
      rec.onresult=e=>{let all="",f="";for(let i=0;i<e.results.length;i++){all+=e.results[i][0].transcript+" ";if(e.results[i].isFinal)f+=e.results[i][0].transcript+" "}
        fin=(base+" "+f).trim();const shown=(base+" "+all).trim();if(out)out.textContent="\u201C"+shown+"\u201D";
        if(o.stopPhrases&&/((i'?m|i am) (done|finished)|that'?s (all|it))\W*$/i.test(shown))finishHear()};
      rec.onerror=e=>{if(e.error==="not-allowed"||e.error==="service-not-allowed"){stopped=true;setStatus("Microphone blocked. Allow it in the address bar, or type.")}};
      rec.onend=()=>{if(done)return;if(continuous&&!stopped&&Date.now()<end){start();return}finish(fin)};
      try{rec.start()}catch(e){finish(fin)}};
    start()})}
[["typed","typedIn"],["tForm","tIn"],["vForm","vIn"]].forEach(([f,i])=>$(f).onsubmit=e=>{e.preventDefault();const t=$(i).value.trim();$(i).value="";
  if(t&&typedRes)typedRes(t)});
const CMDS={stop:["stop","quit","exit","end session"],hint:["hint","clue","give me a hint"],repeat:["repeat","again","say that again"],skip:["skip","next","pass"],
  giveup:["i don't know","i dont know","don't know","no idea","give up","show answer"]};
const cmdOf=t=>{const r=t.toLowerCase().trim().replace(/[.!?,]+$/,"");for(const k in CMDS)if(CMDS[k].includes(r))return k;return null};

/* ---------- quiz ---------- */
function renderQ(q){const h=$("question");h.textContent="";q.split("_____").forEach((part,i,a)=>{h.append(part);if(i<a.length-1)h.append(el("span","blank"))})}
function feedback(cls,title,body){const f=$("feedback");f.hidden=false;f.className="fb "+cls;f.textContent="";f.append(el("b","",title));if(body!==undefined)f.append(body)}
function drawPills(c,res){const p=$("pills");p.textContent="";c.keywords.forEach(w=>{const e=el("span","pill",w);
  if(res)e.classList.add(res.hit.includes(w)?"hit":"miss");p.append(e)})}
function drawOpts(c,struck,chosen){const p=$("pills");p.textContent="";c.mcq.options.forEach((o,k)=>{const e=el("span","pill opt",`${"ABCD"[k]}. ${o}`);
  if(struck.includes(k))e.classList.add("struck");
  if(chosen!==null&&chosen!==undefined){if(k===c.mcq.correct)e.classList.add("hit");else if(k===chosen)e.classList.add("miss")}p.append(e)})}
const optsSpeech=c=>c.mcq.options.map((o,k)=>`Option ${"ABCD"[k]}: ${o}.`).join(" ");
const LET={a:["a","eh","ay","first","one"],b:["b","be","bee","second","two"],c:["c","see","sea","third","three"],d:["d","dee","fourth","four"]};
async function optionOf(text,c){const t=text.toLowerCase().trim().replace(/[.!?,]+$/,"").replace(/^((the|option|answer|it's|its|i choose|i pick|is)\s+)+/,"").trim();
  for(let k=0;k<4;k++)if(LET["abcd"[k]].includes(t))return k;
  const g=await api("/grade",{id:c.id,reply:text});return g.verdict==="correct"?c.mcq.correct:-1}
function qchk(id){chk(id);if(Q&&Q.stop)throw"stop"}
async function demoReply(c,i,mcq){const k=i%3;let reply;
  if(mcq)reply="abcd"[k===1?c.mcq.options.findIndex((_,j)=>j!==c.mcq.correct):c.mcq.correct];
  else{const w=c.answer.split(/\s+/);reply=k===0?c.answer:k===1?w.slice(0,Math.max(1,Math.ceil(w.length/2))).join(" "):"I am not sure, maybe something about scheduling"}
  setStatus("Demo answer");setMic("mic",true);await sleep(900);$("heard").textContent="\u201C"+reply+"\u201D";await sleep(1200);setMic("mic",false);return reply}

async function askCard(id,c,i,n){
  const exam=Q.mode==="exam",mcq=Q.mode==="mcq"&&!!c.mcq,struck=[];let chosen=null,g=null,verdict=null,spoken="",hints=0,silent=0;
  $("topic").textContent=c.topic+(exam?" \u00b7 timed exam":"");$("counter").textContent=`Question ${i+1} of ${n}`;$("bar").style.width=(i/n*100)+"%";
  renderQ(c.question);$("feedback").hidden=true;$("heard").textContent="";
  if(mcq)drawOpts(c,struck,null);else if(exam)$("pills").textContent="";else drawPills(c,null);
  setStatus("Reading the question");await speakP(`Question ${i+1}. ${c.topic}. ${c.question}`+(mcq?" "+optsSpeech(c):""));qchk(id);
  let tick=null;if(exam){let left=40;tick=setInterval(()=>{left=Math.max(left-1,0);$("counter").textContent=`Question ${i+1} of ${n} \u00b7 ${left}s`},1000)}
  try{while(true){
    let reply;
    if(Q.demo)reply=await demoReply(c,i,mcq);
    else{setMic("mic",true);setStatus("Listening");reply=await hear({el:$("heard"),ms:exam?40000:14000});setMic("mic",false)}
    qchk(id);
    if(!reply){silent++;if(exam||silent>=3){verdict="wrong";spoken=exam?"Time's up.":`Moving on. The answer is: ${c.answer}`;break}
      await speakP("I didn't catch that. Answer, or say hint, repeat or skip.");qchk(id);continue}
    const cmd=cmdOf(reply);
    if(cmd){
      if(exam&&["hint","skip","repeat"].includes(cmd)){await speakP("That isn't allowed in exam mode.");qchk(id);continue}
      if(cmd==="stop")throw"stop";
      if(cmd==="skip"){await speakP("Skipped.");qchk(id);return null}
      if(cmd==="repeat"){await speakP(mcq?optsSpeech(c):c.question);qchk(id);continue}
      if(cmd==="giveup"){verdict="wrong";spoken=`No problem. The answer is: ${c.answer}`;break}
      if(cmd==="hint"){hints++;let h;
        if(mcq){const cand=c.mcq.options.map((_,k)=>k).filter(k=>k!==c.mcq.correct&&!struck.includes(k));
          if(cand.length>1){struck.push(cand[0]);drawOpts(c,struck,null);h=`I've ruled out option ${"ABCD"[cand[0]]}.`}}
        h=h||c.hints[Math.min(hints,2)-1];feedback("part","Hint",h);await speakP(h);qchk(id);continue}}
    if(mcq){const k=await optionOf(reply,c);qchk(id);if(k<0){await speakP("Please say A, B, C or D.");qchk(id);continue}
      chosen=k;const ok=k===c.mcq.correct;verdict=ok?(hints?"partial":"correct"):"wrong";
      spoken=ok?(hints?"Right, with a little help.":"Correct!"):`Not quite. The answer is option ${"ABCD"[c.mcq.correct]}: ${c.answer}`;break}
    g=await api("/grade",{id:c.id,reply});qchk(id);verdict=g.verdict==="correct"&&hints?"partial":g.verdict;
    spoken=verdict==="correct"?["Correct!","That's right.","Spot on."][i%3]:verdict==="partial"?(g.missed.length?`Partly right. You missed: ${g.missed.slice(0,4).join(", ")}. Full answer: ${c.answer}`:`Good, with a little help. Full answer: ${c.answer}`):`Not quite. The answer is: ${c.answer}`;
    break}}finally{clearInterval(tick)}
  const mn=verdict!=="correct"?(c.mnemonic||""):"";
  if(mcq)drawOpts(c,struck,chosen===null?-1:chosen);else if(!exam)drawPills(c,g||{hit:[],missed:c.keywords});
  if(exam){feedback("","Answer recorded");spoken="Answer recorded."}
  else{feedback(verdict==="correct"?"ok":verdict==="partial"?"part":"bad",verdict==="correct"?"Correct":verdict==="partial"?"Partly right":"Not quite",
    verdict==="correct"?"Highlighted words are the key terms you covered.":`Answer: ${c.answer}`+(mn?`   Memory trick: ${mn}`:""));
    if(mn)spoken+=` Memory trick: ${mn.split("").join(" ")}.`}
  if(!Q.demo)await api("/record",{id:c.id,verdict});
  await speakP(spoken);chk(id);await sleep(exam?300:800);chk(id);return verdict}

async function startQuiz(demo){const mode=$("mode").value;let data;
  try{data=await api("/session",{mode,count:demo?4:mode==="exam"?8:6})}catch(e){setStatus("Server error: "+e.message);return}
  if(!data.cards.length){$("question").textContent="Add some notes first (Notes tab).";return}
  await flow(async id=>{Q={stop:false,demo,mode};const results=[],cards=data.cards;$("demoBadge").hidden=!demo;
    try{for(let i=0;i<cards.length;i++){if(Q.stop)break;const v=await askCard(id,cards[i],i,cards.length);if(v)results.push({id:cards[i].id,verdict:v})}}
    catch(e){if(e!=="stop")throw e}
    chk(id);const right=results.filter(r=>r.verdict==="correct").length;let msg=`You got ${right} of ${results.length} fully right.`,box=document.createElement("div");
    box.textContent="Cards you missed come back sooner. Cards you got right return in 1, 3, 7, 14 or 30 days.";
    if(!demo){const fin=await api("/finish",{results,mode:mode==="exam"?"exam":"std"});
      if(mode==="exam"&&results.length){msg=`Exam result: ${fin.marks} out of ${fin.total}, ${fin.percent} percent, grade ${fin.grade}.`;box=document.createElement("div");
        const ul=el("ul");fin.review.forEach(r=>ul.append(el("li","",`${r.question}  Answer: ${r.answer}`)));box.append(el("div","",fin.review.length?"Review these answers:":"No mistakes to review."),ul)}}
    $("bar").style.width="100%";$("pills").textContent="";$("heard").textContent="";$("counter").textContent="";$("demoBadge").hidden=true;
    $("topic").textContent="Session complete";$("question").textContent=msg;feedback(right===results.length&&results.length?"ok":"part","Next review",box);setStatus("Session finished");
    await speakP(msg+(results.length&&mode!=="exam"?" Review the topics you missed.":""))})}
$("start").onclick=()=>startQuiz(false);$("demo").onclick=()=>startQuiz(true);
const interrupt=w=>{if(Q&&typedRes)typedRes(w)};
$("hint").onclick=()=>interrupt("hint");$("skip").onclick=()=>interrupt("skip");
$("stop").onclick=()=>{if(Q){Q.stop=true;stopSpeech();if(finishHear)finishHear();if(typedRes)typedRes("")}};

/* ---------- flashcards ---------- */
let deck=[],di=0,flipped=false;
async function initDeck(){try{deck=(await api("/session",{mode:"deck",count:999})).cards}catch(e){deck=[]}di=0;flipped=false;drawCard()}
function drawCard(){if(!deck.length){$("fcText").textContent="No cards yet. Add some notes first.";$("fcTopic").textContent="";$("fcCount").textContent="";return}
  const c=deck[di];$("fcTopic").textContent=c.topic;$("fcCount").textContent=`Card ${di+1} of ${deck.length}`;
  $("fcText").textContent=flipped?c.answer:c.plain.replace("...","______");$("fc").classList.toggle("back",flipped)}
const fcGo=d=>{if(!deck.length)return;di=(di+d+deck.length)%deck.length;flipped=false;drawCard()};
const fcFlip=()=>{flipped=!flipped;drawCard()};
$("fc").onclick=fcFlip;$("fcFlip").onclick=fcFlip;$("fcNext").onclick=()=>fcGo(1);$("fcPrev").onclick=()=>fcGo(-1);
const fcMark=async v=>{if(deck.length){await api("/record",{id:deck[di].id,verdict:v});fcGo(1)}};
$("fcKnow").onclick=()=>fcMark("correct");$("fcAgain").onclick=()=>fcMark("wrong");
document.addEventListener("keydown",e=>{if($("v-cards").hidden||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
  if(e.key===" "){e.preventDefault();fcFlip()}else if(e.key==="ArrowRight")fcGo(1);else if(e.key==="ArrowLeft")fcGo(-1)});

/* ---------- selects ---------- */
async function fillSelects(){let d;try{d=await api("/topics")}catch(e){return}
  const tS=$("tSel"),vT=$("vTopic"),rT=$("raTopic");[tS,vT,rT].forEach(s=>s.textContent="");
  [vT,rT].forEach(s=>{const o=el("option","","All topics");o.value="ALL";s.append(o)});
  d.topics.forEach(t=>{const o=el("option","","Topic: "+t);o.value="T:"+t;tS.append(o);[vT,rT].forEach(s=>{const x=el("option","",t);x.value="T:"+t;s.append(x)})});
  d.concepts.forEach(c=>{const o=el("option","",c.label);o.value="C:"+c.id;tS.append(o)})}

/* ---------- teach it back ---------- */
async function teach(){const v=$("tSel").value;if(!v){$("tOut").textContent="Add some notes first.";return}
  await flow(async id=>{const label=$("tSel").selectedOptions[0].textContent.replace(/^Topic: /,"");$("tPills").textContent="";$("tHeard").textContent="";
    const pr=`Explain ${label} in your own words. I'll listen for about a minute. Say I'm done when you finish.`;
    $("tOut").textContent=pr;await speakP(pr);chk(id);setMic("tMic",true);
    const text=await hear({el:$("tHeard"),continuous:true,ms:75000,stopPhrases:true});setMic("tMic",false);chk(id);
    if(!text){$("tOut").textContent="I didn't hear an explanation. Try again.";await speakP($("tOut").textContent);return}
    const r=await api("/teach",{target:v,text});chk(id);$("tPills").textContent="";r.items.forEach(i=>$("tPills").append(el("span","pill "+(i.hit?"hit":"miss"),i.label)));
    const msg=`You covered ${r.covered} of ${r.total} key points, ${r.percent} percent.`+(r.missing.length?` You didn't mention: ${r.missing.slice(0,5).join(", ")}.`:" Excellent explanation.");
    $("tOut").textContent=msg;await speakP(msg)})}
$("tGo").onclick=teach;$("tDone").onclick=()=>{if(finishHear)finishHear()};

/* ---------- viva ---------- */
async function vivaHear(sec){let left=sec;$("vHeard").textContent="";$("vTimer").textContent=left+"s";const iv=setInterval(()=>{left--;$("vTimer").textContent=Math.max(left,0)+"s"},1000);
  try{return await hear({el:$("vHeard"),ms:sec*1000})}finally{clearInterval(iv);$("vTimer").textContent=""}}
async function viva(){let data;try{data=await api("/session",{mode:"std",count:5,topic:$("vTopic").value.replace(/^T:/,"")})}catch(e){return}
  const qs=data.cards;if(!qs.length){$("vQ").textContent="Add some notes first.";return}
  await flow(async id=>{const rows=[];$("vOut").textContent="";
    await speakP(`Good day. This is a short viva with ${qs.length} questions. Answer in your own words.`);chk(id);
    for(let i=0;i<qs.length;i++){const c=qs[i];$("vMeta").textContent=`Question ${i+1} of ${qs.length}`;$("vQ").textContent=c.plain.replace("...","______");
      await speakP(c.question.replace(/^Fill in the blank: /,"Complete this: "));chk(id);
      let ans=await vivaHear(30);chk(id);let g=ans?await api("/grade",{id:c.id,reply:ans}):{verdict:"wrong",marks:0,missed:c.keywords},follow=false;chk(id);
      if(ans&&g.verdict!=="correct"&&g.missed.length){follow=true;const f=`Can you say more about ${g.missed[0]}?`;$("vQ").textContent=f;await speakP(f);chk(id);
        const a2=await vivaHear(20);chk(id);if(a2){ans+=" "+a2;g=await api("/grade",{id:c.id,reply:ans});chk(id)}}
      let marks=g.marks;if(follow&&marks===2)marks=1.5;const verdict=marks>=2?"correct":marks>0?"partial":"wrong";
      await api("/record",{id:c.id,verdict});rows.push({c,marks,verdict,missed:g.missed});
      await speakP(ans?"Thank you.":"No answer. Let's move on.");chk(id)}
    const fin=await api("/finish",{results:rows.map(r=>({id:r.c.id,verdict:r.verdict,marks:r.marks})),mode:"viva"});
    $("vMeta").textContent="Viva complete";$("vQ").textContent=`${fin.marks} out of ${fin.max}, grade ${fin.grade}`;
    const ul=el("ul","res");rows.forEach(r=>ul.append(el("li","",`${r.marks}/2  ${r.c.plain}`+(r.marks<2&&r.missed.length?`  Revise: ${r.missed.slice(0,4).join(", ")}`:""))));
    $("vOut").textContent="";$("vOut").append(ul);const weak=[...new Set(rows.filter(r=>r.marks<1.5).map(r=>r.c.topic))];
    await speakP(`Viva complete. You scored ${fin.marks} out of ${fin.max}, grade ${fin.grade}.`+(weak.length?` Revise: ${weak.join(", ")}.`:" Well done."))})}
$("vGo").onclick=viva;$("vStop").onclick=()=>{cancelFlow();$("vMeta").textContent="Viva ended";$("vTimer").textContent=""};

/* ---------- revision audio ---------- */
async function revAudio(){let d;try{d=await api("/revision",{topic:$("raTopic").value})}catch(e){return}const pl=d.items;
  if(!pl.length){$("raNow").textContent="Add some notes first.";return}
  await flow(async id=>{await speakP("Revision audio. Relax and listen. I'll ask a quick question after every four cards.");chk(id);
    for(let i=0;i<pl.length;i++){const c=pl[i];$("raHeard").textContent="";$("raNow").textContent=`${i+1} of ${pl.length}: ${c.line}`;
      if(i===0||pl[i-1].topic!==c.topic){await speakP(c.topic+".");chk(id)}
      await speakP(c.line);chk(id);await sleep(600);chk(id);
      if((i+1)%4===0){const qc=pl[i-Math.floor(Math.random()*4)];$("raNow").textContent="Quick check: "+qc.plain;
        await speakP("Quick check. "+qc.question.replace(/^Fill in the blank: /,"Complete this: "));chk(id);
        const a=await hear({el:$("raHeard"),ms:9000});chk(id);const g=a?await api("/grade",{id:qc.id,reply:a}):{verdict:"wrong"};chk(id);
        await api("/record",{id:qc.id,verdict:g.verdict});await speakP(g.verdict==="correct"?"Correct.":"The answer is: "+qc.answer);chk(id)}}
    $("raNow").textContent="Finished.";await speakP("That's the end of this revision round.")})}
$("raGo").onclick=revAudio;$("raStop").onclick=()=>{cancelFlow();$("raNow").textContent="Stopped."};

/* ---------- assistant ---------- */
function log(who,text,link){const d=el("div","msg "+who);d.append(el("span","who",who==="me"?"You":"NOVA"),el("span","",text));
  if(link){const a=el("a","","open link");a.href=link;a.target="_blank";a.rel="noopener";d.append(" ",a)}$("log").append(d);$("log").scrollTop=1e9}
async function assist(text){log("me",text);let r;try{r=await api("/assist",{text})}catch(e){r={say:"I can't reach the NOVA server. Is app.py still running?"}}
  log("nova",r.say,r.link);if(r.link&&!r.noopen){try{window.open(r.link,"_blank","noopener")}catch(e){}}
  const a=r.action;if(a){if(a.type==="timer")tmSet(a.minutes);else if(a.type==="remind")addReminder(a.text,a.minutes);
    else if(a.type==="tab")show(a.tab);else if(a.type==="quiz"){show("quiz");setTimeout(()=>startQuiz(false),300)}}
  await speakP(r.say);resumeWake()}
function assistListen(){if(!SR){log("nova","This browser has no speech recognition. Use Chrome, or type below.");return}
  if(aRec){try{aRec.abort()}catch(e){}return}cancelFlow();pauseWake();stopDict();
  const r=new SR();aRec=r;r.lang=LANG;let fin="";$("aMic").classList.add("on");$("aHeard").textContent="Listening";
  r.onresult=e=>{let t="";for(const x of e.results)t+=x[0].transcript;$("aHeard").textContent="\u201C"+t+"\u201D";if(e.results[e.results.length-1].isFinal)fin=t};
  r.onerror=e=>{if(e.error==="not-allowed")log("nova","Microphone blocked. Allow it in the address bar, or type your command.")};
  r.onend=()=>{aRec=null;$("aMic").classList.remove("on");if(fin){$("aHeard").textContent="";assist(fin)}else{$("aHeard").textContent="Didn't catch that. Click the mic and try again.";resumeWake()}};
  try{r.start()}catch(e){}}
$("aMic").onclick=assistListen;
$("aForm").onsubmit=e=>{e.preventDefault();const t=$("aIn").value.trim();$("aIn").value="";if(t){cancelFlow();assist(t)}};
log("nova","Hi, I'm NOVA. Click the mic and ask for the time, a calculation, a web search, a definition, a timer, a reminder, or say quiz me.");

/* ---------- wake word ---------- */
const wake={on:false,rec:null,paused:false};
const busy=()=>Q||flowOn||aRec||dict;
function startWake(){if(!SR||!wake.on||wake.rec||busy())return;wake.paused=false;
  const r=new SR();wake.rec=r;r.continuous=true;r.interimResults=false;r.lang=LANG;
  r.onresult=e=>{const t=e.results[e.results.length-1][0].transcript.toLowerCase();const m=t.match(/\bnova\b[,.\s]*(.*)$/);if(!m)return;
    pauseWake();$("wakeState").textContent="Heard you";const cmd=m[1].trim();
    if(cmd)assist(cmd);else say("Yes?",async()=>{const x=await hear({ms:8000});if(x)assist(x);else resumeWake()})};
  r.onerror=e=>{if(e.error==="not-allowed"||e.error==="service-not-allowed"){wake.on=false;$("wakeState").textContent="Microphone blocked";$("wakeBtn").textContent="Turn on wake word"}};
  r.onend=()=>{wake.rec=null;if(wake.on&&!wake.paused)setTimeout(startWake,300)};
  try{r.start();$("wakeState").textContent="Listening for \u201CHey NOVA\u201D"}catch(e){wake.rec=null}}
function pauseWake(){wake.paused=true;if(wake.rec){try{wake.rec.abort()}catch(e){}wake.rec=null}}
function resumeWake(){if(wake.on&&!busy()){wake.paused=false;startWake()}}
$("wakeBtn").onclick=()=>{if(!SR){$("wakeState").textContent="Wake word needs Chrome";return}
  wake.on=!wake.on;$("wakeBtn").textContent=wake.on?"Turn off wake word":"Turn on wake word";if(wake.on)startWake();else{pauseWake();$("wakeState").textContent="Off"}};

/* ---------- dashboard ---------- */
const bar=(p,cls)=>{const b=el("div","bar"),i=el("i",cls);i.style.width=p+"%";b.append(i);return b};
let lastDash=null;
async function renderDash(){let d;try{d=await api("/dashboard")}catch(e){return}lastDash=d;const box=$("dash");box.textContent="";
  const top=el("div","kpis");[[d.streak,"day streak"],[d.accuracy+"%","accuracy"],[d.mastered,"mastered"],[d.due,"to review"]].forEach(([v,l])=>{const k=el("div","kpi");k.append(el("b","",String(v)),el("span","",l));top.append(k)});box.append(top);
  box.append(el("h2","","Last 7 days"));const wk=el("div","week");
  d.week.forEach(w=>{const col=el("div","col"),b=el("div","stack"),g=el("i");b.style.height=Math.min(110,w.n*10+3)+"px";g.style.height=w.n?(w.r/w.n*100)+"%":"0";b.append(g);col.append(b,el("span","",w.day));wk.append(col)});
  box.append(wk,el("p","note","Bar height is questions answered. The filled part is the share you got fully right."));
  box.append(el("h2","","Weakest topics first"));if(!d.topics.length)box.append(el("p","note","Finish a quiz session to see accuracy by topic."));
  d.topics.forEach(t=>{const r=el("div","trow");r.append(el("span","",t.topic),bar(t.accuracy,t.accuracy<50?"bad":t.accuracy<80?"part":"ok"),el("span","",t.accuracy+"%"));box.append(r)});
  box.append(el("h2","","Review boxes"));const mx=Math.max(1,...d.boxes);
  d.boxes.forEach((n,i)=>{const r=el("div","trow");r.append(el("span","","Box "+(i+1)),bar(n/mx*100,"ok"),el("span","",String(n)));box.append(r)});
  box.append(el("h2","",`Mistake notebook (${d.mistakes.length})`));
  if(!d.mistakes.length){box.append(el("p","note","Cards you miss are collected here until you get them right."));return}
  const ul=el("ul","res");d.mistakes.slice(0,8).forEach(m=>ul.append(el("li","",`${m.q.replace(/^Fill in the blank: /,"").replace("_____","...")}  Answer: ${m.a}`)));box.append(ul);
  if(d.mistakes.length>8)box.append(el("p","note",`and ${d.mistakes.length-8} more`));
  const row=el("div","actions"),pb=el("button","primary","Print revision sheet"),cb=el("button","","Clear notebook");
  pb.onclick=printSheet;cb.onclick=async()=>{await api("/mistakes/clear",{});renderDash()};row.append(pb,cb);box.append(row)}
function printSheet(){let s=$("sheet");if(!s){s=el("div");s.id="sheet";document.body.append(s)}s.textContent="";
  s.append(el("h1","","NOVA Recall: revision sheet"),el("p","",new Date().toLocaleDateString()));const by={};
  (lastDash?lastDash.mistakes:[]).forEach(m=>(by[m.t]=by[m.t]||[]).push(m));
  Object.entries(by).forEach(([t,l])=>{s.append(el("h2","",t));const ul=el("ul");l.forEach(m=>ul.append(el("li","",`${m.q.replace(/^Fill in the blank: /,"").replace("_____","______")}  Answer: ${m.a}`)));s.append(ul)});window.print()}

/* ---------- study tools ---------- */
function beep(){try{const a=new (window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;g.gain.value=.15;o.start();o.stop(a.currentTime+.4)}catch(e){}}
const fmt=s=>String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
let tm={mode:"focus",left:1500,run:false,iv:null};
function tmDraw(){$("tm").textContent=fmt(tm.left);$("tmPill").textContent=tm.run?(tm.mode==="focus"?"Focus ":"Break ")+fmt(tm.left):"";$("tmGo").textContent=tm.run?"Pause":"Start"}
function tmToggle(){if(tm.run){clearInterval(tm.iv);tm.run=false}else{tm.run=true;tm.iv=setInterval(()=>{tm.left--;
  if(tm.left<=0){clearInterval(tm.iv);tm.run=false;beep();
    if(tm.mode==="focus"){tm.mode="break";tm.left=300;say("Focus session complete. Take a five minute break.")}
    else{tm.mode="focus";tm.left=(+$("tmMin").value||25)*60;say("Break over. Ready for another round?")}}tmDraw()},1000)}tmDraw()}
function tmSet(min){clearInterval(tm.iv);tm.run=false;tm.mode="focus";tm.left=min*60;$("tmMin").value=min;tmToggle()}
$("tmGo").onclick=tmToggle;
$("tmReset").onclick=()=>{clearInterval(tm.iv);tm.run=false;tm.mode="focus";tm.left=(+$("tmMin").value||25)*60;tmDraw()};
$("tmMin").onchange=()=>{if(!tm.run&&tm.mode==="focus"){tm.left=(+$("tmMin").value||25)*60;tmDraw()}};
const rms=[];
function rmDraw(){const u=$("rmList");u.textContent="";rms.forEach(r=>u.append(el("li",r.done?"done":"",`${r.text} (${r.done?"done":"at "+new Date(r.at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})})`)))}
function addReminder(text,min){const it={text,at:Date.now()+min*60000,done:false};rms.push(it);setTimeout(()=>{it.done=true;beep();say("Reminder: "+text);rmDraw()},min*60000);rmDraw()}
$("rmAdd").onclick=()=>{const t=$("rmText").value.trim();if(!t)return;addReminder(t,+$("rmMin").value||10);$("rmText").value=""};
async function renderEx(){try{const r=await api("/exam",{});if(r.exam){$("exName").value=r.exam.name;$("exDate").value=r.exam.date}$("exOut").textContent=r.text}catch(e){}}
$("exSet").onclick=async()=>{if(!$("exDate").value)return;const r=await api("/exam",{name:$("exName").value.trim(),date:$("exDate").value});$("exOut").textContent=r.text};

/* ---------- notes: editor, dictation, upload, PDF ---------- */
let saveT=null;
async function loadNotes(){try{const d=await api("/notes");$("notesText").value=d.text;$("count").textContent=`${d.count} questions ready.`}catch(e){}}
async function saveNotes(){try{const d=await api("/notes/save",{text:$("notesText").value});$("count").textContent=d.count?`${d.count} questions ready. Saved.`:"No questions found yet. Use headings, Term: definition, or Q: / A: lines."}catch(e){setStatus("Could not save notes")}}
$("notesText").oninput=()=>{clearTimeout(saveT);saveT=setTimeout(saveNotes,700)};
function stopDict(){if(dict){dict.keep=false;try{dict.stop()}catch(e){}}}
function addDictated(t){let m,line;
  if(m=t.match(/^new topic (.+)/i))line="\n# "+m[1];
  else if(m=t.match(/^question (.+?) answer (.+)$/i))line="Q: "+m[1].replace(/\?*$/,"?")+"\nA: "+m[2];
  else if(m=t.match(/^define (.+?) as (.+)$/i))line=m[1]+": "+m[2];
  else line=t.replace(/[.!?]*$/,".");
  const n=$("notesText");n.value=n.value.replace(/\s*$/,"")+"\n"+line+"\n";n.scrollTop=n.scrollHeight;saveNotes()}
$("dictBtn").onclick=()=>{if(dict){stopDict();return}if(!SR){setStatus("Dictation needs Chrome");return}cancelFlow();pauseWake();
  const r=new SR();dict=r;r.continuous=true;r.interimResults=false;r.keep=true;r.lang=LANG;$("dictBtn").textContent="Stop dictating";setStatus("Dictating notes");
  r.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal){const t=e.results[i][0].transcript.trim();if(t)addDictated(t)}};
  r.onerror=e=>{if(e.error==="not-allowed"){r.keep=false;setStatus("Microphone blocked")}};
  r.onend=()=>{if(dict===r&&r.keep){try{r.start()}catch(e){}}else{if(dict===r)dict=null;$("dictBtn").textContent="Dictate notes";setStatus("Notes saved");setTimeout(resumeWake,300)}};
  try{r.start()}catch(e){}};
$("upBtn").onclick=()=>$("file").click();
$("file").onchange=e=>{const f=e.target.files[0];e.target.value="";if(!f)return;const rd=new FileReader();
  rd.onload=()=>{const n=$("notesText");n.value=n.value.replace(/\s*$/,"")+"\n\n"+rd.result;saveNotes();setStatus("File added to notes")};rd.readAsText(f)};
$("pdfBtn").onclick=()=>$("pdfFile").click();
$("pdfFile").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;setStatus("Reading PDF...");
  try{const j=window.NOVA_PDF?await window.NOVA_PDF(f):await(await fetch("/api/pdf",{method:"POST",headers:{"X-Filename":f.name},body:f})).json();if(j.error)throw new Error(j.error);
    if(!j.count)setStatus("No readable text found (scanned PDFs are not supported)");else{setStatus(`Imported ${j.count} sentences from the PDF`);loadNotes()}}
  catch(err){setStatus("PDF import failed: "+err.message)}};

show("quiz");tmDraw();
