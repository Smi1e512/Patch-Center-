import axios from 'axios';
export type Mode = 'git'|'fallback'|'ai';
export type Task = {id:string;filename:string;message:string;status:string;mode:Mode|null;created:number;updated:number;summary:string;base_commit:string;log?:string;diff?:string;changes?:string;worktree?:string};
export type Config = {repo:string;base:string;aiEnabled:boolean;maxMb:number};
const client=axios.create({baseURL:'/api',timeout:30000});
export const api={config:()=>client.get<Config>('/config').then(r=>r.data), list:()=>client.get<Task[]>('/tasks').then(r=>r.data), detail:(id:string)=>client.get<Task>(`/tasks/${id}`).then(r=>r.data), upload:(file:File,message:string)=>{const data=new FormData();data.append('patch',file);data.append('message',message);return client.post<Task>('/tasks',data).then(r=>r.data)}, run:(id:string,mode:Mode)=>client.post<Task>(`/tasks/${id}/run`,{mode}).then(r=>r.data)};
export function errorText(e:unknown){return axios.isAxiosError(e)?String(e.response?.data?.detail??e.message):String(e)}
