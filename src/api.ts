import type { Api } from '../electron/types';
declare global { interface Window { alim: Api } }
export const api=window.alim;
export const formatBytes=(n:number)=>n>1024*1024?`${(n/1024/1024).toFixed(1)} МБ`:`${Math.round(n/1024)} КБ`;
