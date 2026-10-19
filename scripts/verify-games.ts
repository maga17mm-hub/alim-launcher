import fs from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../electron/store';
import { Game } from '../electron/game';
import { offlineUuid } from '../electron/security';
import { Content } from '../electron/content';
import type { Loader } from '../electron/types';
async function main(){
const store=new Store(path.resolve('work','acceptance'));
await store.load();store.state.account={name:'AlimTest',uuid:offlineUuid('AlimTest')};await store.save();
const game=new Game(store);const content=new Content(game);let phase='';
game.on('progress',p=>{if(p.phase!==phase){phase=p.phase;console.log(phase);}});game.on('log',line=>{if(/ERROR|Exception|заверш|запущен|runtime/i.test(line))console.log(line);});
const result:any[]=JSON.parse(await fs.readFile('work/game-results.json','utf8').catch(()=>'[]'));
for(const loader of (process.argv.slice(2).length?process.argv.slice(2):['Vanilla','Fabric','Forge','Quilt','NeoForge']) as Loader[]){
 const minecraft=loader==='NeoForge'?'1.20.4':'1.20.1';
 try{const builds=await game.loaders(minecraft,loader);const loaderVersion=loader==='Forge'?'47.2.18':builds[0];if(loaderVersion===undefined)throw new Error('Нет совместимых загрузчиков');let p=store.state.profiles.find(p=>p.loader===loader&&p.minecraft===minecraft);if(!p)p=await store.add({name:`Acceptance ${loader}`,minecraft,loader,loaderVersion});
  if(loader.includes('OptiFine'))await game.optifineImport(p.id,path.resolve('work','OptiFine_1.20.1_HD_U_I6.jar'));
  if(!p.installedVersion)await game.install(p.id);
  if(loader==='Fabric') {const hits=await content.search(p.id,'mods','sodium');const sodium=hits.hits.find((x:any)=>x.slug==='sodium');if(!sodium)throw new Error('Sodium не найден');const versions=await content.versions(p.id,sodium.project_id,'mods');await content.install(p.id,versions[0].id,'mods');const files=await content.list(p.id,'mods');const target=files.find(x=>x.project===sodium.project_id);if(!target)throw new Error('Мод отсутствует');await content.edit(p.id,'mods',target.name,'toggle');await content.edit(p.id,'mods',target.name+'.disabled','toggle');console.log('Modrinth install/toggle: OK');}
  await game.play(p.id);
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('Не дождались графического меню за 120 с'));},120000);const listener=(line:string)=>{if(/Created: .*atlas|OpenAL initialized|Backend library: LWJGL|Narrator library/i.test(line)){setTimeout(()=>{cleanup();game.child?resolve():reject(new Error('Игра завершилась при запуске'));},12000);}};const exited=()=>{cleanup();reject(new Error('Игра завершилась до меню'));};const cleanup=()=>{clearTimeout(timer);game.off('log',listener);game.off('game-exit',exited);};game.on('log',listener);game.on('game-exit',exited);});
  const prior=result.findIndex(x=>x.loader===loader);if(prior>=0)result.splice(prior,1);result.push({loader,minecraft,status:'launched',version:p.installedVersion});await game.cancel();await new Promise(r=>setTimeout(r,2000));
 }catch(e:any){console.error(loader,e);const prior=result.findIndex(x=>x.loader===loader);if(prior>=0)result.splice(prior,1);result.push({loader,minecraft,status:'failed',error:e.message});if(game.child){await game.cancel();await new Promise(r=>setTimeout(r,2000));}}
 await fs.writeFile('work/game-results.json',JSON.stringify(result,null,2));
}
console.log(JSON.stringify(result,null,2));
if(result.some(x=>x.status==='failed'))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
