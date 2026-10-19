import fs from 'node:fs';
import { PNG } from 'pngjs';
import pngToIco from 'png-to-ico';
fs.mkdirSync('public/assets',{recursive:true});fs.mkdirSync('build',{recursive:true});
fs.copyFileSync('изображения/фонлаунчера.png','public/assets/landscape.png');
fs.copyFileSync('изображения/фонредактораскина.png','public/assets/skin-background.png');
const sheet=PNG.sync.read(fs.readFileSync('изображения/иконки.png'));
const crops={logo:[34,20,390,414],home:[36,435,180,180],profiles:[222,440,160,170],mods:[401,441,158,175],packs:[568,442,165,171],skin:[731,441,170,178],settings:[909,441,165,172],folder:[1240,444,172,169]};
function crop([x,y,w,h]){const out=new PNG({width:w,height:h});PNG.bitblt(sheet,out,x,y,w,h,0,0);return out;}
for(const [name,rect] of Object.entries(crops))fs.writeFileSync(`public/assets/${name}.png`,PNG.sync.write(crop(rect)));
const logo=crop(crops.logo);const icon=new PNG({width:256,height:256});for(let y=0;y<256;y++)for(let x=0;x<256;x++){const sx=Math.floor(x/256*logo.width),sy=Math.floor(y/256*logo.height);logo.data.copy(icon.data,(y*256+x)*4,(sy*logo.width+sx)*4,(sy*logo.width+sx)*4+4);}
fs.writeFileSync('build/icon.png',PNG.sync.write(icon));fs.writeFileSync('build/icon.ico',await pngToIco('build/icon.png'));
// Original editable skin template. No Minecraft client assets are bundled.
const skin=new PNG({width:64,height:64});function fill(x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const n=(yy*64+xx)*4;skin.data[n]=c[0];skin.data[n+1]=c[1];skin.data[n+2]=c[2];skin.data[n+3]=255;}}
fill(0,0,32,16,[184,132,96]);fill(0,0,32,8,[49,35,28]);fill(8,8,8,3,[49,35,28]);fill(9,11,2,1,[230,239,220]);fill(13,11,2,1,[230,239,220]);fill(10,11,1,1,[25,97,70]);fill(13,11,1,1,[25,97,70]);fill(11,14,2,1,[110,65,43]);fill(16,16,24,16,[12,157,133]);fill(0,16,16,16,[40,52,67]);fill(40,16,16,16,[184,132,96]);fill(40,16,16,8,[12,157,133]);fill(16,48,16,16,[40,52,67]);fill(32,48,16,16,[184,132,96]);fill(32,48,16,8,[12,157,133]);fs.writeFileSync('public/assets/default-skin.png',PNG.sync.write(skin));
