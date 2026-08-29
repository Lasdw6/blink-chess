import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as abra from './abra.mjs';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function exists(path){try{await stat(path);return true;}catch{return false;}}
export async function readGame(work){return JSON.parse(await readFile(join(work,'game.json'),'utf8'));}
export function startRecipe(work,{port=5173,peerId,signalFile,quiet=false}={}){
  const child=spawn('npm',['run','dev'],{cwd:work,env:{...process.env,PORT:String(port),BLINK_PEER_ID:peerId||'',BLINK_MOVE_SIGNAL:signalFile||''},stdio:quiet?'ignore':'inherit',detached:false});return child;
}
export async function stopRecipe(child){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(1500)]);if(child.exitCode===null)child.kill('SIGKILL');}
export async function recipeFrom(work){const file=join(work,'.abra','recipes.json');try{const recipes=JSON.parse(await readFile(file,'utf8'));const recipe=recipes.find(x=>x.argv?.length);if(recipe)return recipe;}catch{}return {argv:['npm','run','dev'],cwd:'.',env:{},ports:[5173]};}
export async function runObservedRecipe(work,options={}){const recipe=await recipeFrom(work),[cmd,...args]=recipe.argv,port=options.port||recipe.ports?.[0]||5173;return spawn(cmd,args,{cwd:join(work,recipe.cwd||'.'),env:{...process.env,...recipe.env,PORT:String(port),BLINK_PEER_ID:options.peerId||'',BLINK_MOVE_SIGNAL:options.signalFile||''},stdio:options.quiet?'ignore':'inherit'});}
export async function waitForCapsuleHead(root,capsuleId,{after,snapshotId,timeoutMs=30000}={}){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){try{const entries=await abra.log(root,capsuleId);if(snapshotId){const exact=entries.find(x=>x.snapshot_id===snapshotId);if(exact)return exact;}else{const head=entries.at(-1);if(head&&(!after||head.snapshot_id!==after))return head;}}catch{}await delay(100);}throw new Error('Timed out waiting for incoming capsule head');}
export async function acceptHead(root,head,destination){await rm(destination,{recursive:true,force:true});await mkdir(dirname(destination),{recursive:true});await abra.accept(root,head.snapshot_id,destination);return destination;}
export async function park(work,parkedRoot,label){await mkdir(parkedRoot,{recursive:true});const destination=join(parkedRoot,label.replace(/[^a-zA-Z0-9_.-]/g,'-'));await rm(destination,{recursive:true,force:true});await rename(work,destination);return destination;}
export async function teleport({root,work,peerId,capsuleId,label,parkedRoot,server,timeoutMs=30000}){let snap,sent,ack;try{await abra.leaseTake(root,capsuleId);snap=await abra.snapshot(root,work,label);}catch(e){throw new Error(`snapshot failed: ${e.message}`);}try{sent=await abra.send(root,peerId,capsuleId);}catch(e){throw new Error(`send failed: ${e.message}`);}try{ack=await abra.waitForAck(root,sent,{timeoutMs});}catch(e){throw new Error(`ack failed: ${e.message}`);}await stopRecipe(server);const parked=await park(work,parkedRoot,`move-${Date.now()}`);return {snapshot:snap,send:sent,ack,parked,capsuleId};}
export async function openBoard(port,peerId){if(process.env.BLINK_NO_OPEN==='1')return;const url=`http://127.0.0.1:${port}/?peer=${encodeURIComponent(peerId)}`;const cmd=process.platform==='darwin'?'open':process.platform==='win32'?'cmd':'xdg-open',args=process.platform==='win32'?['/c','start',url]:[url];spawn(cmd,args,{stdio:'ignore',detached:true}).unref();}
