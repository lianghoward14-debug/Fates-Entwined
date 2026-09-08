const BASE=Object.freeze({pressure:1,preservation:1,resources:1,disruption:1,development:1,zones:1,risk:.3});
const PROFILES={
  balanced:{},cautious:{preservation:1.25,resources:1.15,risk:.6},reckless:{pressure:1.3,preservation:.85,risk:.08},
  distracted:{development:1.2,zones:.9,risk:.2},methodical:{development:1.25,resources:1.2,risk:.45},
  adaptive:{zones:1.2,disruption:1.1},disciplined:{resources:1.2,preservation:1.1,risk:.4},
  disruptive:{disruption:1.4},diplomatic:{preservation:1.15,disruption:1.2,risk:.4},
  resourceful:{resources:1.35,development:1.15},commanding:{zones:1.25,pressure:1.1},
  calculating:{resources:1.15,disruption:1.15,risk:.45},relentless:{pressure:1.3,resources:.9,risk:.15},
  efficient:{resources:1.25,development:1.15},elusive:{disruption:1.25,preservation:1.15,risk:.45},
  visionary:{development:1.35,resources:1.1},inevitable:{development:1.3,preservation:1.2,risk:.5},
  omniscient:{zones:1.2,disruption:1.2,risk:.45},overwhelming:{pressure:1.2,development:1.2,risk:.2},
  aggro:{pressure:1.3,development:.9,risk:.15},control:{disruption:1.35,preservation:1.1,risk:.45},
  defensive:{preservation:1.3,risk:.6},tempo:{pressure:1.2,zones:1.15,resources:.95},
  disruption:{disruption:1.4},blitz:{pressure:1.35,resources:.85,risk:.1},
  lockdown:{disruption:1.3,zones:1.25,risk:.4},zone_specialist:{zones:1.4},
  hoarder:{resources:1.45,development:.95,risk:.45},gambler:{development:1.1,risk:0},
  bully:{pressure:1.3,zones:.9,risk:.2},turtle:{preservation:1.35,resources:1.15,risk:.65},
  combo:{development:1.4,resources:1.15},swarm:{development:1.2,zones:1.2},
  sniper:{disruption:1.4,zones:1.1},collector:{development:1.3,resources:1.3},
  sacrificial:{pressure:1.2,resources:.8,development:1.15,risk:.15},
  opportunist:{zones:1.3,pressure:1.1},chaotic:{development:1.15,pressure:1.15,risk:.05}
};
export function personalityFor(style='balanced'){
  const key=String(style).toLowerCase();
  return {...BASE,...PROFILES[key],name:key};
}
export const personalityNames=Object.freeze(Object.keys(PROFILES));
