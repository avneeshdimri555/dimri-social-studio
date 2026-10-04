const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const PORT=process.env.PORT||3000,ROOT=path.join(__dirname,'public'),MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
function safeMessage(d,fallback){return String(d?.error?.message||fallback).slice(0,240)}
async function gemini(prompt){
  if(!process.env.GEMINI_API_KEY) return {ok:false,status:503,error:'Gemini is not configured.'};
  const first=process.env.GEMINI_MODEL||'gemini-2.5-flash';
  const models=[first,...['gemini-2.5-flash-lite','gemini-2.0-flash'].filter(m=>m!==first)];
  let last={ok:false,status:502,error:'Gemini request failed.'};
  for(const model of models){
    try{
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.75,maxOutputTokens:7000}})});
      const d=await r.json();
      if(r.ok){
        const text=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
        if(text)return {ok:true,text,provider:'gemini',model};
        last={ok:false,status:502,error:'Gemini returned an empty response.'};
      }else{
        last={ok:false,status:r.status,error:safeMessage(d,r.status===429?'Gemini rate limit reached.':'Gemini request failed.')};
        if(r.status!==429&&r.status<500)break;
      }
    }catch(e){last={ok:false,status:502,error:'Gemini connection failed.'}}
  }
  return last;
}
async function openai(prompt){
  if(!process.env.OPENAI_API_KEY)return {ok:false,status:503,error:'OpenAI fallback is not configured.'};
  try{
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',messages:[{role:'user',content:prompt}],temperature:.75,max_tokens:7000})});
    const d=await r.json();
    if(!r.ok)return {ok:false,status:r.status,error:safeMessage(d,'OpenAI request failed.')};
    const text=d?.choices?.[0]?.message?.content?.trim();
    return text?{ok:true,text,provider:'openai',model:process.env.OPENAI_MODEL||'gpt-4o-mini'}:{ok:false,status:502,error:'OpenAI returned an empty response.'};
  }catch(e){return {ok:false,status:502,error:'OpenAI connection failed.'}}
}
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'DIMRI Social Studio',aiConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.OPENAI_API_KEY),providers:{gemini:Boolean(process.env.GEMINI_API_KEY),openai:Boolean(process.env.OPENAI_API_KEY)}});
  if(req.method==='POST'&&url.pathname==='/api/generate'){
    if(!process.env.GEMINI_API_KEY&&!process.env.OPENAI_API_KEY)return json(res,503,{error:'AI is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to Render environment settings.'});
    let raw='';req.on('data',c=>{raw+=c;if(raw.length>50000)req.destroy()});req.on('end',async()=>{
      try{
        const i=JSON.parse(raw||'{}'),brief=String(i.brief||'').trim(),type=['caption','idea','script','storyboard','production','hashtags'].includes(i.type)?i.type:'caption',duration=String(i.duration||'30 seconds'),videoFormat=String(i.videoFormat||'Short-form vertical (9:16)');
        if(!brief)return json(res,400,{error:'A content brief is required.'});
        if(brief.length>4000)return json(res,400,{error:'Please keep the brief under 4,000 characters.'});
        const specs={caption:'Write a polished social caption with a natural hook and optional concise call to action.',idea:'Provide 5 distinct, actionable content ideas with a short angle for each.',script:'Write a complete video script with hook, scene directions, spoken lines, and CTA, fitted to the requested runtime.',storyboard:'Create a shot-by-shot storyboard with numbered shots, exact start and end timecodes, shot duration, visuals, camera movement, dialogue or voiceover, and sound. Ensure shot durations add up exactly to the requested runtime.',production:'Create a complete video production plan with concept, hook, scene-by-scene script, exact shot timecodes and durations, visuals, camera angles, voiceover/dialogue, on-screen text, music and sound effects, transitions, and CTA. Ensure all shot durations add up exactly to the requested runtime.',hashtags:'Suggest relevant, non-spammy hashtags; do not promise reach.'};
        const prompt='You are a creative social media writing assistant. Produce only the requested draft. Do not invent facts, statistics, testimonials, or results; use placeholders when details are missing.\nPlatform: '+String(i.platform||'Instagram')+'\nOutput: '+type+'\nVideo duration: '+duration+'\nVideo format: '+videoFormat+'\nTone: '+String(i.tone||'Friendly')+'\nLanguage: '+String(i.language||'English')+'\nAudience: '+String(i.audience||'Not specified')+'\nBrief: '+brief+'\n\n'+specs[type];
        let result=await gemini(prompt);
        if(!result.ok)result=await openai(prompt);
        if(!result.ok)return json(res,result.status===429?429:502,{error:'AI generation failed. '+result.error+' If Gemini is rate-limited, the app will use the OpenAI fallback when OPENAI_API_KEY is configured.'});
        return json(res,200,{text:result.text,provider:result.provider,model:result.model});
      }catch(e){return json(res,400,{error:'Invalid request or generation error. Please try again.'})}
    });return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end('Method Not Allowed')}
  let pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=path.resolve(ROOT,'.'+pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end('Forbidden')}
  fs.stat(file,(err,stat)=>{const target=!err&&stat.isFile()?file:path.join(ROOT,'index.html');fs.readFile(target,(e,body)=>{if(e){res.writeHead(500);return res.end('Application files unavailable')}res.writeHead(200,{'Content-Type':MIME[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:body)})})
}).listen(PORT,'0.0.0.0',()=>console.log('DIMRI Social Studio listening on '+PORT));
