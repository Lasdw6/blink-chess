import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const FALLBACK='/Users/vividh/Desktop/abra/target/debug/abra';
const spawnedDaemons=new Map();
async function executable(file){try{await access(file,constants.X_OK);return true;}catch{return false;}}
export async function abraBin(){if(process.env.ABRA_BIN)return process.env.ABRA_BIN;for(const dir of (process.env.PATH||'').split(':')){const file=`${dir}/abra`;if(await executable(file))return file;}return FALLBACK;}
function collect(child){return new Promise((resolve,reject)=>{let out='',err='';child.stdout?.on('data',c=>out+=c);child.stderr?.on('data',c=>err+=c);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error((err||out||`abra exited ${code}`).trim())));});}
export async function run(root,args,{json=true}={}){const bin=await abraBin(),argv=['--root',root,...(json?['--json']:[]),...args];const raw=await collect(spawn(bin,argv,{stdio:['ignore','pipe','pipe']}));if(!json)return raw;if(!raw)return null;try{return JSON.parse(raw);}catch{const lines=raw.split('\n').filter(Boolean);return JSON.parse(lines.at(-1));}}
export async function status(root){return run(root,['status']);}
export async function daemon(root,{transport=process.env.ABRA_TRANSPORT||'iroh'}={}){try{const s=await status(root);if(s?.running)return s;}catch{}const bin=await abraBin(),child=spawn(bin,['--root',root,'daemon','--yes','--transport',transport],{detached:true,stdio:'ignore'});spawnedDaemons.set(root,child);child.unref();for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,100));try{const s=await status(root);if(s?.running)return s;}catch{}}throw new Error(`Abra daemon did not start at ${root}`);}
export function shutdownDaemon(root){const child=spawnedDaemons.get(root);if(child&&!child.killed)child.kill('SIGTERM');spawnedDaemons.delete(root);}
export async function pairTicket(root){const result=await run(root,['pair','ticket']);return result.ticket||result;}
export async function pairAdd(root,ticket){return run(root,['pair','add',ticket]);}
export async function peers(root){return run(root,['peers']);}
export async function initCapsule(root,path){return run(root,['init',path]);}
export async function snapshot(root,path,label){return run(root,['snapshot',path,'-m',label]);}
export async function send(root,peerId,capsuleId){return run(root,['send',peerId,'--capsule',capsuleId]);}
export async function outbox(root){return run(root,['outbox']);}
export async function inbox(root){return run(root,['inbox']);}
export async function accept(root,snapshotId,to){return run(root,['accept',snapshotId,'--to',to]);}
export async function log(root,capsuleId){return run(root,['log','--capsule',capsuleId]);}
export async function logAny(root){return run(root,['log']);}
export async function leaseStatus(root,capsuleId){return run(root,['lease','status',capsuleId]);}
export async function leaseTake(root,capsuleId){return run(root,['lease','take',capsuleId]);}
export async function* watch(root,{signal}={}){const bin=await abraBin(),child=spawn(bin,['--root',root,'--json','watch'],{stdio:['ignore','pipe','pipe'],signal});let buffer='',stderr='';child.stderr.on('data',c=>stderr+=c);
  // Aborting the signal kills the child, which emits ABORT_ERR on the child's
  // 'error' event; without a handler that crashes the process. Swallow aborts.
  child.on('error',e=>{if(e?.code!=='ABORT_ERR')throw e;});
  try{for await(const chunk of child.stdout){buffer+=chunk;let nl;while((nl=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,nl).trim();buffer=buffer.slice(nl+1);if(line)yield JSON.parse(line);}}if(buffer.trim())yield JSON.parse(buffer);}catch(e){if(e?.code!=='ABORT_ERR')throw e;}finally{if(!child.killed)child.kill();}if(stderr&&!signal?.aborted)throw new Error(stderr.trim());}
export async function waitForAck(root,sendResult,{timeoutMs=30000}={}){const deadline=Date.now()+timeoutMs,id=sendResult?.id||sendResult?.outbox_id||sendResult?.snapshot_id;while(Date.now()<deadline){const box=await outbox(root),entries=Array.isArray(box)?box:(box?.entries||box?.outbox||[]);const item=id?entries.find(x=>x.id===id||x.snapshot_id===id):entries.at(-1);if(item?.state==='acked')return item;if(item?.state==='failed')throw new Error(item.error||'Abra send failed');await new Promise(r=>setTimeout(r,150));}throw new Error('Timed out waiting for Abra durable acknowledgement');}
