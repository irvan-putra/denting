const {chromium}=require('/usr/share/code/resources/app/node_modules/playwright-core');
const {spawn}=require('child_process');
const BASE=process.argv[2];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let server=null;
(async()=>{
if(BASE.includes('127.0.0.1')){server=spawn('python3',['-m','http.server','8130','--bind','127.0.0.1'],{cwd:process.env.HOME+'/denting',stdio:'ignore'});await delay(900);}
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true});
const p=await (await b.newContext({viewport:{width:1200,height:1000}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
const results=[];const ok=(n,c,x='')=>results.push((c?'PASS':'FAIL')+' '+n+(x?' :: '+x:''));
await p.goto(BASE+'/?fresh=bridge'+Date.now(),{waitUntil:'networkidle'});
await p.locator('#loadExample').click();
await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('Loaded Balonku'),null,{timeout:20000});
// 1. copy brief with empty request: refused, focuses request, no brief shown
await p.locator('#request').fill('');
await p.locator('#askAssistant').click();
await delay(300);
ok('empty request refuses brief',(await p.locator('#status').textContent()).includes('Type your request first'),await p.locator('#status').textContent());
ok('no placeholder brief shown',(await p.locator('#briefOut').isHidden())||!(await p.locator('#briefOut').inputValue()).includes('describe your edit here'));
ok('request focused',await p.evaluate(()=>document.activeElement.id==='request'));
// 2. with a request: brief carries it
await p.locator('#request').fill('make it faster');
await p.locator('#askAssistant').click();
await delay(300);
const brief=await p.locator('#briefOut').inputValue();
ok('brief carries request',brief.includes('My request: make it faster'));
ok('brief has no placeholder',!brief.includes('(describe your edit here)'));
// 3. op none plan is conspicuous
await p.locator('#planInput').fill('{"op":"none","track":"all","fromBeat":null,"toBeat":null,"amount":null,"bpm":null}');
await p.locator('#checkPlan').click();
await delay(200);
const pv=await p.locator('#planPreview').textContent();
ok('none plan preview is conspicuous',pv.includes('none')&&pv.toLowerCase().includes('changes nothing'),pv.slice(0,80));
ok('none plan not applyable',await p.locator('#applyPlanBtn').isDisabled());
// 4. a real plan still checks and applies
await p.locator('#planInput').fill('{"op":"faster","track":"all","fromBeat":null,"toBeat":null,"amount":null,"bpm":null}');
await p.locator('#checkPlan').click();
await delay(200);
ok('real plan checks',(await p.locator('#planPreview').textContent()).includes('Plan checked'),await p.locator('#planPreview').textContent());
await p.locator('#applyPlanBtn').click();
await delay(300);
ok('real plan applies',(await p.locator('#status').textContent()).toLowerCase().includes('tempo'),await p.locator('#status').textContent());
ok('no page errors',errs.length===0,errs.join('|'));
console.log(results.join('\n'));
await b.close();if(server)server.kill();
process.exit(results.some(r=>r.startsWith('FAIL'))?1:0);
})().catch(e=>{console.error('HARNESS FAIL',e);if(server)server.kill();process.exit(2)});
