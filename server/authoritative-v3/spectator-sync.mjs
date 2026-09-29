import {randomUUID, createHash} from 'node:crypto';

const generation = randomUUID();

// Called only after identity and hand visibility have been resolved. Including
// the visible seat prevents a cached private hand surviving a permission change.
export function spectatorSnapshotResponse(actor, {perspective, handSeat}, previousToken){
  const syncToken = createHash('sha256').update(JSON.stringify([
    generation, actor.state.matchId, actor.state.revision, perspective, handSeat
  ])).digest('base64url');
  if(previousToken === syncToken) return {ok:true, unchanged:true, syncToken};
  return {ok:true, playerIndex:perspective, ...actor.snapshotForSpectator(handSeat), syncToken};
}
