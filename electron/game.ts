import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { Agent, interceptors } from 'undici';
import { Version, launch, LaunchPrecheck, DEFAULT_EXTRA_JVM_ARGS } from '@xmcl/core';
import { extractNatives } from './natives';
import { installTask, installDependenciesTask, installForgeTask, installNeoForgedTask, installFabric, installQuiltVersion, installOptifineTask, fetchJavaRuntimeManifest, installJavaRuntimeTask } from '@xmcl/installer';
import type { Task } from '@xmcl/task';
import type { Store } from './store';
import type { Loader, Profile, Progress, VersionInfo } from './types';
import { inside, safeName, offlineUuid } from './security';
import { download, json } from './network';
const exec = promisify(execFile);
const MANIFEST='https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
export const optifinePairs: Record<string,{forge:string;file:string}> = { '1.20.1': {forge:'47.2.18',file:'OptiFine_1.20.1_HD_U_I6.jar'} };
export class Game extends EventEmitter {
 progress: Progress={busy:false,phase:'Готов к игре',progress:0,total:0};
 logs: string[]=[];
 task?: Task<any>;
 controller?: AbortController;
 child?: ChildProcess;
 private stopped=false;
 constructor(public store: Store) { super(); }
 get root() { return this.store.state.settings.root; }
 get shared() { return path.join(this.root,'runtime'); }
 folder(p: Profile) { return inside(this.root,'profiles',p.id); }
 assertIdle() { if(this.progress.busy || this.child) throw new Error('Дождитесь завершения операции или закройте игру'); }
 log(message: string) { const line=`[${new Date().toLocaleTimeString('ru-RU')}] ${message}`; this.logs.push(line); if(this.logs.length>2000) this.logs.shift(); this.emit('log',line); fs.mkdir(path.join(this.store.directory,'logs'),{recursive:true}).then(()=>fs.appendFile(path.join(this.store.directory,'logs','launcher.log'),line+'\n')).catch(()=>{}); }
 set(p: Partial<Progress>) { this.progress={...this.progress,...p}; this.emit('progress',this.progress); }
 async versions(): Promise<{versions:VersionInfo[];latest:{release:string;snapshot:string};cached?:boolean}> { const cache=path.join(this.store.directory,'manifest.json'); try { const data=await json(MANIFEST); await fs.writeFile(cache,JSON.stringify(data)); return data; } catch(e) { try { return {...JSON.parse(await fs.readFile(cache,'utf8')),cached:true}; } catch { throw e; } } }
 async loaders(mc: string, loader: Loader): Promise<string[]> {
  const enc=encodeURIComponent(mc);
  if(loader==='Vanilla'||loader==='OptiFine') return [''];
  if(loader==='Forge + OptiFine') return optifinePairs[mc] ? [optifinePairs[mc].forge] : [];
  if(loader==='Fabric'||loader==='Quilt') { const host=loader==='Fabric'?'meta.fabricmc.net':'meta.quiltmc.org'; const version=loader==='Fabric'?'v2':'v3'; const list=await json(`https://${host}/${version}/versions/loader/${enc}`); return list.map((x:any)=>x.loader.version); }
  if(loader==='Forge') { const data=await json('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json'); return (data[mc]||[]).map((x:string)=>x.startsWith(mc+'-')?x.slice(mc.length+1):x).reverse(); }
  const res=await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',{signal:AbortSignal.timeout(45000)}); if(!res.ok) throw new Error(`NeoForge: HTTP ${res.status}`); const text=await res.text(); const m=/^1\.(\d+)\.(\d+)$/.exec(mc); if(!m) return []; const prefix=`${m[1]}.${m[2]}.`; return [...text.matchAll(/<version>([^<]+)<\/version>/g)].map(x=>x[1]).filter(x=>x.startsWith(prefix)).reverse();
 }
 async run<T>(task: Task<T>): Promise<T> { this.controller?.signal.throwIfAborted(); this.task=task; let last=0; try { return await task.startAndWait({onStart:t=>{ if(t===task) this.log(`Установка: ${t.name}`); },onUpdate:()=>{ if(Date.now()-last>120) {last=Date.now();this.set({progress:task.progress,total:task.total});} },onFailed:(_,e)=>this.log(`Ошибка: ${String(e).slice(0,1000)}`)}); } finally {this.task=undefined;} }
 async javaInfo(file: string) { try { const r=await exec(file,['-version'],{timeout:10000,windowsHide:true}); const match=/(?:openjdk|java) version "(\d+)(?:\.(\d+))?/.exec(r.stderr+r.stdout); return match ? (match[1]==='1'?Number(match[2]):Number(match[1])):0; } catch {return 0;} }
 async java(major: number, component: string) {
  const configured=this.store.state.settings.javaPath;
  if(configured) { const actual=await this.javaInfo(configured); if(actual!==major) throw new Error(`Для этой версии нужна Java ${major}, выбранная Java: ${actual||'не найдена'}`); return configured; }
  const destination=path.join(this.root,'java',safeName(component)); const managed=path.join(destination,'bin','java.exe');
  if(await this.javaInfo(managed)===major) return managed;
  const candidates=['java',...(process.env.JAVA_HOME?[path.join(process.env.JAVA_HOME,'bin','java.exe')]:[]),'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe'];
  for(const c of candidates) if(await this.javaInfo(c)===major) return c;
  this.set({phase:`Установка Java ${major}`,progress:0,total:0}); this.log(`Загрузка официального runtime ${component} (Java ${major})`);
  const index=await json('https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json',this.controller?.signal);const target=index['windows-x64'][component]?.[0];if(!target)throw new Error(`Нет Windows runtime ${component}`);const cached=path.join(this.store.directory,`java-${component}.json`);await download(target.manifest.url,cached,{algorithm:'sha1',value:target.manifest.sha1},this.controller?.signal);const manifest={...JSON.parse(await fs.readFile(cached,'utf8')),target:component,version:target.version}; this.controller?.signal.throwIfAborted();const javaAgent=this.dispatcher();try{await this.run(installJavaRuntimeTask({destination,manifest,skipRevalidate:false,dispatcher:javaAgent as any}));}finally{await javaAgent.close();}
  if(await this.javaInfo(managed)!==major) throw new Error('Загруженная Java не соответствует требованиям игры'); return managed;
 }
 private dispatcher() {
  const rate=this.store.state.settings.downloadLimit; const agent=new Agent({connections:6,pipelining:1});
  const original=agent.dispatch.bind(agent); let next=Date.now();
  agent.dispatch=((opts:any,handler:any)=>{
   const origin=new URL(String(opts.origin)); if(origin.protocol==='http:') origin.protocol='https:'; if(origin.protocol!=='https:') throw new Error('Небезопасный протокол загрузки');
   let resume:()=>void=()=>{}; const wrapped:any=Object.create(handler);
   wrapped.onHeaders=(status:any,headers:any,resumeFn:any,statusText:any)=>{resume=resumeFn;return handler.onHeaders?.(status,headers,resumeFn,statusText);};
   if(rate) wrapped.onData=(chunk:Buffer)=>{const ok=handler.onData?.(chunk); next=Math.max(Date.now(),next)+chunk.length/(rate*1024*1024)*1000; const delay=next-Date.now(); if(ok!==false&&delay>5) {setTimeout(resume,delay); return false;} return ok;};
   const {throwOnError,maxRedirections,...supported}=opts;
   return original({...supported,origin:origin.origin},wrapped);
  }) as typeof agent.dispatch;
  return agent.compose(interceptors.redirect({maxRedirections:5}),interceptors.retry({maxRetries:3,minTimeout:500}));
 }
 async install(id: string, force=false) {
  this.assertIdle(); const p=this.store.profile(id); this.controller=new AbortController(); this.set({busy:true,error:undefined,phase:'Проверка версии',progress:0,total:0}); const agent=this.dispatcher();
  try {
   const all=await this.versions(); const meta=all.versions.find(v=>v.id===p.minecraft); if(!meta) throw new Error('Версия отсутствует в официальном манифесте');
   if(p.loader!=='Vanilla'&&p.loader!=='OptiFine') { const available=await this.loaders(p.minecraft,p.loader); if(!available.includes(p.loaderVersion)) throw new Error('Загрузчик несовместим с выбранной версией Minecraft'); }
   const metaPath=path.join(this.shared,'versions',p.minecraft,p.minecraft+'.json');
   if(meta.sha1) await download(meta.url,metaPath,{algorithm:'sha1',value:meta.sha1},this.controller.signal,this.store.state.settings.downloadLimit);
   const raw=meta.sha1?JSON.parse(await fs.readFile(metaPath,'utf8')):await json(meta.url,this.controller.signal);
   const major=raw.javaVersion?.majorVersion||8; const component=raw.javaVersion?.component||'jre-legacy'; const java=await this.java(major,component);
   this.controller.signal.throwIfAborted(); this.set({phase:'Minecraft: клиент, библиотеки и ресурсы',progress:0,total:0});
   const options={dispatcher:agent as any,skipRevalidate:false,skipPrevalidate:false,assetsDownloadConcurrency:6,librariesDownloadConcurrency:6,prevalidSizeOnly:false,mavenHost:'https://maven.minecraftforge.net',libraryHost:(lib:any)=>lib.download?.url?.replace(/^http:/,'https:')};
   const base=await this.run(installTask(meta,this.shared,options)); let version=base.id;
   this.set({phase:`Установка ${p.loader}`,progress:0,total:0});
   if(p.loader==='Fabric') version=await installFabric({minecraft:this.shared,minecraftVersion:p.minecraft,version:p.loaderVersion,signal:this.controller.signal});
   if(p.loader==='Quilt') version=await installQuiltVersion({minecraft:this.shared,minecraftVersion:p.minecraft,version:p.loaderVersion,signal:this.controller.signal});
   if(p.loader==='Forge'||p.loader==='Forge + OptiFine') version=await this.run(installForgeTask({mcversion:p.minecraft,version:p.loaderVersion},this.shared,{...options,java}));
   if(p.loader==='NeoForge') version=await this.run(installNeoForgedTask('neoforge',p.loaderVersion,this.shared,{...options,java}));
   if(p.loader==='OptiFine') { if(!p.optifine) throw new Error('Сначала импортируйте официальный установщик OptiFine .jar'); version=await this.run(installOptifineTask(p.optifine,this.shared,{java})); const parsed=await Version.parse(this.shared,version); if(!parsed.inheritances.includes(p.minecraft)) throw new Error('OptiFine предназначен для другой версии Minecraft'); }
   if(p.loader==='Forge + OptiFine') { const pair=optifinePairs[p.minecraft]; if(!p.optifine||path.basename(p.optifine)!==pair?.file) throw new Error(`Импортируйте официальный ${pair?.file}`); await fs.mkdir(path.join(this.folder(p),'mods'),{recursive:true}); await fs.copyFile(p.optifine,path.join(this.folder(p),'mods',pair.file)); }
   this.controller.signal.throwIfAborted(); await this.run(installDependenciesTask(await Version.parse(this.shared,version),options));
   for(const dir of ['mods','resourcepacks','shaderpacks','saves','logs']) await fs.mkdir(path.join(this.folder(p),dir),{recursive:true});
   p.installedVersion=version; p.installedAt=new Date().toISOString(); await this.store.record(`${force?'Проверен':'Установлен'} ${p.name}: ${version}`); this.log(`Установка завершена: ${version}`); this.set({phase:'Установка завершена',progress:1,total:1}); return p;
  } catch(e:any) { const message=this.controller.signal.aborted?'Установка отменена':(e.message||String(e)); this.log(message); this.set({error:message,phase:message}); throw new Error(message); }
  finally {this.controller=undefined;this.set({busy:false});await agent.close().catch(()=>{});}
 }
 async play(id: string) {
  this.assertIdle(); const p=this.store.profile(id); if(!this.store.state.account) throw new Error('Сначала задайте офлайн-ник в разделе «Аккаунт»'); if(!p.installedVersion) await this.install(id);
  this.set({busy:true,phase:'Запуск Minecraft',error:undefined});
  try { const resolved=await Version.parse(this.shared,p.installedVersion!); const java=await this.java(resolved.javaVersion?.majorVersion||8,resolved.javaVersion?.component||'jre-legacy'); const s=this.store.state.settings;
   this.stopped=false;const temp=path.join(this.root,'tmp');await fs.mkdir(temp,{recursive:true});
   const child=await launch({gamePath:this.folder(p),resourcePath:this.shared,javaPath:java,version:resolved,gameProfile:{name:this.store.state.account!.name,id:this.store.state.account!.uuid},accessToken:'0',userType:'legacy',minMemory:512,maxMemory:s.ram,extraJVMArgs:[...DEFAULT_EXTRA_JVM_ARGS.filter(x=>!x.startsWith('-Xmx')),`-Djava.io.tmpdir=${temp}`,`-Djdk.net.unixdomain.tmpdir=${temp}`],resolution:{width:s.width,height:s.height,fullscreen:s.fullscreen},launcherName:'AlimLauncher',launcherBrand:'Alim Launcher',features:{alim_identity:{clientid:offlineUuid('AlimLauncher'),auth_xuid:'0'}},extraExecOption:{windowsHide:true},prechecks:[LaunchPrecheck.checkVersion,LaunchPrecheck.checkLibraries,extractNatives,LaunchPrecheck.linkAssets]});
   this.child=child; const logPath=path.join(this.folder(p),'logs','alim-launch.log'); const output=(chunk:Buffer)=>{const text=chunk.toString();for(const line of text.trim().split('\n')) this.log(line);fs.appendFile(logPath,text).catch(()=>{});}; child.stdout?.on('data',output);child.stderr?.on('data',output); child.on('error',e=>this.log(e.message));
   child.on('exit',(code)=>{this.child=undefined;this.log(`Minecraft завершён, код ${code}${this.stopped?' (по запросу пользователя)':''}`);const normal=code===0||this.stopped;this.set({busy:false,running:false,phase:normal?'Игра завершена':`Игра завершена с кодом ${code}. Откройте журнал.`,error:normal?undefined:`Minecraft: код ${code}`});this.emit('game-exit');});
   p.lastPlayed=new Date().toISOString();await this.store.record(`Запущен ${p.name}`);this.log(`Minecraft запущен, PID ${child.pid}`);this.set({running:true,phase:'Minecraft запущен'});this.emit('game-start');return {pid:child.pid};
  } catch(e:any) {this.set({busy:false,running:false,error:e.message,phase:'Ошибка запуска'});throw e;}
 }
 async cancel() { if(this.child) {this.stopped=true;this.child.kill();return;} this.controller?.abort(); await this.task?.cancel(10000); }
 async optifineImport(id: string, file: string) { this.assertIdle(); const p=this.store.profile(id); if(!['OptiFine','Forge + OptiFine'].includes(p.loader)) throw new Error('Выберите профиль OptiFine'); const name=safeName(path.basename(file)); if(!name.startsWith(`OptiFine_${p.minecraft}_`)||!name.endsWith('.jar')) throw new Error('Нужен официальный OptiFine JAR для версии '+p.minecraft); if(p.loader==='Forge + OptiFine'&&name!==optifinePairs[p.minecraft]?.file) throw new Error('Для этой связки разрешён только '+optifinePairs[p.minecraft]?.file); const dest=path.join(this.root,'imports',p.id,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(file,dest);p.optifine=dest;p.installedVersion=undefined;await this.store.save(); }
}
