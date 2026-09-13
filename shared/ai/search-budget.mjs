// Difficulty changes available thought, never legal execution or deck rules.
export function searchBudget(state,commands,context={}){
  const cap=Math.max(24,Math.min(4000,Number(context.maxNodeBudget)||4000));
  const base=Math.max(24,Math.min(cap,Number(context.nodeBudget)||({easy:240,extreme:960}[context.difficulty]||600)));
  const families=new Set(commands.map(c=>c.type+':'+(c.payload?.cardIid||c.payload?.sourceIid||'')));
  const tactical=commands.some(c=>['ACTIVATE_EFFECT','CONSOLIDATE_CARD'].includes(c.type));
  const urgent=(state.moralePressure?.morale||[]).some(n=>n<=60) || state.maxTurns-state.turn<=4;
  const complex=families.size>=6 || !!state.pendingPrompt;
  const factor=urgent?1.5:complex && tactical?1.25:families.size<=2?.65:1;
  return {nodeBudget:Math.min(cap,Math.max(24,Math.floor(base*factor))),
    maxSteps:urgent || complex?32:24,reason:urgent?'critical':complex?'branching':'routine'};
}
