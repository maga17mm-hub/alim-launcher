import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { State, Profile, Settings } from './types';
export const settingsSchema = z.object({ root: z.string().min(3).max(1000), javaPath: z.string().max(1000), ram: z.number().int().min(512).max(65536), width: z.number().int().min(640).max(7680), height: z.number().int().min(480).max(4320), fullscreen: z.boolean(), snapshots: z.boolean(), legacy: z.boolean(), downloadLimit: z.number().min(0).max(1000), theme: z.enum(['dark','light']), language: z.enum(['ru','en']), afterLaunch: z.enum(['keep','hide']) });
export const profileSchema = z.object({ name: z.string().trim().min(1).max(60), minecraft: z.string().regex(/^[\w.+-]{1,100}$/), loader: z.enum(['Vanilla','Fabric','Forge','NeoForge','Quilt','OptiFine','Forge + OptiFine']), loaderVersion: z.string().regex(/^[\w.+-]{0,100}$/) });
export class Store {
 state!: State;
 constructor(public directory: string) {}
 async load() {
  await fs.mkdir(this.directory,{recursive:true});
  try { this.state = JSON.parse(await fs.readFile(path.join(this.directory,'state.json'),'utf8')); settingsSchema.parse(this.state.settings); }
  catch(e: any) { if(e.code !== 'ENOENT') { await fs.copyFile(path.join(this.directory,'state.json'),path.join(this.directory,`state-backup-${Date.now()}.json`)).catch(()=>{}); }
   this.state = { settings: { root: path.join(this.directory,'game'), javaPath:'', ram:4096, width:1280, height:720, fullscreen:false, snapshots:false, legacy:false, downloadLimit:0, theme:'dark', language:'ru', afterLaunch:'keep' }, profiles:[], selected:'', history:[] };
  }
  await fs.mkdir(this.state.settings.root,{recursive:true});
  return this.state;
 }
 private saving: Promise<void> = Promise.resolve();
 save() { const content = JSON.stringify(this.state,null,2); this.saving = this.saving.catch(()=>{}).then(async()=>{ const file = path.join(this.directory,'state.json'); await fs.writeFile(file+'.tmp',content); await fs.rename(file+'.tmp',file); }); return this.saving; }
 profile(id: string) { const p = this.state.profiles.find(p=>p.id===id); if(!p) throw new Error('Профиль не найден'); return p; }
 async add(input: unknown) { const p: Profile = { ...profileSchema.parse(input), id:randomUUID() }; this.state.profiles.push(p); this.state.selected=p.id; await this.save(); return p; }
 async settings(input: unknown) { const next: Settings = settingsSchema.parse(input); if(!path.isAbsolute(next.root)) throw new Error('Выберите абсолютный путь'); if(this.state.profiles.length && path.resolve(next.root)!==path.resolve(this.state.settings.root)) throw new Error('Корень можно изменить до создания профилей. Для переноса сохраните папку game и измените путь после удаления профилей.'); this.state.settings=next; await fs.mkdir(next.root,{recursive:true}); await this.save(); }
 async record(text: string) { this.state.history.unshift({date:new Date().toISOString(),text}); this.state.history=this.state.history.slice(0,100); await this.save(); }
}
