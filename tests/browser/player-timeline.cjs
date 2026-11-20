const {chromium}=require('/usr/share/code/resources/app/node_modules/playwright-core');
const {spawn}=require('child_process');
const BASE=process.argv[2];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let server=null;
(async()=>{
if(BASE.includes('127.0.0.1')){server=spawn('python3',['-m','http.server','8129','--bind','127.0.0.1'],{cwd:process.env.HOME+'/denting',stdio:'ignore'});await delay(900);}
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],headless:true});
const p=await (await b.newContext({viewport:{width:1200,height:1000}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
const results=[];const ok=(n,c,x='')=>results.push((c?'PASS':'FAIL')+' '+n+(x?' :: '+x:''));
await p.goto(BASE+'/?fresh=player'+Date.now(),{waitUntil:'networkidle'});
// patch AudioContext BEFORE first play to capture scheduled gains/starts
await p.evaluate(()=>{
  window.__caps={gains:[],starts:[]};
  const AC=window.AudioContext||window.webkitAudioContext;
  window.AudioContext=class extends AC{
    createGain(){const g=super.createGain();const o=g.gain.setValueAtTime.bind(g.gain);g.gain.setValueAtTime=(v,t)=>{window.__caps.gains.push({v,t});return o(v,t);};return g;}
    createOscillator(){const o=super.createOscillator();const s=o.start.bind(o);o.start=(t)=>{window.__caps.starts.push(t);return s(t);};return o;}
  };
});
await p.locator('#loadExample').click();
await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('Loaded Balonku'),null,{timeout:20000});
ok('readout shows duration',(await p.locator('#playPos').textContent()).includes('of 56.5s'),await p.locator('#playPos').textContent());
ok('readout starts at beat 0',(await p.locator('#playPos').textContent()).startsWith('beat 0.0'),await p.locator('#playPos').textContent());
// seek to 30.0s
await p.locator('#playhead').fill('300');
await p.locator('#playhead').dispatchEvent('input');
await delay(200);
const rd=await p.locator('#playPos').textContent();
ok('seek shows beat 60 at 30s',rd.includes('beat 60.0')&&rd.includes('30.0s of'),rd);
// play from seek: capture scheduling
await p.locator('#play').click();
await delay(300);
let caps=await p.evaluate(()=>({gains:window.__caps.gains.length,starts:window.__caps.starts.slice()}));
const maxStart=Math.max(...caps.starts), minStart=Math.min(...caps.starts);
ok('plays from seek: first note near t0',minStart<0.3,'minStart='+minStart.toFixed(3));
ok('plays from seek: nothing past remaining duration',maxStart<=56.5-30+0.25,'maxStart='+maxStart.toFixed(3));
// position advances while playing
const rd1=await p.locator('#playPos').textContent();
await delay(1300);
const rd2=await p.locator('#playPos').textContent();
ok('playhead advances during playback',rd1!==rd2&&parseFloat(rd2.split('\u00b7')[1])>parseFloat(rd1.split('\u00b7')[1]),rd1+' -> '+rd2);
// stop freezes the readout
await p.locator('#stop').click();
const rdStop1=await p.locator('#playPos').textContent();
await delay(500);
const rdStop2=await p.locator('#playPos').textContent();
ok('stop freezes playhead',rdStop1===rdStop2,rdStop1);
// baseline capture from 0: same-note comparison before/after edits
await p.locator('#playhead').fill('0');await p.locator('#playhead').dispatchEvent('input');
await p.evaluate(()=>{window.__caps.gains=[];window.__caps.starts=[];});
await p.locator('#play').click();await delay(300);
const base=await p.evaluate(()=>({gains:window.__caps.gains.slice(),starts:window.__caps.starts.slice()}));
await p.locator('#stop').click();
const g0=base.gains[0].v;
const uniq=a=>[...new Set([...a].sort((x,y)=>x-y).map(s=>s.toFixed(3)))].map(Number);
const ub=uniq(base.starts);
const gap0=ub[1]-ub[0];
// whole-piece softer: playback gains scale by 0.8
await p.locator('#aimFrom').fill('');await p.locator('#aimTo').fill('');
await p.locator('#request').fill('make it softer');await p.locator('#send').click();
await delay(400);
ok('softer with cleared aim is whole-piece',(await p.locator('#status').textContent()).includes('87 notes'),await p.locator('#status').textContent());
await p.evaluate(()=>{window.__caps.gains=[];window.__caps.starts=[];});
await p.locator('#play').click();await delay(300);
const g1=(await p.evaluate(()=>window.__caps.gains.slice()))[0].v;
const g1exp=Math.round((g0*127/0.15)*0.8)/127*0.15;
ok('playback gain reflects velocity x0.8 (integer velocity rounding)',Math.abs(g1-g1exp)<1e-6,g0+' -> '+g1+' expected '+g1exp);
await p.locator('#stop').click();
// faster: start times compress by 120/132
await p.evaluate(()=>{window.__caps.gains=[];window.__caps.starts=[];});
await p.locator('#playhead').fill('0');await p.locator('#playhead').dispatchEvent('input');
await p.locator('#request').fill('make it faster');await p.locator('#send').click();
await delay(300);
await p.locator('#play').click();await delay(300);
const caps2=await p.evaluate(()=>({starts:window.__caps.starts.slice()}));
const u=uniq(caps2.starts);
const gap1=u[1]-u[0];
ok('faster compresses playback timing',Math.abs(gap1-gap0*(120/132))<0.02,'gap '+gap0.toFixed(3)+' -> '+gap1.toFixed(3));
await p.locator('#stop').click();
// slower works typed now
await p.locator('#request').fill('make it slower');await p.locator('#send').click();
await delay(300);
ok('typed slower sets tempo',(await p.locator('#status').textContent()).includes('Tempo set to'),await p.locator('#status').textContent());
ok('no page errors',errs.length===0,errs.join('|'));
console.log(results.join('\n'));
await b.close();if(server)server.kill();
process.exit(results.some(r=>r.startsWith('FAIL'))?1:0);
})().catch(e=>{console.error('HARNESS FAIL',e);if(server)server.kill();process.exit(2)});
