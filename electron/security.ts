import path from 'node:path';
import { createHash } from 'node:crypto';
export function offlineUuid(name: string) { const b = createHash('md5').update(`OfflinePlayer:${name}`).digest(); b[6] = (b[6] & 15) | 48; b[8] = (b[8] & 63) | 128; return b.toString('hex'); }
export function safeName(value: string) { if (!value || value !== path.basename(value) || /[<>:"/\\|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw new Error('Недопустимое имя файла'); return value; }
export function inside(root: string, ...segments: string[]) { const target = path.resolve(root, ...segments); const rel = path.relative(path.resolve(root), target); if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Доступ за пределы папки профиля запрещён'); return target; }
export function httpsUrl(url: string) { const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Разрешены только HTTPS-загрузки'); return u.href; }
