# Campus combat animation polish

Applies to both campus.html and tidebound.html. Rebuild with node outputs/fates-arena/build-campus.cjs.

The original card artwork and all six sprite sheets remain in use. CombatPolish is a presentation-only layer: it observes state without changing damage, ranges, cooldowns, targeting, collision or movement. Animation time continues through combat hitstop and freezes on pause. New effects are capped at 160, and projectile tracking uses weak references.

Character treatment:
- Anicka: flowing wake arcs, wave release, starlit markers, phase trails and cast recovery.
- Howard: bow tension, throwing recoil, tapered weapon trails, knife/football readiness orbit and volley accents.
- Jake: grounded motion, charge chevrons and dust, landing shockwave, growing landing indicator and healing motes; existing jump and meal pose timing is preserved.
- Alondras: directional spear arcs, charge lean, dash trails, speed accents and target-centered ultimate slashes.
- Maja: gun recoil and muzzle flashes, tank tread motion, deployment rings and command pulses.
- Felicyta: animated pages, channel cadence, three conclusion arcs, distinct existing gesture sprites and corrected left-facing rendering.

Shared feedback: short impact sparks, healing rises, defeat particles, restrained damped camera shake, attack follow-through, smaller ordinary damage text, ability-name cue, cooldown-ready flash, smoothly updating health bars and stable roster DOM. Character-specific audio motifs accompany casts; simultaneous hit sounds are limited.

Reduced effects disables new movement dust, projectile trails, extra body motion and camera shake. System reduced-motion preference initializes the control; interface animations also honor it.

Validation: campus-test.cjs; felicyta-test.cjs; campus-browser-test.cjs; felicyta-browser-test.cjs; polish-browser-test.cjs (all 24 skills, screenshots, state immutability, pause and reduced effects); polish-performance.cjs (six-character stress scene and render timing).
