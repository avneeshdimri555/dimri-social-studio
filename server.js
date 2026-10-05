const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{promisify}=require('node:util'),{execFile}=require('node:child_process'),execFileAsync=promisify(execFile);
const companyStructure={
  name:'DIMRI Social Studio',
  departments:[
    {id:'ceo',name:'AI CEO & Chief of Staff',mission:'Priorities, delegation, cross-team coordination, daily briefing and owner decision queue.',roles:['AI CEO','Chief of Staff','Operations Coordinator']},
    {id:'research',name:'Research & Intelligence',mission:'Audience, niche, demand, competitors, platform changes and source validation.',roles:['Trend Scout','Competitor Analyst','Audience Researcher','Source Verifier']},
    {id:'strategy',name:'Social Strategy & Growth',mission:'Channel positioning, content pillars, audience strategy and measurable growth experiments.',roles:['Channel Strategist','Content Planner','Growth Experimenter']},
    {id:'creative',name:'Creative Direction & Story',mission:'Ideas, hooks, scripts, long stories, series bibles, character DNA and continuity.',roles:['Creative Director','Scriptwriter','Series Architect','Brand Voice Editor']},
    {id:'production',name:'Production & Media',mission:'Scene prompts, image creation, image-to-video generation, voiceover and asset production.',roles:['Image Prompt Engineer','Image Operator','Video Prompt Engineer','Clip Producer']},
    {id:'editing',name:'Editing & Post-production',mission:'Assembly, pacing, subtitles, transitions, audio, thumbnails and exports.',roles:['Video Editor','Caption Specialist','Audio Editor','Thumbnail Designer']},
    {id:'seo',name:'Social SEO & Distribution',mission:'Platform-specific titles, descriptions, hashtags, metadata and discovery.',roles:['YouTube SEO','Reels Specialist','Distribution Planner']},
    {id:'marketing',name:'Marketing & Campaigns',mission:'Campaign planning, creative testing, brand messaging and marketing calendar.',roles:['Campaign Strategist','Creative Tester','Brand Marketer']},
    {id:'sales',name:'Sales, UGC & Partnerships',mission:'Social service offers, UGC briefs, lead research, proposals and partnership pipeline.',roles:['UGC Producer','Lead Researcher','Partnership Manager']},
    {id:'community',name:'Community & Audience Insights',mission:'Comment themes, FAQs, feedback, sentiment summaries and response drafts.',roles:['Community Analyst','Feedback Classifier','Reply Drafting Agent']},
    {id:'publishing',name:'Publishing & Platform Operations',mission:'Account health, upload, scheduling, publish reconciliation and recovery.',roles:['Scheduler','Platform Publisher','Publish Reconciler','Recovery Agent']},
    {id:'qa',name:'Quality Assurance & Fact-check',mission:'Story, visual, audio, technical, factual, rights and policy review.',roles:['Story QA','Visual QA','Technical QA','Fact-checker','Policy Reviewer']},
    {id:'analytics',name:'Analytics & Revenue Intelligence',mission:'Verified channel performance, experiments, costs, revenue and reporting.',roles:['Performance Analyst','Revenue Analyst','Experiment Reporter']},
    {id:'automation',name:'Automation & Integrations',mission:'APIs, webhooks, provider routing, job orchestration and monitoring.',roles:['API Integrator','Workflow Engineer','Provider Router','Monitoring Agent']},
    {id:'security',name:'Security, Rights & Compliance',mission:'Least privilege, secret handling, privacy, copyright, licensing and platform rules.',roles:['Security Steward','Rights Reviewer','Compliance Analyst']},
    {id:'finance',name:'Finance & Resource Control',mission:'Budget caps, provider usage, cost-per-asset and financial reporting.',roles:['Budget Controller','Usage Analyst','Cost Optimizer']},
    {id:'operations',name:'Operations & Recovery',mission:'SOPs, task queues, backup planning, incident response and restore drills.',roles:['Operations Manager','Backup Steward','Incident Coordinator']}
  ],
  pods:[
    {name:'Trend Discovery',members:'Trend Scout · Search Intent Analyst · Competitor Analyst · Source Verifier'},
    {name:'Channel Strategy',members:'Channel Planner · Audience Analyst · Growth Experimenter'},
    {name:'Story & Creative',members:'Idea Generator · Scriptwriter · Series Architect · Brand Voice Editor'},
    {name:'Image & Character',members:'Visual Prompt Engineer · Image Operator · Consistency Reviewer'},
    {name:'Video Production',members:'Video Prompt Engineer · Provider Router · Clip Producer · Assembly Editor'},
    {name:'Voice & Audio',members:'Voice Director · TTS Operator · Audio QA'},
    {name:'Platform Packaging',members:'YouTube Metadata · Reels Specialist · Shorts Editor · Thumbnail Reviewer'},
    {name:'Publishing',members:'Scheduler · Publisher · Reconciler · Failure Recovery'},
    {name:'QA & Safety',members:'Story QA · Visual QA · Technical QA · Fact-checker · Policy Reviewer'},
    {name:'Marketing & UGC',members:'Campaign Planner · UGC Brief Writer · Lead Qualifier · Partnerships Researcher'},
    {name:'Analytics',members:'Performance Analyst · Comment Theme Analyst · Experiment Reporter'},
    {name:'Infrastructure',members:'API Integrator · Scheduler Operator · Secrets Steward · Recovery Agent'}
  ]
};
const PORT=process.env.PORT||3000,ROOT=path.join(__dirname,'public'),MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
function safeMessage(d,fallback){return String(d?.error?.message||d?.error?.details?.[0]?.message||fallback).slice(0,360)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function retryDelayMs(response,attempt){
  const h=response?.headers?.get?.('retry-after');
  const n=Number(h);
  if(Number.isFinite(n)&&n>0)return Math.min(30000,n*1000);
  const jitter=Math.floor(Math.random()*350);
  return Math.min(12000,Math.pow(2,attempt)*1000+jitter);
}
function geminiKeys(){
  const keys=[];
  if(process.env.GEMINI_API_KEYS)keys.push(...process.env.GEMINI_API_KEYS.split(',').map(x=>x.trim()).filter(Boolean));
  for(const [k,v] of Object.entries(process.env))if(/^GEMINI_API_KEY_\\d+$/.test(k)&&v)keys.push(String(v).trim());
  if(process.env.GEMINI_API_KEY)keys.unshift(process.env.GEMINI_API_KEY.trim());
  return [...new Set(keys.filter(Boolean))];
}
function geminiModels(){
  const configured=(process.env.GEMINI_MODELS||process.env.GEMINI_MODEL||'gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite').split(',').map(x=>x.trim()).filter(Boolean);
  return [...new Set(configured)];
}
async function geminiWithKey(prompt,key,model){
  const maxRetries=Math.max(0,Math.min(3,Number(process.env.GEMINI_RETRIES||2)));
  let last={ok:false,status:502,error:'Gemini request failed.'};
  for(let attempt=0;attempt<=maxRetries;attempt++){
    try{
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:7000}})});
      const d=await r.json().catch(()=>({}));
      if(r.ok){
        const text=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
        if(text)return {ok:true,text,provider:'gemini',model};
        last={ok:false,status:502,error:'Gemini returned an empty response.'};
        break;
      }
      last={ok:false,status:r.status,error:safeMessage(d,r.status===429?'Gemini rate/quota limit reached.':'Gemini request failed.')};
      const transient=r.status===408||r.status===429||r.status>=500;
      if(!transient||attempt>=maxRetries)break;
      await sleep(retryDelayMs(r,attempt));
    }catch(e){
      last={ok:false,status:502,error:'Gemini connection failed.'};
      if(attempt<maxRetries)await sleep(Math.min(8000,1000*Math.pow(2,attempt)));
    }
  }
  return last;
}
async function gemini(prompt){
  const keys=geminiKeys();
  if(!keys.length)return {ok:false,status:503,error:'Gemini is not configured.'};
  const models=geminiModels();
  let last={ok:false,status:503,error:'Gemini request failed.'};
  for(const key of keys){
    for(const model of models){
      const r=await geminiWithKey(prompt,key,model);
      if(r.ok)return r;
      last=r;
      // Invalid/auth/model errors should not be retried with every model; move to next key/provider.
      if([400,401,402,403].includes(r.status))break;
    }
  }
  return last;
}
async function vertexGemini(prompt){
  if(!process.env.GOOGLE_CLOUD_PROJECT)return {ok:false,status:503,error:'Google Cloud Vertex AI is not configured.'};
  try{
    const {GoogleGenAI}=await import('@google/genai');
    let credentials;
    if(process.env.GOOGLE_SERVICE_ACCOUNT_JSON){
      credentials=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }
    const options={vertexai:true,project:process.env.GOOGLE_CLOUD_PROJECT,location:process.env.GOOGLE_CLOUD_LOCATION||'global'};
    if(credentials)options.googleAuthOptions={credentials,clientOptions:{transporterOptions:{fetchImplementation:globalThis.fetch}}};
    const ai=new GoogleGenAI(options);
    const model=(process.env.VERTEX_GEMINI_MODEL||'gemini-3.8-flash').trim();
    const response=await ai.models.generateContent({model,contents:prompt});
    const text=String(response?.text||'').trim();
    return text?{ok:true,text,provider:'vertex-gemini',model}:{ok:false,status:502,error:'Vertex Gemini returned an empty response.'};
  }catch(e){
    return {ok:false,status:502,error:'Vertex Gemini failed: '+String(e.message||e).slice(0,240)};
  }
}
async function openai(prompt){
  if(!process.env.OPENAI_API_KEY)return {ok:false,status:503,error:'OpenAI fallback is not configured.'};
  const model=process.env.OPENAI_MODEL||'gpt-6-luna';
  const maxRetries=Math.max(0,Math.min(3,Number(process.env.OPENAI_RETRIES||2)));
  let last={ok:false,status:502,error:'OpenAI request failed.'};
  for(let attempt=0;attempt<=maxRetries;attempt++){
    try{
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model,input:prompt,max_output_tokens:7000})});
      const d=await r.json().catch(()=>({}));
      if(r.ok){
        const text=String(d?.output_text||d?.output?.flatMap?.(x=>x?.content||[]).map(x=>x?.text||'').join('')||'').trim();
        if(text)return {ok:true,text,provider:'openai',model};
        return {ok:false,status:502,error:'OpenAI returned an empty response.'};
      }
      last={ok:false,status:r.status,error:safeMessage(d,'OpenAI request failed.')};
      if(![408,429,500,502,503,504].includes(r.status)||attempt>=maxRetries)break;
      await sleep(retryDelayMs(r,attempt));
    }catch(e){
      last={ok:false,status:502,error:'OpenAI connection failed.'};
      if(attempt<maxRetries)await sleep(Math.min(8000,1000*Math.pow(2,attempt)));
    }
  }
  return last;
}
let aiQueue=Promise.resolve();
function runAiTask(task){
  const next=aiQueue.then(task,task);
  aiQueue=next.catch(()=>{});
  return next;
}
async function aiText(prompt){
  return runAiTask(async()=>{
    const providers=[];
    if(geminiKeys().length)providers.push(['gemini',()=>gemini(prompt)]);
    if(process.env.GOOGLE_CLOUD_PROJECT)providers.push(['vertex-gemini',()=>vertexGemini(prompt)]);
    if(process.env.OPENAI_API_KEY)providers.push(['openai',()=>openai(prompt)]);
    if(!providers.length)return {ok:false,status:503,error:'No AI provider is configured. Add Gemini, Vertex AI, or OpenAI credentials in Render.'};
    let last={ok:false,status:503,error:'AI provider failed.'};
    for(const [name,fn] of providers){
      const r=await fn();
      if(r.ok)return r;
      last=r;
      console.warn('[AI] provider failed',name,r.status,r.error);
    }
    return last;
  });
}
async function automationPlan(longDuration='15 minutes'){
  const prompt='Create a daily social media production pack. Return ONLY valid JSON with an items array of exactly 3 unique content concepts: two short vertical video concepts and one long YouTube concept. The two short concepts must be suitable for the same assets to be published on YouTube Shorts and Instagram Reels. Long video duration: '+longDuration+'. For each item include title, type, duration, hook, script, shot_list, voiceover, visual_prompts, caption, youtube_description. Short videos should be 30-60 seconds and include exact shot timecodes. The long video should be '+longDuration+' and include a complete scene/timecode plan. Avoid fabricated facts and use placeholders where necessary.';
  let r=await aiText(prompt);
  if(!r.ok)throw Error(r.error||'AI generation failed');
  try{const clean=r.text.replace(/^\`\`\`json\s*/,'').replace(/\s*\`\`\`$/,'');return JSON.parse(clean)}catch(e){throw Error('AI returned an invalid automation pack.')}
}
function integrationsStatus(){
  return {
    youtube:Boolean(process.env.YOUTUBE_CLIENT_ID&&process.env.YOUTUBE_CLIENT_SECRET&&process.env.YOUTUBE_REFRESH_TOKEN),
    instagram:Boolean(process.env.INSTAGRAM_ACCESS_TOKEN&&process.env.INSTAGRAM_USER_ID),
    video:configuredVideoEngines().length>0,videoEngines:configuredVideoEngines(),
  };
}
const VIDEO_ENGINE_SPECS={
  "fal-flux3-draft":{provider:"fal",model:"blackforestlabs/flux-3/draft/text-to-video",max:15},
  "fal-h3max":{provider:"fal",model:"minimax/h3-max/text-to-video",max:15},
  "fal-wan3":{provider:"fal",model:"alibaba/wan-3.0/text-to-video",max:10},
  "fal-grok":{provider:"fal",model:"xai/grok-imagine-video/v1.5/text-to-video",max:15},
  "fal-pika":{provider:"fal",model:"fal-ai/pika/v2.2/text-to-video",max:10},
  "fal-kling":{provider:"fal",model:"fal-ai/kling-video/o3/standard/text-to-video",max:15},
  "fal-hunyuan":{provider:"fal",model:"fal-ai/hunyuan-video-v1.5/text-to-video",max:10},
  "higgsfield":{provider:"higgsfield",model:process.env.HF_VIDEO_MODEL||"bytedance/seedance-2.5/text-to-video",max:30}
};
function configuredVideoEngines(){
  const order=(process.env.VIDEO_PROVIDER_ORDER||"fal-flux3-draft,fal-h3max,fal-wan3,fal-grok,fal-pika,fal-kling,fal-hunyuan,higgsfield").split(",").map(x=>x.trim()).filter(Boolean);
  return order.filter(id=>VIDEO_ENGINE_SPECS[id] && ((VIDEO_ENGINE_SPECS[id].provider==="fal"&&process.env.FAL_KEY)||(VIDEO_ENGINE_SPECS[id].provider==="higgsfield"&&(process.env.HF_CREDENTIALS||process.env.HF_API_KEY||process.env.HF_API_KEY_ID&&process.env.HF_API_KEY_SECRET))));
}
async function generateFalVideo(engineId,prompt,duration=5,aspectRatio="9:16"){
  if(!process.env.FAL_KEY)throw Error("FAL_KEY is not configured.");
  const spec=VIDEO_ENGINE_SPECS[engineId]; if(!spec||spec.provider!=="fal")throw Error("Unknown fal video engine.");
  const {fal}=await import("@fal-ai/client");
  fal.config({credentials:process.env.FAL_KEY});
  const d=Math.max(5,Math.min(spec.max,Number(duration)||5));
  const input={prompt:String(prompt),duration:d,aspect_ratio:aspectRatio};
  if(engineId==="fal-wan3")Object.assign(input,{resolution:"720p",audio:true});
  if(engineId==="fal-kling")Object.assign(input,{generate_audio:true});
  if(engineId==="fal-flux3-draft")Object.assign(input,{resolution:"720p",generate_audio:true});
  if(engineId==="fal-h3max")Object.assign(input,{resolution:"768P",prompt_expansion_mode:"disabled"});
  const result=await fal.subscribe(spec.model,{input,logs:false});
  const video=result?.data?.video||result?.data?.output?.video||result?.video||result?.output?.video;
  const url=typeof video==="string"?video:video?.url;
  if(!url)throw Error(engineId+" completed without a video URL.");
  return {request_id:result?.requestId||null,status:"completed",engine:engineId,video:{url},duration:d};
}
async function generateVideoWithFallback(prompt,duration=5,aspectRatio="9:16"){
  const engines=configuredVideoEngines();
  if(!engines.length)throw Error("No video provider is configured. Add FAL_KEY or Higgsfield credentials in Render.");
  const errors=[];
  for(const id of engines){
    try{
      const spec=VIDEO_ENGINE_SPECS[id];
      if(spec.provider==="fal")return await generateFalVideo(id,prompt,duration,aspectRatio);
      return Object.assign(await generateHiggsfieldVideo(prompt,Math.min(spec.max,Number(duration)||5),aspectRatio),{engine:id});
    }catch(e){errors.push(id+": "+String(e.message||e).slice(0,160));}
  }
  throw Error("All configured video providers failed. "+errors.join(" | "));
}

async function generateHiggsfieldVideo(prompt,duration=5,aspectRatio='9:16'){
  const credentials=process.env.HF_CREDENTIALS||(process.env.HF_API_KEY_ID&&process.env.HF_API_KEY_SECRET?process.env.HF_API_KEY_ID+':'+process.env.HF_API_KEY_SECRET:process.env.HF_API_KEY);
  if(!credentials)throw Error('Higgsfield video generation is not configured.');
  const {config,higgsfield}=await import('@higgsfield/client/v2');
  config({credentials});
  const model=process.env.HF_VIDEO_MODEL||'bytedance/seedance-2.5/text-to-video';
  const result=await higgsfield.subscribe(model,{input:{prompt:String(prompt),duration:Math.min(30,Math.max(4,Number(duration)||5)),resolution:process.env.HF_VIDEO_RESOLUTION||'720p',aspect_ratio:aspectRatio,output_format:'mp4',generate_audio:true},withPolling:true});
  const video=result?.video||result?.results?.video||result?.output?.video;
  const videoUrl=typeof video==='string'?video:video?.url;
  if(!videoUrl)throw Error('Higgsfield completed without a video URL.');
  return {request_id:result?.request_id||result?.id||null,status:'completed',video:{url:videoUrl},raw:result};
}

async function uploadToHiggsfieldStorage(filePath){
  const credentials=process.env.HF_CREDENTIALS||(process.env.HF_API_KEY_ID&&process.env.HF_API_KEY_SECRET?process.env.HF_API_KEY_ID+':'+process.env.HF_API_KEY_SECRET:process.env.HF_API_KEY);
  if(!credentials)throw Error('Higgsfield storage credentials are not configured.');
  const r=await fetch('https://api.higgsfield.ai/files/generate-upload-url',{method:'POST',headers:{Authorization:'Key '+credentials,'Content-Type':'application/json'},body:JSON.stringify({content_type:'video/mp4'})});
  const d=await r.json();if(!r.ok||!d.upload_url||!d.public_url)throw Error('Higgsfield storage upload URL creation failed.');
  const bytes=await fs.promises.readFile(filePath);
  const headers=Object.assign({},d.upload_headers||{}, {'Content-Type':'video/mp4'});
  const put=await fetch(d.upload_url,{method:'PUT',headers,body:bytes});if(!put.ok)throw Error('Higgsfield storage upload failed.');
  return d.public_url;
}
async function assembleVideoFromUrls(urls){
  const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'dimri-social-'));const list=path.join(dir,'list.txt'),out=path.join(dir,'final.mp4');
  try{
    const lines=[];
    for(let i=0;i<urls.length;i++){const r=await fetch(urls[i]);if(!r.ok)throw Error('Could not download generated clip '+(i+1));const p=path.join(dir,String(i).padStart(3,'0')+'.mp4');await fs.promises.writeFile(p,Buffer.from(await r.arrayBuffer()));lines.push("file '"+p.replace(/'/g,"'\\''")+"'");}
    await fs.promises.writeFile(list,lines.join('\n'));
    const ffmpeg=require('ffmpeg-static');if(!ffmpeg)throw Error('FFmpeg runtime is unavailable.');
    await execFileAsync(ffmpeg,['-y','-f','concat','-safe','0','-i',list,'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart',out],{timeout:45*60*1000,maxBuffer:1024*1024});
    return {path:out,dir};
  }catch(e){await fs.promises.rm(dir,{recursive:true,force:true});throw e}
}
async function runDailyAutomation(mode='shorts'){
  const pack=await automationPlan((process.env.AUTOMATION_LONG_MINUTES||'10')+' minutes');
  const results=[];
  if(mode==='shorts'){
    for(let i=0;i<2;i++){
      const item=pack.items[i];if(!item)continue;
      const prompt=[item.hook,item.script,(item.visual_prompts||[]).join(' | '),item.shot_list].filter(Boolean).join('\n');
      const video=await generateVideoWithFallback(prompt,15,'9:16');
      const yt=await youtubeUploadFromUrl(video.video.url,{title:item.title,description:item.youtube_description||item.caption||'',privacyStatus:'public'});
      const ig=await instagramPublishReel(video.video.url,item.caption||item.title);
      results.push({slot:'short_'+(i+1),title:item.title,video:video.video.url,youtube:yt,instagram:ig});
    }
    return {mode,results};
  }
  if(mode==='long'){
    const item=pack.items[2];if(!item)throw Error('Long-video concept missing.');
    const targetMinutes=Math.max(10,Math.min(20,Number(process.env.AUTOMATION_LONG_MINUTES||10)));
    const clips=Math.ceil(targetMinutes*60/30),urls=[];
    const prompts=Array.isArray(item.visual_prompts)&&item.visual_prompts.length?item.visual_prompts:[item.script||item.hook||item.title];
    for(let i=0;i<clips;i++){const p=prompts[i%prompts.length]+'\nScene '+(i+1)+' of '+clips+'. Maintain continuity with the same subject, setting, style and narration.';const v=await generateVideoWithFallback(p,15,'16:9');urls.push(v.video.url)}
    const assembled=await assembleVideoFromUrls(urls);
    const storedUrl=await uploadToHiggsfieldStorage(assembled.path);
    const yt=await youtubeUploadFromUrl(storedUrl,{title:item.title,description:item.youtube_description||'',privacyStatus:'public'});
    await fs.promises.rm(assembled.dir,{recursive:true,force:true});
    return {mode,results:[{title:item.title,requestedMinutes:targetMinutes,generatedClips:clips,storageUrl:storedUrl,youtube:yt}]};
  }
  throw Error('Unknown automation mode.');
}

http.createServer(async (req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/api/company/structure')return json(res,200,companyStructure);
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'DIMRI Social Studio',aiConfigured:Boolean(geminiKeys().length||process.env.GOOGLE_CLOUD_PROJECT||process.env.OPENAI_API_KEY),providers:{gemini:Boolean(geminiKeys().length),vertexGemini:Boolean(process.env.GOOGLE_CLOUD_PROJECT),openai:Boolean(process.env.OPENAI_API_KEY)},integrations:{youtube:Boolean(process.env.YOUTUBE_CLIENT_ID&&process.env.YOUTUBE_CLIENT_SECRET&&process.env.YOUTUBE_REFRESH_TOKEN),instagram:Boolean(process.env.INSTAGRAM_ACCESS_TOKEN&&process.env.INSTAGRAM_USER_ID),video:configuredVideoEngines().length>0,videoEngines:configuredVideoEngines()}});
  
  if(req.method==='GET'&&url.pathname==='/auth/youtube'){if(!process.env.YOUTUBE_CLIENT_ID)return html(res,503,'<p>YOUTUBE_CLIENT_ID is not configured in Render.</p>');const redirect=publicBaseUrl(req)+'/auth/youtube/callback';const q=new URLSearchParams({client_id:process.env.YOUTUBE_CLIENT_ID,redirect_uri:redirect,response_type:'code',access_type:'offline',prompt:'consent',scope:'https://www.googleapis.com/auth/youtube.upload'});res.writeHead(302,{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+q.toString()});return res.end()}
  if(req.method==='GET'&&url.pathname==='/auth/youtube/callback'){try{const code=url.searchParams.get('code');if(!code)return html(res,400,'<p>Missing OAuth code.</p>');const redirect=publicBaseUrl(req)+'/auth/youtube/callback';const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.YOUTUBE_CLIENT_ID,client_secret:process.env.YOUTUBE_CLIENT_SECRET,redirect_uri:redirect,grant_type:'authorization_code'})});const d=await r.json();if(!r.ok)return html(res,502,'<p>OAuth exchange failed.</p><pre>'+JSON.stringify(d,null,2)+'</pre>');return html(res,200,'<p>Google OAuth completed.</p><p><b>Refresh token:</b></p><textarea style="width:100%;min-height:100px;background:#111925;color:#fff">'+String(d.refresh_token||'')+'</textarea><p>Save this value in Render as <b>YOUTUBE_REFRESH_TOKEN</b>. Do not publish it or commit it to GitHub.</p>')}catch(e){return html(res,500,'<p>'+String(e.message||e)+'</p>')}}
  if(req.method==='GET'&&url.pathname==='/auth/status')return json(res,200,{youtube:Boolean(process.env.YOUTUBE_CLIENT_ID&&process.env.YOUTUBE_CLIENT_SECRET&&process.env.YOUTUBE_REFRESH_TOKEN),instagram:Boolean(process.env.INSTAGRAM_ACCESS_TOKEN&&process.env.INSTAGRAM_USER_ID),video:Boolean(process.env.HF_API_KEY||process.env.HF_CREDENTIALS||process.env.HF_API_KEY_ID&&process.env.HF_API_KEY_SECRET),baseUrl:publicBaseUrl(req)});
  if(req.method==='POST'&&url.pathname==='/api/publish/youtube'){let raw='';req.on('data',c=>raw+=c);req.on('end',async()=>{try{const i=JSON.parse(raw||'{}');if(!i.videoUrl)return json(res,400,{error:'videoUrl is required'});return json(res,200,await youtubeUploadFromUrl(String(i.videoUrl),i))}catch(e){return json(res,502,{error:e.message})}});return}
  if(req.method==='POST'&&url.pathname==='/api/publish/instagram'){let raw='';req.on('data',c=>raw+=c);req.on('end',async()=>{try{const i=JSON.parse(raw||'{}');if(!i.videoUrl)return json(res,400,{error:'videoUrl is required'});return json(res,200,await instagramPublishReel(String(i.videoUrl),String(i.caption||'')))}catch(e){return json(res,502,{error:e.message})}});return}
  if(req.method==='POST'&&url.pathname==='/api/automation/run'){const supplied=req.headers['x-automation-secret']||url.searchParams.get('secret');if(!process.env.AUTOMATION_CRON_SECRET||supplied!==process.env.AUTOMATION_CRON_SECRET)return json(res,401,{error:'Unauthorized automation runner.'});const mode=String(url.searchParams.get('mode')||'shorts');try{return json(res,200,await runDailyAutomation(mode))}catch(e){return json(res,502,{error:e.message||'Daily automation failed.'})}}
  if(req.method==='GET'&&url.pathname==='/api/integrations/status')return json(res,200,integrationsStatus());
  if(req.method==='POST'&&url.pathname==='/api/automation/plan'){
    let raw='';req.on('data',c=>{raw+=c;if(raw.length>10000)req.destroy()});req.on('end',async()=>{try{const i=JSON.parse(raw||'{}'),pack=await automationPlan(String(i.longDuration||'15 minutes'));return json(res,200,{items:pack.items||[]})}catch(e){return json(res,502,{error:e.message||'Automation plan failed.'})}});
    return;
  }
  if(req.method==='POST'&&url.pathname==='/api/image/generate'){
    let raw='';req.on('data',c=>{raw+=c;if(raw.length>12000)req.destroy()});req.on('end',async()=>{
      try{
        const i=JSON.parse(raw||'{}'),prompt=String(i.prompt||'').trim();
        if(!prompt)return json(res,400,{error:'Image prompt is required.'});
        const keys=geminiKeys();
        if(!keys.length)return json(res,503,{error:'Scene image generation needs a Gemini image provider. Add GEMINI_API_KEY or GEMINI_API_KEYS in Render.'});
        const models=(process.env.GEMINI_IMAGE_MODELS||process.env.GEMINI_IMAGE_MODEL||'gemini-3.1-flash-image,gemini-3.1-flash-lite-image,gemini-2.5-flash-image').split(',').map(x=>x.trim()).filter(Boolean);
        let last={status:502,error:'Image generation failed.'};
        for(const key of keys){
          for(const model of models){
            for(let attempt=0;attempt<=2;attempt++){
              try{
                const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:'Generate one high-quality production image for this scene. '+prompt}]}],generationConfig:{responseModalities:['TEXT','IMAGE']}})});
                const d=await r.json().catch(()=>({}));
                if(r.ok){
                  const parts=d?.candidates?.[0]?.content?.parts||[],imagePart=parts.find(p=>p.inlineData?.data||p.inline_data?.data),data=imagePart?.inlineData?.data||imagePart?.inline_data?.data,mimeType=imagePart?.inlineData?.mimeType||imagePart?.inline_data?.mime_type||'image/png';
                  if(data)return json(res,200,{data,mimeType,model,provider:'gemini'});
                  last={status:502,error:'Image model returned no image.'};break;
                }
                last={status:r.status,error:safeMessage(d,r.status===429?'Gemini image rate/quota limit reached.':'Gemini image request failed.')};
                if(![408,429,500,502,503,504].includes(r.status)||attempt>=2)break;
                await sleep(retryDelayMs(r,attempt));
              }catch(e){
                last={status:502,error:'Gemini image connection failed.'};
                if(attempt<2)await sleep(Math.min(8000,1000*Math.pow(2,attempt)));
              }
            }
          }
        }
        return json(res,last.status===429?429:502,{error:last.error+' Add another Gemini project/key or enable Vertex AI/OpenAI as a fallback provider in Render.'});
      }catch(e){return json(res,502,{error:e.message||'Image generation failed.'})}
    });return;
  }
  if(req.method==='POST'&&url.pathname==='/api/story/plan'){
    let raw='';req.on('data',c=>{raw+=c;if(raw.length>12000)req.destroy()});req.on('end',async()=>{
      try{
        const i=JSON.parse(raw||'{}'),topic=String(i.topic||'').trim(),duration=String(i.duration||'60 seconds'),style=String(i.style||'cinematic 3D animation'),mode=i.mode==='series'?'series':'story',episodeCount=Math.max(2,Math.min(12,Number(i.episodeCount)||5));
        if(!topic)return json(res,400,{error:'Enter a topic first.'});
        if(topic.length>1000)return json(res,400,{error:'Keep topic under 1,000 characters.'});
        const prompt=mode==='series'?'Create a complete serialized story bible and episode plan for topic: '+topic+'. Create exactly '+episodeCount+' episodes, each '+duration+' long, in visual style '+style+'. Return ONLY valid JSON object with keys title, logline, characters (array of objects with name, visual_dna), series_arc, continuity_rules (array), episodes (array with exactly '+episodeCount+' objects; each object has episode_number, title, synopsis, story, cliffhanger, scenes (array of 4-8 objects, each with scene_number, duration_seconds, narration, image_prompt, video_prompt, sound_design)). Episodes must form a coherent progressive story, with consistent character identities, locations, costume and art style. Episode 1 establishes the world; later episodes advance the plot; each episode has a satisfying mini-arc and an ending hook. Every image_prompt repeats relevant character visual DNA and specifies composition, lighting, camera and aspect ratio 9:16. Every video_prompt describes motion, action, camera movement and continuity, suitable for image-to-video. No markdown fences.':'Create a production-ready story plan for topic: '+topic+'. Target duration: '+duration+'. Visual style: '+style+'. Return ONLY valid JSON object with keys title, logline, characters (array of objects with name, visual_dna), story (full narration/story), scenes (array of 4-12 objects, each with scene_number, duration_seconds, narration, image_prompt, video_prompt, sound_design). Image prompts must maintain character visual consistency by repeating visual DNA, specify composition, lighting, camera, aspect ratio 9:16. Video prompts must describe motion, camera movement, action, and continuity, suitable for image-to-video animation. Ensure scene durations sum approximately to requested duration. No markdown fences.';
        let r=await aiText(prompt);
        if(!r.ok)return json(res,r.status===429?429:502,{error:'Story planning failed. '+r.error});
        const clean=r.text.replace(/^\`\`\`json\s*/,'').replace(/\s*\`\`\`$/,'');
        let plan;try{plan=JSON.parse(clean)}catch{return json(res,502,{error:'AI returned invalid story JSON. Please retry.'})}
        return json(res,200,{...plan,mode,provider:r.provider,model:r.model});
      }catch(e){return json(res,502,{error:e.message||'Story planning failed.'})}
    });return;
  }
  if(req.method==='POST'&&url.pathname==='/api/video/generate'){
    let raw='';req.on('data',c=>{raw+=c;if(raw.length>20000)req.destroy()});req.on('end',async()=>{try{const i=JSON.parse(raw||'{}');if(!String(i.prompt||'').trim())return json(res,400,{error:'Video prompt is required.'});const d=await generateVideoWithFallback(String(i.prompt),Number(i.duration||5),String(i.aspectRatio||'9:16'));return json(res,202,d)}catch(e){return json(res,502,{error:e.message||'Video generation failed.'})}});return;
  }

if(req.method==='POST'&&url.pathname==='/api/generate'){
    if(!geminiKeys().length&&!process.env.GOOGLE_CLOUD_PROJECT&&!process.env.OPENAI_API_KEY)return json(res,503,{error:'AI is not configured. Add Gemini, Vertex AI, or OpenAI credentials to Render environment settings.'});
    let raw='';req.on('data',c=>{raw+=c;if(raw.length>50000)req.destroy()});req.on('end',async()=>{
      try{
        const i=JSON.parse(raw||'{}'),brief=String(i.brief||'').trim(),type=['caption','idea','script','storyboard','production','hashtags'].includes(i.type)?i.type:'caption',duration=String(i.duration||'30 seconds'),videoFormat=String(i.videoFormat||'Short-form vertical (9:16)');
        if(!brief)return json(res,400,{error:'A content brief is required.'});
        if(brief.length>4000)return json(res,400,{error:'Please keep the brief under 4,000 characters.'});
        const specs={caption:'Write a polished social caption with a natural hook and optional concise call to action.',idea:'Provide 5 distinct, actionable content ideas with a short angle for each.',script:'Write a complete video script with hook, scene directions, spoken lines, and CTA, fitted to the requested runtime.',storyboard:'Create a shot-by-shot storyboard with numbered shots, exact start and end timecodes, shot duration, visuals, camera movement, dialogue or voiceover, and sound. Ensure shot durations add up exactly to the requested runtime.',production:'Create a complete video production plan with concept, hook, scene-by-scene script, exact shot timecodes and durations, visuals, camera angles, voiceover/dialogue, on-screen text, music and sound effects, transitions, and CTA. Ensure all shot durations add up exactly to the requested runtime.',hashtags:'Suggest relevant, non-spammy hashtags; do not promise reach.'};
        const prompt='You are a creative social media writing assistant. Produce only the requested draft. Do not invent facts, statistics, testimonials, or results; use placeholders when details are missing.\nPlatform: '+String(i.platform||'Instagram')+'\nOutput: '+type+'\nVideo duration: '+duration+'\nVideo format: '+videoFormat+'\nTone: '+String(i.tone||'Friendly')+'\nLanguage: '+String(i.language||'English')+'\nAudience: '+String(i.audience||'Not specified')+'\nBrief: '+brief+'\n\n'+specs[type];
        let result=await gemini(prompt);
        if(!result.ok)result=await openai(prompt);
        if(!result.ok)return json(res,result.status===429?429:502,{error:'AI generation failed. '+result.error+'. Configure another provider in Render if the current provider quota is exhausted.'});
        return json(res,200,{text:result.text,provider:result.provider,model:result.model});
      }catch(e){return json(res,400,{error:'Invalid request or generation error. Please try again.'})}
    });return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end('Method Not Allowed')}
  let pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=path.resolve(ROOT,'.'+pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end('Forbidden')}
  fs.stat(file,(err,stat)=>{const target=!err&&stat.isFile()?file:path.join(ROOT,'index.html');fs.readFile(target,(e,body)=>{if(e){res.writeHead(500);return res.end('Application files unavailable')}res.writeHead(200,{'Content-Type':MIME[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:body)})})
}).listen(PORT,'0.0.0.0',()=>console.log('DIMRI Social Studio listening on '+PORT));
