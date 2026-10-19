import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
test('real Electron: offline account, instance, tabs, skin edit, settings and restart',async()=>{
 const data=await fs.mkdtemp(path.resolve('work','ui-profile-'));
 const app=await electron.launch({args:['.'],env:{...process.env,ALIM_USER_DATA:data},cwd:process.cwd()});
 const page=await app.firstWindow();const failures:string[]=[];page.on('pageerror',e=>failures.push(e.message));
 await expect(page.getByText('Большой мир.')).toBeVisible();
 await page.screenshot({path:'work/home.png'});
 await page.getByRole('button',{name:/Войти в игру/}).click();
 const nick=page.getByPlaceholder('Например, Alim');await nick.fill('AlimTest');await page.getByRole('button',{name:'Сохранить ник'}).click();await expect(page.getByRole('heading',{name:'AlimTest'})).toBeVisible();
 await page.getByRole('button',{name:'Мои сборки',exact:true}).click();await page.getByRole('button',{name:'Создать сборку',exact:true}).click();
 await page.getByRole('dialog').locator('input').first().fill('UI Test');
 await page.getByRole('dialog').getByRole('button',{name:'Создать сборку',exact:true}).click();await expect(page.getByRole('heading',{name:'UI Test'})).toBeVisible();
 for(const name of ['Моды','Текстуры и шейдеры','Папки игры','Настройки']){await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('.page-title h1')).toBeVisible();}
 await page.getByRole('button',{name:'Редактор скина',exact:true}).click();await expect(page.getByLabel('Пиксельный редактор скина')).toBeVisible();await page.waitForTimeout(1200);const atlas=page.getByLabel('Пиксельный редактор скина');const prior=await atlas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());await atlas.click({position:{x:45,y:45}});await page.getByRole('button',{name:'Сохранить',exact:true}).click();const after=await atlas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());expect(after).not.toEqual(prior);await page.getByRole('button',{name:'Отменить',exact:true}).click();expect(await atlas.evaluate((c:HTMLCanvasElement)=>c.toDataURL())).toEqual(prior);await page.screenshot({path:'work/skin.png'});
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Сохранить настройки'}).click();await page.screenshot({path:'work/settings.png'});expect(failures).toEqual([]);await app.close();
 const restarted=await electron.launch({args:['.'],env:{...process.env,ALIM_USER_DATA:data},cwd:process.cwd()});const second=await restarted.firstWindow();await expect(second.getByRole('button',{name:/AlimTest/})).toBeVisible();await expect(second.getByRole('heading',{name:'UI Test'})).toBeVisible();await restarted.close();
});
