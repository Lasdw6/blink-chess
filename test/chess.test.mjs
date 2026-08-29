import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);const chess=require('../game/public/chess.js');

test('opening moves and illegal self-check',()=>{let s=chess.parseFen(chess.START_FEN);assert.equal(chess.legalMoves(s).length,20);s=chess.move(s,{from:'e2',to:'e4'}).state;assert.equal(s.ep,'e3');assert.equal(chess.legalMoves(s).length,20);assert.throws(()=>chess.move(s,{from:'e2',to:'e3'}),/Illegal/);});
test('detects fool mate',()=>{let s=chess.parseFen(chess.START_FEN),r;for(const [from,to] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]){r=chess.move(s,{from,to});s=r.state;}assert.equal(r.status,'checkmate');assert.equal(r.move.san,'Qh4#');});
test('castling, en passant, promotion',()=>{let s=chess.parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');s=chess.move(s,{from:'e1',to:'g1'}).state;assert.equal(s.board[chess.index('f1')],'R');s=chess.parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');s=chess.move(s,{from:'e5',to:'d6'}).state;assert.equal(s.board[chess.index('d5')],null);s=chess.parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');s=chess.move(s,{from:'a7',to:'a8',promotion:'n'}).state;assert.equal(s.board[chess.index('a8')],'N');});
