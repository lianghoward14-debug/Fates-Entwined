# Card sound redesign previews

Preview mixes only; no gameplay sound files or routing changed.
Each mix is 2.35 seconds, stereo 32 kHz PCM, peak limited by normalization to 0.78.
Technical checks verify valid PCM, duration, non-silence and headroom. They do not constitute an auditory audition.

Recorded components from Mixkit, retrieved 2026-10-17:
- 1444, Antique movie projector spinning: https://mixkit.co/free-sound-effects/movie-projector/
- 2376, Short pencil writing: https://mixkit.co/free-sound-effects/school/
- 1993, Clinking coins: https://mixkit.co/free-sound-effects/coin/
- 2454, River water flowing: https://mixkit.co/free-sound-effects/rivers/
- 1311, Water splash: https://mixkit.co/free-sound-effects/splash/

License: https://mixkit.co/license/#sfxFree
Actual license text retrieved from https://mixkit.co/license/modal/sfxFree/ and saved alongside this file. Allows modification and incorporation into video games. Do not redistribute raw source recordings as stock or with source files. The source-*.wav files here are local working inputs, not distributable game assets.

Custom procedural components: damped wooden stamps, contact scrapes, heavy paper-elephant landing, case closure and latch. These are synthesized in build_samples.py, not sourced recordings.

Timing follows the current two-second animation artwork:
- Mark Kemper: projector and folding texture, elephant tile impact at 1.14 seconds.
- Mark Menz: pencil setup, three seal strikes at 1.04, 1.24 and 1.44 seconds.
- Hugh Roberts: three coin arrivals, then portfolio closure and latch.
- Duncan Heyward: flowing river with two spatial splashes and short echoes.

Carpathian cards and Jorge Alvarez are excluded. No existing game sounds were edited.
