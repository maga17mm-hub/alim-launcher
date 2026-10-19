export type Loader = 'Vanilla' | 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt' | 'OptiFine' | 'Forge + OptiFine';
export type Category = 'mods' | 'resourcepacks' | 'shaderpacks';
export interface Profile { id: string; name: string; minecraft: string; loader: Loader; loaderVersion: string; installedVersion?: string; installedAt?: string; lastPlayed?: string; optifine?: string }
export interface Settings { root: string; javaPath: string; ram: number; width: number; height: number; fullscreen: boolean; snapshots: boolean; legacy: boolean; downloadLimit: number; theme: 'dark' | 'light'; language: 'ru' | 'en'; afterLaunch: 'keep' | 'hide'; }
export interface State { settings: Settings; profiles: Profile[]; selected: string; account?: { name: string; uuid: string }; history: { date: string; text: string }[] }
export interface Progress { busy: boolean; phase: string; progress: number; total: number; running?: boolean; error?: string }
export interface VersionInfo { id: string; type: string; releaseTime: string; url: string; sha1?: string }
export interface UpdateState { status: string; version?: string; percent?: number; notes?: string }
export interface Snapshot { state: State; version: string; memory: number; progress: Progress; update: UpdateState; logs: string[] }
export interface Api { call<T = any>(method: string, payload?: unknown): Promise<T>; on(channel: 'progress' | 'log' | 'update', cb: (data: any) => void): () => void }
