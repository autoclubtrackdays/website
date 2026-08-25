const { spawn } = require('child_process'); const http = require('http'); const WebSocket = require('ws'); const fs = require('fs');
const puerto = 9396;
const servidor = spawn('node', ['src/dashboard/servidor.mjs'], { stdio: 'ignore' });
const chrome = spawn('/usr/bin/chromium', ['--headless=new','--disable-gpu','--no-sandbox','--window-size=1300,1000',`--remote-debugging-port=${puerto}`,'about:blank'], { stdio:'ignore' });
const esperar = ms => new Promise(r=>setTimeout(r,ms));
const pedir = ruta => new Promise((res,rej)=>http.get({host:'127.0.0.1',port:puerto,path:ruta},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej));
const fin = c => { servidor.kill('SIGKILL'); chrome.kill(); process.exit(c); };
(async () => {
  await esperar(4000);
  const pagina = (await pedir('/json/list')).find(o=>o.type==='page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl); let id=0;
  const enviar=(m,p)=>new Promise(res=>{const i=++id;const cb=raw=>{const x=JSON.parse(raw);if(x.id===i){ws.off('message',cb);res(x.result);}};ws.on('message',cb);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  await new Promise(r=>ws.on('open',r));
  await enviar('Page.enable'); await enviar('Runtime.enable');
  const ev = async e => { const r = await enviar('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if (r.exceptionDetails) console.log('  !! error:', r.exceptionDetails.exception?.description?.split('\n')[0]); return r.result.value; };
  await enviar('Page.navigate',{url:'http://localhost:4322/'}); await esperar(2000);
  await ev(`window.confirm = () => true`);

  const estadoBoton = `JSON.stringify({texto: document.getElementById('cerrar').textContent, resaltado: document.getElementById('cerrar').classList.contains('pendiente'), fondo: getComputedStyle(document.getElementById('cerrar')).backgroundColor, color: getComputedStyle(document.getElementById('cerrar')).color})`;
  console.log('1. sin cambios     ->', await ev(estadoBoton));

  // Un cambio cualquiera: quitar y poner un destacado deja el archivo tocado
  await ev(`document.getElementById('ver-destacados').click()`); await esperar(1200);
  const hayCandidato = await ev(`!!document.querySelector('#destacados button[data-anadir]')`);
  if (hayCandidato) {
    await ev(`document.querySelector('#destacados button[data-anadir]').click()`); await esperar(1500);
    console.log('2. tras destacar   ->', await ev(estadoBoton));
    console.log('   aviso sin botón de publicar:', await ev(`!document.querySelector('#resultado button')`));
  } else { console.log('2. (no había candidatos para destacar)'); }

  console.log('3. cerrando (publica y apaga)...');
  await ev(`document.getElementById('cerrar').click()`); await esperar(6000);
  console.log('   pantalla final:', await ev(`document.querySelector('h1')?.textContent`), '|', await ev(`document.querySelector('main p')?.textContent?.slice(0,40)`));
  ws.close(); fin(0);
})().catch(e => { console.error('fallo:', e.message); fin(1); });
