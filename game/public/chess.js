(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BlinkChess = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const other = c => c === 'w' ? 'b' : 'w';
  const color = p => p && (p === p.toUpperCase() ? 'w' : 'b');
  const type = p => p && p.toLowerCase();
  const index = s => (8 - Number(s[1])) * 8 + FILES.indexOf(s[0]);
  const square = i => FILES[i % 8] + (8 - Math.floor(i / 8));

  function parseFen(fen) {
    const [placement, turn, castling, ep, halfmove, fullmove] = fen.split(/\s+/);
    const board = [];
    for (const row of placement.split('/')) for (const ch of row) {
      if (/\d/.test(ch)) board.push(...Array(Number(ch)).fill(null)); else board.push(ch);
    }
    if (board.length !== 64) throw new Error('Invalid FEN');
    return { board, turn, castling: castling === '-' ? '' : castling, ep: ep === '-' ? null : ep, halfmove: +halfmove, fullmove: +fullmove };
  }
  function fen(s) {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) { const p = s.board[r * 8 + f]; if (p) { if (empty) row += empty; empty = 0; row += p; } else empty++; }
      rows.push(row + (empty || ''));
    }
    return `${rows.join('/')} ${s.turn} ${s.castling || '-'} ${s.ep || '-'} ${s.halfmove} ${s.fullmove}`;
  }
  const inside = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
  function attacked(s, target, by) {
    const tr = Math.floor(target / 8), tf = target % 8;
    const pawnRow = tr + (by === 'w' ? 1 : -1);
    for (const df of [-1, 1]) if (inside(pawnRow, tf + df)) { const p = s.board[pawnRow * 8 + tf + df]; if (p && color(p) === by && type(p) === 'p') return true; }
    for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      if (inside(tr + dr, tf + df)) { const p = s.board[(tr + dr) * 8 + tf + df]; if (p && color(p) === by && type(p) === 'n') return true; }
    }
    for (const [dr, df] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let r = tr + dr, f = tf + df, distance = 1;
      while (inside(r, f)) { const p = s.board[r * 8 + f]; if (p) { if (color(p) === by) { const t = type(p); if (t === 'q' || (distance === 1 && t === 'k') || ((dr === 0 || df === 0) ? t === 'r' : t === 'b')) return true; } break; } r += dr; f += df; distance++;
      }
    }
    return false;
  }
  function inCheck(s, side = s.turn) { const k = s.board.findIndex(p => p && color(p) === side && type(p) === 'k'); return k < 0 || attacked(s, k, other(side)); }
  function pseudo(s) {
    const out = [];
    const add = (from, to, extra = {}) => out.push({ from: square(from), to: square(to), ...extra });
    for (let from = 0; from < 64; from++) {
      const p = s.board[from]; if (!p || color(p) !== s.turn) continue;
      const r = Math.floor(from / 8), f = from % 8, t = type(p);
      if (t === 'p') {
        const d = s.turn === 'w' ? -1 : 1, start = s.turn === 'w' ? 6 : 1, promo = s.turn === 'w' ? 0 : 7;
        const one = (r + d) * 8 + f;
        if (inside(r + d, f) && !s.board[one]) {
          if (r + d === promo) for (const q of ['q','r','b','n']) add(from, one, { promotion: q }); else add(from, one);
          const two = (r + 2*d)*8+f; if (r === start && !s.board[two]) add(from, two, { doublePawn: true });
        }
        for (const df of [-1,1]) if (inside(r+d,f+df)) { const to=(r+d)*8+f+df, target=s.board[to], ep=s.ep && index(s.ep)===to; if ((target && color(target)!==s.turn)||ep) { if (r+d===promo) for(const q of ['q','r','b','n']) add(from,to,{promotion:q,capture:true,enPassant:ep}); else add(from,to,{capture:true,enPassant:ep}); } }
      } else if (t === 'n') {
        for(const [dr,df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if(inside(r+dr,f+df)){const to=(r+dr)*8+f+df,q=s.board[to];if(!q||color(q)!==s.turn)add(from,to,{capture:!!q});}
      } else if (t === 'b' || t === 'r' || t === 'q') {
        const dirs = t==='b'?[[-1,-1],[-1,1],[1,-1],[1,1]]:t==='r'?[[-1,0],[1,0],[0,-1],[0,1]]:[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        for(const [dr,df] of dirs){let nr=r+dr,nf=f+df;while(inside(nr,nf)){const to=nr*8+nf,q=s.board[to];if(!q)add(from,to);else{if(color(q)!==s.turn)add(from,to,{capture:true});break;}nr+=dr;nf+=df;}}
      } else if (t === 'k') {
        for(const [dr,df] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) if(inside(r+dr,f+df)){const to=(r+dr)*8+f+df,q=s.board[to];if(!q||color(q)!==s.turn)add(from,to,{capture:!!q});}
        const rights=s.turn==='w'?['K','Q']:['k','q'], home=s.turn==='w'?60:4;
        if(from===home&&!inCheck(s,s.turn)){
          if(s.castling.includes(rights[0])&&!s.board[home+1]&&!s.board[home+2]&&type(s.board[home+3])==='r'&&!attacked(s,home+1,other(s.turn))&&!attacked(s,home+2,other(s.turn)))add(from,home+2,{castle:'K'});
          if(s.castling.includes(rights[1])&&!s.board[home-1]&&!s.board[home-2]&&!s.board[home-3]&&type(s.board[home-4])==='r'&&!attacked(s,home-1,other(s.turn))&&!attacked(s,home-2,other(s.turn)))add(from,home-2,{castle:'Q'});
        }
      }
    } return out;
  }
  function applyUnchecked(s, m) {
    const n={...s,board:s.board.slice()}, from=index(m.from),to=index(m.to),p=n.board[from],side=color(p),t=type(p),captured=n.board[to];
    n.board[from]=null;n.board[to]=m.promotion?(side==='w'?m.promotion.toUpperCase():m.promotion.toLowerCase()):p;
    if(m.enPassant)n.board[to+(side==='w'?8:-8)]=null;
    if(m.castle){const rf=m.castle==='K'?from+3:from-4,rt=m.castle==='K'?from+1:from-1;n.board[rt]=n.board[rf];n.board[rf]=null;}
    const remove=x=>{n.castling=n.castling.replace(x,'');};
    if(t==='k'){if(side==='w'){remove('K');remove('Q');}else{remove('k');remove('q');}}
    if(from===63||to===63)remove('K');if(from===56||to===56)remove('Q');if(from===7||to===7)remove('k');if(from===0||to===0)remove('q');
    n.ep=m.doublePawn?square((from+to)/2):null;n.halfmove=(t==='p'||captured||m.enPassant)?0:s.halfmove+1;n.fullmove=s.fullmove+(side==='b'?1:0);n.turn=other(side);return n;
  }
  function legalMoves(s) { return pseudo(s).filter(m => !inCheck(applyUnchecked(s,m),s.turn)); }
  function san(s,m,next){const p=s.board[index(m.from)],t=type(p);let v=m.castle?(m.castle==='K'?'O-O':'O-O-O'):(t==='p'?(m.capture?m.from[0]+'x':'')+m.to+(m.promotion?'='+m.promotion.toUpperCase():''):(t.toUpperCase()+((legalMoves(s).filter(x=>x.to===m.to&&x.from!==m.from&&type(s.board[index(x.from)])===t).length)?m.from:'')+(m.capture?'x':'')+m.to));if(inCheck(next,next.turn))v+=legalMoves(next).length?'+':'#';return v;}
  function move(s, spec) {
    const promotion=(spec.promotion||'q').toLowerCase();
    const choices=legalMoves(s).filter(m=>m.from===spec.from&&m.to===spec.to&&(!m.promotion||m.promotion===promotion));
    if(!choices.length)throw new Error(`Illegal move: ${spec.from}${spec.to}`);
    const chosen=choices[0],next=applyUnchecked(s,chosen),notation=san(s,chosen,next),remaining=legalMoves(next);
    return {state:next,move:{...chosen,san:notation},status:remaining.length?'in-progress':(inCheck(next,next.turn)?'checkmate':'stalemate')};
  }
  return { START_FEN, parseFen, fen, legalMoves, move, inCheck, square, index };
});
