export function warfrontSpectatorPerspective(state, teammateIndex, requestedPerspective){
  const teammate=teammateIndex===0 || teammateIndex===1;
  const perspective=teammate ? teammateIndex : Number(requestedPerspective)===1 ? 1 : 0;
  // Server-created AI has no private human hand to protect. Team membership
  // remains authoritative whenever it supplies a locked perspective.
  const ai=state?.warfrontMatch===true && state.warfrontAiSeats?.includes(perspective);
  return {perspective,handSeat:teammate || ai ? perspective : null};
}
