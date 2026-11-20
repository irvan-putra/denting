const {chromium}=require('/usr/share/code/resources/app/node_modules/playwright-core');
const {spawn}=require('child_process');
const BASE=process.argv[2];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let server=null;
const TARGETS=['#guideBtn','#purpose','#loadExample','#play','#request','#aimFrom','#checks','#askAssistant','#export','#revisions'];
(async()=>{
if(BASE.includes('127.0.0.1')){server=spawn('python3',['-m','http.server','8128','--bind','127.0.0.1'],{cwd:process.env.HOME+'/denting',stdio:'ignore'});await delay(900);}
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true});
const results=[];const ok=(n,c,x='')=>results.push((c?'PASS':'FAIL')+' '+n+(x?' :: '+x:''));
for(const vp of [{width:1200,height:1000,name:'desktop'},{width:390,height:844,name:'mobile'}]){
  const p=await (await b.newContext({viewport:vp})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'/?fresh=scroll'+Date.now(),{waitUntil:'networkidle'});
  await p.locator('#guideBtn').click();
  for(let i=0;i<TARGETS.length;i++){
    await p.waitForTimeout(850); // let the smooth scroll settle
    const r=await p.evaluate(([sel])=>{
      const el=document.querySelector(sel);const panel=document.querySelector('#guidePanel');
      const e=el.getBoundingClientRect(),pr=panel.getBoundingClientRect();
      return {top:e.top,bottom:e.bottom,left:e.left,right:e.right,pTop:pr.top,vh:innerHeight,vw:innerWidth,title:document.querySelector('#guidePanel .guide-title').textContent};
    },[TARGETS[i]]);
    const inView=r.bottom>0&&r.top<r.vh&&r.right>0&&r.left<r.vw;
    const covered=r.bottom>r.pTop+2&&r.top<r.vh&&r.bottom>0&&!(r.bottom<=0)&&r.top<r.pTop&&r.bottom>r.pTop+2;
    const clear=r.bottom<=r.pTop+2||r.top>=r.vh; // strictly above panel or (shouldn't happen) below viewport
    ok(vp.name+' step '+(i+1)+' "'+r.title+'" target in view',inView,JSON.stringify({top:Math.round(r.top),bottom:Math.round(r.bottom),vh:r.vh}));
    ok(vp.name+' step '+(i+1)+' "'+r.title+'" not covered by panel',r.bottom<=r.pTop+2,JSON.stringify({bottom:Math.round(r.bottom),panelTop:Math.round(r.pTop)}));
    if(i<TARGETS.length-1) await p.locator('#guidePanel .guide-next').click();
  }
  ok(vp.name+' no page errors',errs.length===0,errs.join('|'));
  await p.context().close();
}
console.log(results.join('\n'));
await b.close();if(server)server.kill();
process.exit(results.some(r=>r.startsWith('FAIL'))?1:0);
})().catch(e=>{console.error('HARNESS FAIL',e);if(server)server.kill();process.exit(2)});
