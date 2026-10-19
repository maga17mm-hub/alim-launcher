import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { httpsUrl } from './security';
export async function json<T = any>(url: string, signal?: AbortSignal): Promise<T> { const res = await fetch(httpsUrl(url), {signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000), headers:{'User-Agent':'AlimLauncher/1.0 (github.com/maga17mm-hub/alim-launcher)'} }); if(!res.ok) throw new Error(`Сервис ${new URL(url).hostname}: HTTP ${res.status}`); return res.json() as Promise<T>; }
export async function download(url: string, dest: string, hash: {algorithm:string; value:string}, signal?: AbortSignal, limit=0, progress?: (n:number,total:number)=>void) {
 const res=await fetch(httpsUrl(url),{signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000)}); if(!res.ok||!res.body) throw new Error(`Ошибка загрузки: HTTP ${res.status}`);
 await fs.mkdir(path.dirname(dest),{recursive:true}); const temp=dest+'.part'; const handle=await fs.open(temp,'w'); const digest=createHash(hash.algorithm); let count=0; const start=Date.now();
 try { for await(const chunk of res.body as any) { signal?.throwIfAborted(); digest.update(chunk); await handle.write(chunk); count+=chunk.length; progress?.(count,Number(res.headers.get('content-length'))||0); if(limit) { const delay=count/(limit*1024*1024)*1000-(Date.now()-start); if(delay>0) await new Promise(r=>setTimeout(r,Math.min(delay,1000))); } } if(digest.digest('hex').toLowerCase()!==hash.value.toLowerCase()) throw new Error('Контрольная сумма не совпала. Повторите загрузку.'); await handle.close(); await fs.rename(temp,dest); }
 catch(e) { await handle.close().catch(()=>{}); await fs.rm(temp,{force:true}); throw e; }
}
