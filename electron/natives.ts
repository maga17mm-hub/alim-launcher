import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import type { LaunchPrecheck } from '@xmcl/core';
// Sequential extraction with current yauzl streams on Node 24.
// Archive names never become output paths; only Windows DLL basenames are used.
export const extractNatives: LaunchPrecheck=async(resource,version,options)=>{
 const target=options.nativeRoot||resource.getNativesRoot(version.id);await fsp.mkdir(target,{recursive:true});
 for(const lib of version.libraries.filter(l=>l.isNative||l.classifier.startsWith('natives'))){
  await new Promise<void>((resolve,reject)=>{
   yauzl.open(resource.getLibraryByPath(lib.download.path),{lazyEntries:true},(err,zip)=>{
    if(err||!zip)return reject(err||new Error('Повреждена native-библиотека'));
    zip.on('error',reject);zip.on('end',resolve);zip.on('entry',entry=>{
     const name=entry.fileName;const parts=name.split('/');const excluded=lib.extractExclude?.some(x=>name.startsWith(x));const platform=!name.includes('/')||(parts[0]==='windows'&&['x64','amd64'].includes(parts[1]));
     if(excluded||!platform||name.startsWith('META-INF/')||name.endsWith('/')||!name.toLowerCase().endsWith('.dll')){zip.readEntry();return;}
     zip.openReadStream(entry,(error,stream)=>{if(error||!stream){zip.close();reject(error);return;}pipeline(stream,fs.createWriteStream(path.join(target,path.basename(name)))).then(()=>zip.readEntry()).catch(e=>{zip.close();reject(e);});});
    });zip.readEntry();
   });
  });
 }
};
