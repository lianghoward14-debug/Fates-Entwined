export function boardEntries(state){
  const entries = [];
  const board = state?.board;
  if(!Array.isArray(board)) return entries;
  board.forEach((zone, z)=>{
    if(!Array.isArray(zone)) return;
    zone.forEach((row, r)=>{
      if(!Array.isArray(row)) return;
      row.forEach((card, c)=>{
        if(card) entries.push({card, zone:'board', z, r, c});
      });
    });
  });
  return entries;
}

export function allCardEntries(state){
  const entries = boardEntries(state);
  const players = Array.isArray(state?.players) ? state.players : [];
  players.forEach((player, playerIndex)=>{
    for(const zone of ['deck', 'hand', 'discard', 'limbo']){
      const cards = Array.isArray(player?.[zone]) ? player[zone] : [];
      cards.forEach((card, index)=>{
        if(card) entries.push({card, zone, playerIndex, index});
      });
    }
  });
  return entries;
}

export function findCard(state, iid){
  const wanted = String(iid || '');
  if(!wanted) return null;
  return allCardEntries(state).find(entry=>String(entry.card?.iid || '') === wanted) || null;
}

export function findBoardCard(state, iid){
  const wanted = String(iid || '');
  return boardEntries(state).find(entry=>String(entry.card?.iid || '') === wanted) || null;
}

export function boardCardAt(state, destination){
  const z = Number(destination?.z);
  const r = Number(destination?.r);
  const c = Number(destination?.c);
  return state?.board?.[z]?.[r]?.[c] || null;
}

export function isBoardCoordinate(state, destination){
  const z = Number(destination?.z);
  const r = Number(destination?.r);
  const c = Number(destination?.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)
    || !state?.board?.[z]?.[r] || c < 0 || c >= state.board[z][r].length) return false;
  if(r < 3) return true;
  return (state?.geometry?.playableExtraSquares || []).some(square=>
    square.z === z && square.r === r && square.c === c
  );
}

export function squareKey(destination){
  return [Number(destination?.z), Number(destination?.r), Number(destination?.c)].join(':');
}

export function rowOwner(state, z, r){
  if(Number(r) === 0) return 1;
  if(Number(r) === 1) return -1;
  if(Number(r) === 2) return 0;
  const value = state?.geometry?.rowOwners?.[Number(z)]?.[Number(r)];
  return value === 0 || value === 1 ? value : null;
}

export function squareStatuses(state, destination, type = ''){
  const key = squareKey(destination);
  return (state?.geometry?.squareStatuses || []).filter(status=>
    squareKey(status) === key && (!type || String(status.type || '') === String(type))
  );
}

export function isSquarePermanentlyBlocked(state, destination){
  return squareStatuses(state, destination, 'PERMANENTLY_BLOCKED').length > 0;
}

export function controllerOf(card){
  return Number.isInteger(Number(card?.controller)) ? Number(card.controller) : Number(card?.owner);
}

export function controlledBoardEntries(state, playerIndex){
  return boardEntries(state).filter(entry=>controllerOf(entry.card) === Number(playerIndex));
}

export function entriesInZone(state, z){
  return boardEntries(state).filter(entry=>entry.z === Number(z));
}

export function openBoardDestinations(state, predicate = ()=>true){
  const result = [];
  (state?.board || []).forEach((zone, z)=>{
    (zone || []).forEach((row, r)=>{
      (row || []).forEach((card, c)=>{
        const destination = {z, r, c};
        if(!card
          && isBoardCoordinate(state, destination)
          && !isSquarePermanentlyBlocked(state, destination)
          && predicate(destination)) result.push(destination);
      });
    });
  });
  return result;
}

export function playerIndexById(state, playerId){
  const wanted = String(playerId || '');
  const index = (state?.players || []).findIndex(player=>String(player?.id || '') === wanted);
  return index >= 0 ? index : null;
}

export function sourceZone(state, sourceIid){
  const entry = findBoardCard(state, sourceIid);
  return entry ? entry.z : null;
}
