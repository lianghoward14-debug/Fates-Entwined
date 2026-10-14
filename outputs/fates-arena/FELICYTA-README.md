# Felicyta Janowicz University

Playable in campus.html and tidebound.html. Select her card, then Enter campus.

A ranged bruiser with her original bh11.png University card design, a matching eight-pose sprite sheet with an open book, black student uniform, white collar and red crest, custom ability icons, target previews, channel circle, marked-enemy countdown and three distinct ultimate gestures (point, raised objection, sweeping conclusion).

- Basic: 22 damage, 0.65-second interval, ranged projectile.
- Q — Concession and Rebuttal: select an enemy within 520. Gain armor equal to 50% of their current base armor; deal 10% of their maximum HP before mitigation, heal actual damage dealt. 10-second cooldown on successful selection. This copies armor without removing it from the target.
- Space — Debate the Land: channel for up to 8 seconds in a 320-radius circle. Enemies inside deal half damage. Deal 24 damage/second before mitigation and heal actual damage dealt. Immune to crowd control, but can take damage. Movement, dodge, right-click or death ends the channel. 16-second cooldown.
- E — Scalding Rhetoric: select an enemy within 520 for a 6-second mark. All incoming damage is multiplied by 1.25; Felicyta heals the bonus HP damage the mark contributes, including ally hits. 12-second cooldown.
- R — Epic Conclusion: click three independently aimed 360-range, 72-degree cones within 10 seconds. Each deals 35 damage and steals 15% of current armor, reducing outgoing damage by 15% multiplicatively. Three hits leave 61.4% armor and outgoing damage. A short gesture must finish before the next click. Right-click cancels remaining strikes. 24-second cooldown starts on the first strike.

Unspecified balance values are initial tuning choices. Armor gains and ultimate reductions last until the affected fighter respawns. Targeted abilities and cones respect buildings and damage immunity. Team damage is excluded. Healing is capped at maximum health and damage-based healing excludes overkill.

Build: node outputs/fates-arena/build-campus.cjs
Combat checks: node outputs/fates-arena/felicyta-test.cjs
Browser checks: node outputs/fates-arena/felicyta-browser-test.cjs (requires Playwright and Chrome).
