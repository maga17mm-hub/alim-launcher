import { spawn } from 'node:child_process';
const cmd=process.platform==='win32'?'npm.cmd':'npm';
const run=(args,env={})=>spawn(cmd,args,{shell:process.platform==='win32',stdio:'inherit',env:{...process.env,...env}});
const build=run(['run','build']);build.on('exit',code=>{if(code)process.exit(code);const server=run(['exec','vite','--','--host','127.0.0.1']);const timer=setInterval(async()=>{try{await fetch('http://127.0.0.1:5173');clearInterval(timer);const app=run(['start'],{ALIM_DEV_URL:'http://127.0.0.1:5173'});app.on('exit',()=>{server.kill();process.exit();});}catch{}},400);});
