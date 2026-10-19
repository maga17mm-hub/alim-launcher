import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { autoUpdater } from 'electron-updater';
import { z } from 'zod';
import { Store } from './store';
import { Game } from './game';
import { Content } from './content';
import { offlineUuid, inside } from './security';
import type { UpdateState } from './types';
if(process.env.ALIM_USER_DATA) app.setPath('userData',path.resolve(process.env.ALIM_USER_DATA));
let win:BrowserWindow;let store:Store;let game:Game;let content:Content;let update:UpdateState={status:'idle'};
const idSchema=z.string().uuid();const categorySchema=z.enum(['mods','resourcepacks','shaderpacks']);
const emit=(channel:string,data:any)=>{if(win&&!win.isDestroyed())win.webContents.send(channel,data);};
const updateState=(data:UpdateState)=>{update=data;emit('update',data);};
function skinData(data:unknown) {const value=z.string().max(2_000_000).parse(data);if(!value.startsWith('data:image/png;base64,'))throw new Error('Нужен PNG');const buf=Buffer.from(value.slice(22),'base64');if(buf.length<24||buf.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Некорректный PNG');const width=buf.readUInt32BE(16),height=buf.readUInt32BE(20);if(width!==64||![32,64].includes(height))throw new Error('Размер скина должен быть 64×64 или 64×32');if(nativeImage.createFromBuffer(buf).isEmpty())throw new Error('PNG повреждён');return buf;}
async function selectFile(extensions:string[],multiple=false) {const r=await dialog.showOpenDialog(win,{properties:multiple?['openFile','multiSelections']:['openFile'],filters:[{name:extensions.join(', '),extensions}]});return r.canceled?[]:r.filePaths;}
async function handle(method:string,payload:any) {
 switch(method) {
  case 'snapshot':return {state:store.state,version:app.getVersion(),memory:Math.floor(os.totalmem()/1024/1024),progress:game.progress,update,logs:game.logs};
  case 'versions':return game.versions();
  case 'loaders':{const a=z.object({minecraft:z.string().regex(/^[\w.+-]{1,100}$/),loader:z.enum(['Vanilla','Fabric','Forge','NeoForge','Quilt','OptiFine','Forge + OptiFine'])}).parse(payload);return game.loaders(a.minecraft,a.loader);}
  case 'account':{const name=z.string().regex(/^[a-zA-Z0-9_]{3,16}$/,'Ник: 3–16 латинских букв, цифр или _').parse(payload);store.state.account={name,uuid:offlineUuid(name)};await store.save();return store.state.account;}
  case 'logout':game.assertIdle();store.state.account=undefined;await store.save();return;
  case 'profile.create':{game.assertIdle();const p=await store.add(payload);await fs.mkdir(game.folder(p),{recursive:true});return p;}
  case 'profile.select':store.state.selected=store.profile(idSchema.parse(payload)).id;await store.save();return;
  case 'profile.rename':{game.assertIdle();const a=z.object({id:idSchema,name:z.string().trim().min(1).max(60)}).parse(payload);store.profile(a.id).name=a.name;await store.save();return;}
  case 'profile.remove':{game.assertIdle();const p=store.profile(idSchema.parse(payload));const result=await dialog.showMessageBox(win,{type:'warning',title:'Удалить сборку?',message:`Удалить «${p.name}»?`,detail:'Все миры, моды и настройки только этого профиля будут удалены. Действие нельзя отменить.',buttons:['Отмена','Удалить'],defaultId:0,cancelId:0});if(result.response!==1)return false;const target=game.folder(p);if((await fs.lstat(target)).isSymbolicLink())throw new Error('Удаление ссылки запрещено');await fs.rm(target,{recursive:true,force:true});store.state.profiles=store.state.profiles.filter(x=>x.id!==p.id);store.state.selected=store.state.profiles[0]?.id||'';await store.save();return true;}
  case 'settings':game.assertIdle();await store.settings(payload);return;
  case 'chooseRoot':{const r=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0];}
  case 'chooseJava':return (await selectFile(['exe']))[0]||null;
  case 'install':return game.install(idSchema.parse(payload),true);
  case 'play':return game.play(idSchema.parse(payload));
  case 'cancel':return game.cancel();
  case 'folder':{const a=z.object({id:idSchema,folder:z.enum(['','mods','resourcepacks','shaderpacks','saves','logs'])}).parse(payload);const p=store.profile(a.id);const dir=a.folder?inside(game.folder(p),a.folder):game.folder(p);await fs.mkdir(dir,{recursive:true});const error=await shell.openPath(dir);if(error)throw new Error(error);return;}
  case 'search':{const a=z.object({id:idSchema,category:categorySchema,query:z.string().max(200),offset:z.number().int().min(0).max(10000).default(0)}).parse(payload);return content.search(a.id,a.category,a.query,a.offset);}
  case 'content.versions':{const a=z.object({id:idSchema,project:z.string().regex(/^[\w-]{1,100}$/),category:categorySchema}).parse(payload);return content.versions(a.id,a.project,a.category);}
  case 'content.install':{const a=z.object({id:idSchema,version:z.string().regex(/^[\w-]{1,100}$/),category:categorySchema}).parse(payload);return content.install(a.id,a.version,a.category);}
  case 'content.list':{const a=z.object({id:idSchema,category:categorySchema}).parse(payload);return content.list(a.id,a.category);}
  case 'content.edit':{const a=z.object({id:idSchema,category:categorySchema,name:z.string().max(255),action:z.enum(['toggle','remove'])}).parse(payload);if(a.action==='remove'){const r=await dialog.showMessageBox(win,{type:'question',message:`Удалить ${a.name}?`,buttons:['Отмена','Удалить'],cancelId:0,defaultId:0});if(r.response!==1)return;}return content.edit(a.id,a.category,a.name,a.action);}
  case 'content.import':{const a=z.object({id:idSchema,category:categorySchema}).parse(payload);return content.import(a.id,a.category,await selectFile([a.category==='mods'?'jar':'zip'],true));}
  case 'optifine.import':{const id=idSchema.parse(payload);const files=await selectFile(['jar']);if(files[0])await game.optifineImport(id,files[0]);return;}
  case 'skin.import':{const files=await selectFile(['png']);if(!files[0])return null;const data='data:image/png;base64,'+(await fs.readFile(files[0])).toString('base64');skinData(data);return data;}
  case 'skin.load':try{const model=JSON.parse(await fs.readFile(path.join(store.directory,'skin-model.json'),'utf8').catch(()=>'{"model":"default"}')).model;return {data:'data:image/png;base64,'+(await fs.readFile(path.join(store.directory,'skin.png'))).toString('base64'),model:model==='slim'?'slim':'default'};}catch(e:any){if(e.code==='ENOENT')return null;throw e;}
  case 'skin.save':{const a=z.object({data:z.string(),model:z.enum(['default','slim'])}).parse(payload);const buffer=skinData(a.data);await fs.writeFile(path.join(store.directory,'skin.png'),buffer);await fs.writeFile(path.join(store.directory,'skin-model.json'),JSON.stringify({model:a.model}));return;}
  case 'skin.export':{const buffer=skinData(payload);const r=await dialog.showSaveDialog(win,{defaultPath:'Alim-skin.png',filters:[{name:'Minecraft Skin',extensions:['png']}]});if(!r.canceled&&r.filePath)await fs.writeFile(r.filePath,buffer);return !r.canceled;}
  case 'update.check':if(!app.isPackaged) {updateState({status:'Проверка доступна в установленном приложении'});return;}if(['checking','downloading'].includes(update.status))return;await autoUpdater.checkForUpdates();return;
  case 'update.download':if(!app.isPackaged)throw new Error('Установите EXE');await autoUpdater.downloadUpdate();return;
  case 'update.install':game.assertIdle();if(update.status!=='downloaded')throw new Error('Обновление ещё не загружено');autoUpdater.quitAndInstall(false,true);return;
  case 'window.minimize':win.minimize();return;
  case 'window.maximize':win.isMaximized()?win.unmaximize():win.maximize();return;
  case 'window.close':win.close();return;
  case 'external':{const url=z.enum(['https://optifine.net/downloads','https://www.minecraft.net/store/minecraft-java-bedrock-edition-pc','https://github.com/maga17mm-hub/alim-launcher','https://modrinth.com']).parse(payload);await shell.openExternal(url);return;}
  default:throw new Error('Неизвестная команда');
 }
}
async function start() {
 store=new Store(app.getPath('userData'));await store.load();game=new Game(store);content=new Content(game);
 win=new BrowserWindow({width:1320,height:850,minWidth:1000,minHeight:680,frame:false,backgroundColor:'#071713',icon:path.join(app.getAppPath(),'build','icon.ico'),show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 const dev=process.env.ALIM_DEV_URL;
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(!(dev&&new URL(url).origin===new URL(dev).origin))e.preventDefault();});win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 ipcMain.handle('alim',async(event,method,payload)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return {ok:false,error:'IPC запрещён'};try{return {ok:true,value:await handle(z.string().max(50).parse(method),payload)};}catch(e:any){game.log(e.message||String(e));return {ok:false,error:e.message||String(e)};}});
 game.on('progress',p=>emit('progress',p));game.on('log',line=>emit('log',line));game.on('game-start',()=>{if(store.state.settings.afterLaunch==='hide')win.hide();});game.on('game-exit',()=>{win.show();});
 win.on('close',e=>{if(game.progress.busy){e.preventDefault();if(!win.isVisible())win.show();dialog.showMessageBox(win,{message:'Сначала закройте Minecraft или отмените загрузку.',type:'info'});}});
 autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=true;autoUpdater.allowPrerelease=false;
 autoUpdater.on('checking-for-update',()=>updateState({status:'checking'}));autoUpdater.on('update-not-available',()=>updateState({status:'current'}));autoUpdater.on('update-available',info=>updateState({status:'available',version:info.version,notes:typeof info.releaseNotes==='string'?info.releaseNotes:info.releaseNotes?.map(n=>n.note).join('\n')}));autoUpdater.on('download-progress',p=>updateState({...update,status:'downloading',percent:p.percent}));autoUpdater.on('update-downloaded',info=>updateState({...update,status:'downloaded',version:info.version}));autoUpdater.on('error',e=>{game.log('Обновление: '+e.message);updateState({status:'error',notes:e.message});});
 if(dev)await win.loadURL(dev);else await win.loadFile(path.join(__dirname,'renderer','index.html'));win.show();if(app.isPackaged)setTimeout(()=>{if(update.status==='idle')autoUpdater.checkForUpdates().catch(()=>{});},5000);
}
if(!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',()=>{win?.show();win?.focus();});app.whenReady().then(start).catch(e=>{dialog.showErrorBox('Alim Launcher',String(e));app.exit(1);});app.on('window-all-closed',()=>app.quit());}
