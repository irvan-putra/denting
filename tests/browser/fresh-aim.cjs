const {chromium}=require('/usr/share/code/resources/app/node_modules/playwright-core');
const {spawn}=require('child_process');
const BASE=process.argv[2];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let server=null;
(async()=>{
if(BASE.includes('127.0.0.1')){server=spawn('python3',['-m','http.server','8131','--bind','127.0.0.1'],{cwd:process.env.HOME+'/denting',stdio:'ignore'});await delay(900);}
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true});
const p=await (await b.newContext({viewport:{width:1200,height:1000}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
const results=[];const ok=(n,c,x='')=>results.push((c?'PASS':'FAIL')+' '+n+(x?' :: '+x:''));
await p.goto(BASE+'/?fresh=aim'+Date.now(),{waitUntil:'networkidle'});
ok('fresh aim boxes empty',(await p.locator('#aimFrom').inputValue())===''&&(await p.locator('#aimTo').inputValue())==='');
await p.locator('#loadExample').click();
await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('Loaded Balonku'),null,{timeout:20000});
ok('aim boxes stay empty after example load',(await p.locator('#aimFrom').inputValue())===''&&(await p.locator('#aimTo').inputValue())==='');
await p.locator('#request').fill('make it softer');await p.locator('#send').click();await delay(400);
ok('fresh whole-piece softer touches all 87 notes',(await p.locator('#status').textContent()).includes('87 notes'),await p.locator('#status').textContent());
await p.locator('#aimFrom').fill('65');await p.locator('#aimTo').fill('69');
await p.locator('#request').fill('make it louder');await p.locator('#send').click();await delay(400);
ok('explicit aim still scopes the edit',(await p.locator('#status').textContent()).includes('4 notes'),await p.locator('#status').textContent());
ok('no page errors',errs.length===0,errs.join('|'));
console.log(results.join('\n'));
await b.close();if(server)server.kill();
process.exit(results.some(r=>r.startsWith('FAIL'))?1:0);
})().catch(e=>{console.error('HARNESS FAIL',e);if(server)server.kill();process.exit(2)});
