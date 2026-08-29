import test from 'node:test';import assert from 'node:assert/strict';import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join, resolve } from 'node:path';
import * as abra from '../abra.mjs';import { acceptHead, readGame, startRecipe, stopRecipe, teleport, waitForCapsuleHead } from '../teleport.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(port){for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/state`);if(r.ok)return;}catch{}await delay(100);}throw new Error(`server ${port} not ready`);}
async function setGame(work,fn){const file=join(work,'game.json'),g=JSON.parse(await readFile(file,'utf8'));fn(g);await writeFile(file,JSON.stringify(g,null,2)+'\n');}

test('four moves alternate through real Abra snapshot/send/ack/accept path',{timeout:60000},async t=>{
  process.env.ABRA_TRANSPORT='tcp';process.env.BLINK_NO_OPEN='1';
  const base=await mkdtemp(join(tmpdir(),'blink-e2e-')),rootA=join(base,'alice-abra'),rootB=join(base,'bob-abra'),activeA=join(base,'alice-active'),activeB=join(base,'bob-active');
  await cp(resolve('game'),activeA,{recursive:true});
  t.after(async()=>{abra.shutdownDaemon(rootA);abra.shutdownDaemon(rootB);await rm(base,{recursive:true,force:true});});
  const alice=await abra.daemon(rootA,{transport:'tcp'}),bob=await abra.daemon(rootB,{transport:'tcp'});await abra.pairAdd(rootB,await abra.pairTicket(rootA));
  const initialServer=startRecipe(activeA,{port:5211,peerId:alice.peer_id,quiet:true});await ready(5211);
  const init=await abra.initCapsule(rootA,activeA);await abra.leaseTake(rootA,init.capsule_id);await setGame(activeA,g=>{g.players={white:alice.peer_id,black:bob.peer_id};g.status='in-progress';g.capsuleId=init.capsule_id;g.clocks.w.startedAt=Date.now();});
  const initial=await abra.snapshot(rootA,activeA,'game ready'),offer=await abra.send(rootA,bob.peer_id,init.capsule_id);await abra.waitForAck(rootA,offer);const first=await waitForCapsuleHead(rootB,init.capsule_id,{timeoutMs:10000});await acceptHead(rootB,first,activeB);
  assert.deepEqual((await readGame(activeB)).players,{white:alice.peer_id,black:bob.peer_id});
  const capsuleId=init.capsule_id;let previousSnapshot=initial.snapshot_id,current={root:rootA,work:activeA,peer:bob.peer_id,port:5211,server:initialServer},receiver={root:rootB,work:activeB,peer:alice.peer_id,port:5212};
  const script=[['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6']];
  for(let ply=0;ply<script.length;ply++){
    console.log(`  ply ${ply+1}: ${script[ply].join('')} — authoring, sending, acknowledging, materializing`);
    if(!current.server){console.log('   recipe');current.server=startRecipe(current.work,{port:current.port,peerId:ply%2?bob.peer_id:alice.peer_id,quiet:true});await ready(current.port);}
    const [from,to]=script[ply],response=await fetch(`http://127.0.0.1:${current.port}/api/move`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({from,to})});assert.equal(response.status,200,await response.text());
    console.log('   move');const result=await teleport({root:current.root,work:current.work,peerId:current.peer,capsuleId,label:`move ${ply+1}: ${from}${to}`,parkedRoot:join(current.root,'parked'),server:current.server,timeoutMs:10000});assert.equal(result.capsuleId,init.capsule_id,'every hop must use the original capsule');console.log('   acked');assert.match(result.ack.state,/acked/);assert.equal(await readFile(join(result.parked,'game.json'),'utf8').then(Boolean),true);
    const authoredLog=await abra.log(current.root,capsuleId),authored=authoredLog.find(entry=>entry.snapshot_id===result.snapshot.snapshot_id);assert.ok(authored,'author log contains the new head');assert.deepEqual(authored.parents,[previousSnapshot],'author head extends the prior head');
    const head=await waitForCapsuleHead(receiver.root,capsuleId,{snapshotId:result.snapshot.snapshot_id,timeoutMs:10000});console.log('   head');assert.equal(head.snapshot_id,result.snapshot.snapshot_id);await acceptHead(receiver.root,head,receiver.work);console.log('   accepted');const receivedLog=await abra.log(receiver.root,capsuleId),received=receivedLog.find(entry=>entry.snapshot_id===result.snapshot.snapshot_id);assert.ok(received,'receiver log contains the new head');assert.deepEqual(received.parents,[previousSnapshot],'receiver head extends the prior head');const landed=await readGame(receiver.work);assert.equal(landed.capsuleId,init.capsule_id);assert.equal(landed.moves.length,ply+1);assert.equal(landed.moves.at(-1),['e4','e5','Nf3','Nc6'][ply]);previousSnapshot=result.snapshot.snapshot_id;
    const old=current;current={...receiver,server:null};receiver={...old,server:null};
  }
  const final=await readGame(current.work);assert.deepEqual(final.moves,['e4','e5','Nf3','Nc6']);assert.equal(final.turn,'w');
});
