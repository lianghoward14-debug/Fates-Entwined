// The host supplies shuffled decks and derives actor from the authenticated seat.
// Commands and state contain only JSON data; no clock or randomness in transitions.
export function createMatch(decks) {
  if (decks.length !== 4 || decks.some(d => d.length !== 40)) throw Error('Expected four 40-card decks');
  return {turn:1, revision:0, phase:'draw', drawer:null, seats:decks.map(d => ({
    deck:d.slice(6), hand:d.slice(0,6), field:[], used:false, done:false
  }))};
}

export function applyCommand(state, actor, cmd, catalog) {
  const team = (state.turn-1)%2;
  const seat = state.seats[actor];
  if (!Number.isInteger(actor) || !seat || Math.floor(actor/2)!==team ||
      cmd.revision!==state.revision || state.phase==='finished') throw Error('Inactive or stale seat');
  if (state.phase==='draw') {
    const target = state.seats[cmd.target];
    if (cmd.type!=='draw' || !Number.isInteger(cmd.target) || !target ||
        Math.floor(cmd.target/2)!==team || !target.deck.length) throw Error('Invalid draw');
    target.hand.push(target.deck.pop());
    state.drawer=cmd.target;
    state.phase='play';
  } else if (seat.done) throw Error('Seat already finished');
  else if (cmd.type==='end') {
    seat.done=true;
    if (state.seats.slice(team*2,team*2+2).every(s=>s.done)) {
      if (state.turn===24) state.phase='finished';
      else { state.turn++; state.phase='draw'; }
      for (const player of state.seats) { player.used=false; player.done=false; }
    }
  } else {
    const card=catalog.get(cmd.card);
    const index=seat.hand.indexOf(cmd.card);
    if (cmd.type!=='place' || index<0 || !card) throw Error('Invalid placement');
    if (card.type==='Supporter') {
      if (seat.used) throw Error('Supporter already placed');
      seat.used=true;
    } else {
      const supporters=seat.field.filter(id=>catalog.get(id).type==='Supporter');
      if (!(card.cost>=0 && card.cost<=supporters.length)) throw Error('Insufficient reinforcement');
      for (const id of supporters.slice(0,card.cost)) seat.field.splice(seat.field.indexOf(id),1);
    }
    seat.field.push(seat.hand.splice(index,1)[0]);
  }
  state.revision++;
}

export function matchView(state, viewer=null) {
  return {...state,seats:state.seats.map((s,i)=>({
    field:[...s.field], used:s.used, done:s.done, deckCount:s.deck.length,
    handCount:s.hand.length, ...(viewer===i?{hand:[...s.hand]}:{})
  }))};
}
