const fs=require('fs');const cfg=JSON.parse(fs.readFileSync('debug/bridge.json','utf8'));
const ev=async(js)=>{const r=await fetch('http://127.0.0.1:'+cfg.port+'/eval',{method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json'},body:JSON.stringify({js})});return (await r.json()).result;};
const clickText=(t)=>`(()=>{const w=document.querySelector('.fwin');const e=[...w.querySelectorAll('button')].find(b=>(b.textContent||'').trim()===${JSON.stringify(t)});if(!e)return 'missing';e.click();return 'clicked';})()`;
const fp=`(()=>{const w=document.querySelector('.fwin');return JSON.stringify({chars:(w.textContent||'').length,entries:w.querySelectorAll('.dict-entry').length,nodes:w.querySelectorAll('*').length,lsLen:localStorage.length,active:[...w.querySelectorAll('button.active,[aria-pressed=true]')].map(b=>(b.textContent||'').trim())});})()`;
(async()=>{
 console.log('before', await ev(fp));
 for(const t of process.argv.slice(2)){ console.log(t, await ev(clickText(t))); await new Promise(r=>setTimeout(r,500)); }
 console.log('after', await ev(fp));
})();
