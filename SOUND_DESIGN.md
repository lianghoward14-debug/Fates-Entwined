# Card Setting Sound Effects - Design Document

## Overview
Sound effects for card placement, selection, and consolidation actions in Fates Entwined card game.

---

## 1. BASIC CARD SET
**Purpose**: Standard supporter/generic card placement  
**Duration**: 50-80ms  
**Style**: Metallic, crisp

### Description
Short, bright metallic "chink" sound. Descending pitch sweep from high to mid-range. Quick attack with immediate decay. Think of a small bell or coin-drop sound.

**Suggested Parameters**:
- **Frequency**: Start 2200Hz, sweep down to 1200Hz
- **Envelope**: 5ms attack, 50ms decay
- **Timbre**: Sine wave with slight overtones
- **Effect**: Minimal reverb, dry

**Audio Generation Tools**:
- [Jsfxr](https://sfxr.me/) - Type: "select"
- [Bfxr](https://www.bfxr.net/) - Retro 8-bit style
- [Freesound](https://freesound.org/) - Search: "card place" or "tile set"

---

## 2. CHARACTER CARD SET
**Purpose**: Consolidating a character card (main action)  
**Duration**: 100-150ms  
**Style**: Authoritative, resonant

### Description
Deeper, more substantial tone than basic set. Pitch contour: starts mid-range, drops slightly, then rises back up (U-shape). Longer sustain to feel weighty. Analog synth or bell-like.

**Suggested Parameters**:
- **Frequency**: 600Hz base, dips to 500Hz, rises to 700Hz
- **Envelope**: 8ms attack, 120ms release
- **Timbre**: Sine + triangle wave blend
- **Effect**: Slight plate reverb (100-150ms), subtle chorus

**Audio Generation Tools**:
- [Jsfxr](https://sfxr.me/) - Type: "powerup"
- [Bfxr](https://www.bfxr.net/) - Tweak "jump" or "jump2"
- [Pico-8 SFXR](https://www.lexaloffle.com/pico-8.php) - For retro game sound

---

## 3. SUPPORTER CARD SET
**Purpose**: Tribute/supporter cards selected or placed  
**Duration**: 40-60ms  
**Style**: Light, delicate, quick

### Description
High-pitched, tinny "ping" sound. Very fast attack, quick decay. Minimalist. Like tapping glass or a small triangle percussion instrument.

**Suggested Parameters**:
- **Frequency**: 2800Hz base, slight vibrato
- **Envelope**: 2ms attack, 40ms decay, 0ms sustain
- **Timbre**: Pure sine wave
- **Effect**: None (completely dry)

**Audio Generation Tools**:
- [Jsfxr](https://sfxr.me/) - Type: "hit"
- [Bfxr](https://www.bfxr.net/) - Tweak "select" or "hit"
- [Online Tone Generator](https://www.szynalski.com/tone-generator/) - Manual sine wave

---

## 4. PREMIUM/RARE CARD SET
**Purpose**: Star/Square/Triangle rarity cards (special placement)  
**Duration**: 120-180ms  
**Style**: Magical, harmonic, shimmer

### Description
Chord-based sound with harmonic resonance. Ascending then slightly descending contour. Shimmery/ethereal quality suggesting rarity. Multiple tones layered.

**Suggested Parameters**:
- **Chord**: Minor triad (e.g., C-Eb-G) or pentatonic
- **Base Frequency**: 800Hz
- **Envelope**: 10ms attack, 150ms release
- **Timbre**: Square wave or FM synthesis for shimmer
- **Effect**: Reverb (200-250ms), optional light delay

**Audio Generation Tools**:
- [Jsfxr](https://sfxr.me/) - Type: "powerup" or "hurt"
- [Bfxr](https://www.bfxr.net/) - Tweak "powerup2" or "powerup3"
- [Sunvox](https://www.warmplace.ru/soft/sunvox/) - Free chiptune synth
- [Freesound](https://freesound.org/) - Search: "magical bell" or "chime"

---

## 5. CONSOLIDATION COMPLETE
**Purpose**: Tribute requirements met, ready to place character  
**Duration**: 200-300ms  
**Style**: Triumphant, ascending, satisfying

### Description
Ascending arpeggio or chord progression. Builds confidence and momentum. Not too loud or jarring—subtle celebration. Harp-like or bell-like tones layered.

**Suggested Parameters**:
- **Frequencies**: Ascending pattern (e.g., 600Hz → 750Hz → 900Hz → 1000Hz)
- **Envelope**: 15ms attack, 250ms release
- **Timbre**: Bell/synth blend, warm
- **Effect**: Reverb (200ms), slight shimmer from delay

**Audio Generation Tools**:
- [Jsfxr](https://sfxr.me/) - Type: "rise" or "pickup"
- [Bfxr](https://www.bfxr.net/) - Tweak "pickup" or "pickup2"
- [Freesound](https://freesound.org/) - Search: "arpeggio" or "ascending chime"

---

## 6. CONSOLIDATION SELECTION (Tribute Selected)
**Purpose**: Player clicks a tribute card during consolidation  
**Duration**: 60-100ms  
**Style**: Affirming, positive confirmation

### Description
Mid-range tone, ascending pitch movement. Bright but not harsh. Confirms selection without being intrusive. Like a "yes" or "ready" sound.

**Suggested Parameters**:
- **Frequency**: 800Hz → 1100Hz (ascending)
- **Envelope**: 5ms attack, 80ms decay
- **Timbre**: Sine + slight square wave
- **Effect**: Minimal reverb (50ms)

**Audio Generation Tools**:
- [Jsfxr](https://sfxr.me/) - Type: "confirm" or "select"
- [Bfxr](https://www.bfxr.net/) - Tweak "pickup"

---

## 7. CONSOLIDATION DESELECTION (Tribute Deselected)
**Purpose**: Player deselects a tribute card  
**Duration**: 60-100ms  
**Style**: Neutral, non-committal

### Description
Descending pitch movement, slightly lower than selection sound. Confirms cancellation without negative connotation. Mirror/inverse of selection sound.

**Suggested Parameters**:
- **Frequency**: 1100Hz → 800Hz (descending)
- **Envelope**: 5ms attack, 80ms decay
- **Timbre**: Sine wave
- **Effect**: Minimal reverb (50ms)

**Audio Generation Tools**:
- [Jsfxr](https://sfxr.me/) - Type: "hit" or "select"
- [Bfxr](https://www.bfxr.net/) - Tweak "hit2"

---

## 8. CONSOLIDATION ERROR / INVALID PLACEMENT
**Purpose**: Player tries to place card in invalid location  
**Duration**: 80-120ms  
**Style**: Negative, blocked, "no"

### Description
Harsh, descending buzz or "error" tone. Harsh attack, quick decay. Unmistakably communicates "that's not allowed." Slight dissonance optional.

**Suggested Parameters**:
- **Frequency**: 1500Hz descending to 800Hz
- **Envelope**: 3ms attack, 100ms decay with dip
- **Timbre**: Square wave or sawtooth (slightly harsh)
- **Effect**: None (dry)

**Audio Generation Tools**:
- [Jsfxr](https://sfxr.me/) - Type: "hurt" or "explosion"
- [Bfxr](https://www.bfxr.net/) - Tweak "hurt" or "hurt2"

---

## 9. CARD DRAG START (Optional - when picking up card)
**Purpose**: Player starts dragging a card from hand  
**Duration**: 40-60ms  
**Style**: Light, anticipatory

### Description
Quick ascending tone, very light. Signals "I'm picking this up." Short and snappy.

**Suggested Parameters**:
- **Frequency**: 1200Hz → 1600Hz
- **Envelope**: 3ms attack, 50ms decay
- **Timbre**: Sine wave
- **Effect**: None

---

## 10. CARD DRAG DROP (Optional - when placing dragged card)
**Purpose**: Player releases dragged card onto board  
**Duration**: 70-100ms  
**Style**: Placement confirmation

### Description
Similar to basic card set but slightly heavier. Confirms successful drop.

**Suggested Parameters**:
- **Frequency**: 1800Hz → 1200Hz
- **Envelope**: 5ms attack, 80ms decay
- **Timbre**: Sine + slight overtone
- **Effect**: Minimal reverb (60ms)

---

## Implementation Notes

### File Format
- **Recommended**: MP3 or OGG (smaller file size)
- **Fallback**: WAV (uncompressed, larger but universal)
- **Target Bitrate**: 128kbps MP3 or equivalent

### File Naming Convention
```
card-set-basic.mp3
card-set-character.mp3
card-set-supporter.mp3
card-set-premium.mp3
consolidation-complete.mp3
consolidation-select.mp3
consolidation-deselect.mp3
consolidation-error.mp3
card-drag-start.mp3 (optional)
card-drag-drop.mp3 (optional)
```

### Directory Structure
```
src/
  audio/
    sfx/
      card-set-basic.mp3
      card-set-character.mp3
      card-set-supporter.mp3
      card-set-premium.mp3
      consolidation-complete.mp3
      consolidation-select.mp3
      consolidation-deselect.mp3
      consolidation-error.mp3
```

### Integration Points (in code)
- `playCardSound(cardId)` - already exists, calls rarity-based sound
- `playSfx('cardSet')` - basic placement
- `playSfx('consolidationComplete')` - tribute requirements met
- `playSfx('consolidationSelect')` - tribute selected
- `playSfx('consolidationError')` - invalid placement
- etc.

---

## Generation Workflow

### Quick Start (Jsfxr)
1. Go to https://sfxr.me/
2. Use "Type" dropdown to select starting point (select, powerup, etc.)
3. Tweak sliders to match description above
4. Click "Download" and save as .mp3

### For Better Quality
1. Use Bfxr or Pico-8 SFXR for more control
2. Export as WAV
3. Use Audacity to add reverb/effects if needed
4. Export as MP3

### Freesound Alternative
- Search Freesound for existing sounds matching descriptions
- License must allow game use (CC0 or CC-BY recommended)
- Download and integrate directly

---

## Next Steps
1. Generate sounds using preferred tool
2. Test in-game with `playSfx()` integration
3. Adjust volume/EQ as needed
4. Get user feedback on timing/feel
5. Iterate until satisfied
