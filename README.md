# Distant Stars

[English](README.md) | [简体中文](README.zh-CN.md)

A game about managing a nation across star systems. The current version is the **0.5.0 surface planning prototype**. Its design follows the [overall game design baseline](docs/design/distant_stars_game_design_baseline.md) and [technical direction](docs/architecture/technology_direction.md).

## Running and Verification

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

Use the local address printed in the terminal. The browser must support WebGL, module Workers, and localStorage.

Theme music is enabled by default. If the browser restricts autoplay, playback begins after the first click or keyboard interaction. The top bar shows the current track and lets you select a track, skip to the next one, or turn music off. Nine original tracks loop in sequence, using finished stereo MP3 audio bundled with the game. No music production software, separate sound library downloads, or external services are required. You can still change tracks or turn music off while a track is being prepared; a canceled track will not unexpectedly play later. Turning music off preserves the playback position. Selecting a track while music is off makes it play from the beginning when music is turned back on.

| Track | Duration | Instrumentation and Structure |
| --- | --- | --- |
| Distant Stars (遥远群星) | 1:30 | The original theme, cello counterpoint, plucked strings, and horn enter in sequence, before returning to the theme in a faint glow |
| Blue Cradle (蓝色摇篮) | 1:19 | Harp and cello call and response in 6/8, an eight-bar minor-key bridge, and a return to the cradle motif |
| Sails of the Corona (日冕之帆) | 1:30 | Syncopation, snare, and fills at 96 BPM, followed by a six-bar weightless interlude and an expansion around the horn theme |
| The Long Voyage (漫长航路) | 1:35 | Free-time drones, cello, and isolated notes slowly build tension while leaving space for the deep void |
| A Belated Echo (迟来的回声) | 1:24 | Offbeat vibraphone interweaves with three-note plucked figures; the theme stretches, answers in reverse, and draws to a close |
| Dawn on the Far Shore (彼岸晨曦) | 1:31 | Strings and flute introduce the theme in 3/4, followed by a quiet harp interlude and an expanded reprise driven by horn counterpoint |
| The Endless Beyond (无尽的彼方) | 1:52 | A flute theme, answering strings, and a sparse interlude; Shepard arpeggios and continuously rising layers are woven into the arrangement |
| Unsent Starlight (未寄出的星光) | 1:28 | A B–C–E–G theme at 172 BPM, extending across bar lines, rising development, a varied reprise, and a new climax |
| A Rondo Among the Stars (星幕间的回旋) | 1:30 | 140 BPM, an ornamental introduction, syncopated pizzicato, and rondo development from F major to G major |

Each track has its own note arrangement. Strings, cello, horn, flute, harp, vibraphone, marimba, and string pizzicato use real recordings from the Versilian Studios 256-sample pack; the remaining ambience, plucked sounds, and electronic rhythms retain synthesized timbres. Each track uses different spatial decay and mixing ratios, preserves dynamics and pauses within sections, and controls loudness and peak headroom. The original sample pack has no piano, so the relevant parts have been changed to harp.

The nine finished tracks total approximately 20 MB. The player loads them one at a time instead of synthesizing long audio in the game. See the [audio notes](public/audio/README.md) for licensing and asset records. After changing a score, use the existing Node.js installation, the project's TypeScript, and FFmpeg to run `npm run music:render -- /绝对路径/已解压采样目录` (the argument is the absolute path to the extracted sample directory). This regenerates the nine MP3 files and the sample mapping manifest under `public/audio/`. Normal development, builds, and gameplay do not require the original samples.

Scores can be exported with `npm run music:export` as per-instrument JSON suitable for LLM reading. The output goes to `exports/music/` and includes note names, MIDI pitches, timing, gain, pan, and legato markers. See the [export notes](exports/music/README.md).

## First Playthrough

The application opens in a 3D penthouse residence in “Dawn City” (曙光城). Beyond the warmly lit living room's floor-to-ceiling windows on all four sides are a vast Earth, the Sun's glow, and a rotating ring city curving into the distance. The residential band has a radius of 15 km and extends 24 km along the rotation axis. Rooftops point toward that axis, and one rotation takes about 4.10 minutes, producing approximately 1 g of artificial gravity in the room. Drag to look around and use WASD or the arrow keys to walk. You can also click or tap the floor to walk to that point while automatically avoiding furniture. Walking speed is 1.8 m/s; Esc stops movement. You can look out over the city in all four directions, and a cat wanders around the room. Click “Start” (开始) to move toward the desk and sit down, with the cat appearing beside it. The command interface opens after about 5.3 seconds; the transition can be skipped. “Return to Residence” (返回居所) at the top of the console pauses time and returns to the room while preserving game progress, target selection, and music state. When the system's reduced-motion setting is enabled, “Start” opens the console directly, and automatic movement of city traffic, celestial bodies, and the cat is disabled.

The cat uses a local GLB model, and the indoor furniture uses PBR textures. The ring city spreads around multiple density centers, with blocks of different sizes and orientations combining courtyards, terraces, staggered buildings, slab blocks, and towers. Roads, plazas, and low-rise housing leave space between clusters of tall buildings. Close-up buildings, mid-distance low-poly models, and distant city textures share the same layout, keeping buildings in place as detail levels change; no additional external asset downloads or dependencies are introduced. The room and city share a rotating reference frame. As the ring spins, it remains oriented toward Earth: its central axis slowly turns with its approximately 11.22-hour Earth orbit, keeping Earth's center in a fixed direction from the room. The Sun, Moon, and stars still change direction as the overall orientation changes. Celestial bodies retain a consistent radius-to-distance scale; Earth's night side uses artistic fill lighting to improve visibility. The ring city is a concept scene that follows the direction of rotational gravity. Its orientation uses kinematic constraints and does not simulate control torques, structural stress, or full rotating-frame dynamics. See “Model Credits” (模型鸣谢) in the opening scene and the [3D scene verification record](docs/verification/bridge_intro.md) for sources and licenses.

1. Select a neighboring star and approve the construction and loading of an unmanned probe. Its initial speed is 0.01c, so the first outbound journey takes hundreds of years.
2. While waiting, select the Solar System and manage the home world through the population and politics, research, economy, and planet planning panels. Monthly speed is suitable for observation; yearly and higher speeds are useful while waiting for travel.
3. When the probe report returns, use the historical survey to decide whether to settle, then set development goals, risk tolerance, and local authority.
4. The game pauses automatically when the first outpost report returns. Local reports are then sent every five years and still incur light-travel delay.
5. Continue managing through policies, budgets, regional planning, orbital facilities, supply routes, evacuation, and authorizations for local settlement.
6. Use the history panel to trace the causes of outcomes.

## Debug Console

Debug mode is off by default. Add `?debug=1` to the end of the game URL (or `&debug=1` if query parameters already exist), open the page, and click “Debug Console” (调试控制台) at the top, or press the backtick key (&#96;) while outside an input field. The close button or Esc hides the console. Remove the URL parameter and refresh to leave debug mode.

The console provides deterministic replay verification, simulation state and recent response times, and the latest 200 diagnostic log entries. Use the quick actions or enter `help`, `replay`, `status`, or `clear`. Replay verification pauses time, recomputes the current state from the session's seed and action log, and compares the result with the current state. Results and elapsed time appear in the console. It does not overwrite progress, and the player resumes time manually afterward. Verification errors do not prevent saving or continuing the game. The console is hidden in normal mode, and the Worker also rejects replay verification requests.

See [debug console verification](docs/verification/debug_console.md) for the verification scope.

## Connected Systems

- A fixed seed and 20 initially observed star systems; the astronomical catalog expands to 100 as needed.
- A 3D galaxy view, simplified star-system orbits, and 3D planets that can be zoomed and rotated.
- A fixed monthly simulation step; day, month, year, and high-speed controls; sublight travel; ship construction and loading; proper time; and delayed reports.
- The Worker exclusively owns the authoritative state. The UI receives only confirmed intelligence, known missions, history, and estimated ranges.
- Five categories of physical inventory, local production and consumption, prices, finances, tax rates, budgets, debt, and automatic borrowing and repayment.
- Twelve population groups per world, four political axes, interest coalitions, approval ratings, migration, protests, political-system constraints, and government reorganization.
- Five research directions, named prerequisite projects, time estimates, knowledge propagation, and local technology deployment.
- Probing, settlement, autonomous local site selection, a self-sustaining phase, crises, freight, migration, return evacuations, and autonomous local probing and settlement.
- Continuous surface zoom and spherical quadtree LOD; direct drawing of roads and seven zoning categories, draft undo, budget previews, construction progress, and road connectivity feedback. Existing population and economic data are still aggregated across 12 regions, while new development projects store their geographic coordinates independently.
- One fixed civilization and three ruin sites; delayed discovery, contact policies, changes in trust and development, and domestic political feedback.
- Disasters, automatic repairs, population continuity thresholds, automatic pauses for major reports, five-year reports, and century summaries.
- Manual saves, autosaves every 30 seconds, loading, version and structure validation, and replay of random state and action logs.

## Engineering Boundaries

```text
src/content/       Content and main balance parameters
src/simulation/    World generation, economy, events, commands, and player queries
src/workers/       Authoritative simulation entry point
src/presentation/  Three.js galaxy and planets
src/ui/            Management and command interface
src/persistence/   Save encoding and validation
```

Imperial time is displayed as years, months, and days. Dates advance between monthly boundaries at the current speed, with actual month lengths and leap years supported. Pausing or changing speed preserves the displayed progress within the current month; loading returns to the saved monthly settlement point. Day-level progress is used only for display and does not enter the simulation or saves.

All worlds use the same aggregated monthly settlement and continue running regardless of the selected map. Report and command arrival times are rounded up to a monthly boundary, adding at most one monthly settlement interval of delay and never arriving sooner than light could travel. The initial version uses constant-speed journeys and does not simulate separate acceleration and deceleration phases.

Version 0.5 uses save schema version 3 and the separate key `distant-stars-save-v3`; it neither migrates nor overwrites older saves. Corrupted saves or saves with a mismatched content version prompt the player to start a new epoch. Automatic overwriting is disabled until initialization succeeds.

Electron packaging, full diplomacy and warfare between alien nations, tactical combat, component-level ship design, and a separate micromanagement layer remain deferred according to the baseline.

See the [surface planning verification record](docs/verification/surface_planning.md) for current surface features and verification scope. See the [first playable implementation and verification record](docs/verification/first_playable.md) for earlier test evidence and playtest boundaries. Automated long-run verification cannot replace 2–4 hours of manual playtesting and balance adjustments.

## Trying Surface Planning

1. Select the Solar System, open “Star System” (恒星系), click Earth, then click “Enter Earth's Surface” (进入地球地表). Other planets have their own intelligence views; unknown properties of distant worlds await survey reports.
2. Double-click land to move closer continuously, and use the mouse wheel to adjust altitude. “Global View” (全球视角) zooms back out to the whole planet.
3. Select “Lay Roads” (铺设道路) and hold the left mouse button to draw on the surface. Then use the “Zoning Brush” (分区笔刷) to paint residential, industrial, and other zones along roads.
4. Review the budget and adjust with “Undo Stroke” (撤销一笔) or “Clear Draft” (清空草稿), then click “Approve Construction” (批准建设). Drafts are retained only in the current surface view; approve or clear them before leaving.
5. Advance time. Roads are built first; zones other than protected areas begin construction once nearby roads are halfway complete. Project reports show causes such as missing roads, supplies, or stability.
6. Use “Locate Surface Project” (定位地表工程) to return to approved projects. Buildings appear as progress increases. Saving and loading preserve planning coordinates and construction progress.

This is the first complete freehand drawing workflow: freehand roads, zoning brushes, and road-node snapping are supported. Rectangles, polygons, demolition of completed projects, bridges, individual-vehicle traffic, multiple colonies on arbitrary planets, and service-facility placement are not yet implemented. Earth uses procedural test terrain. Solar System orbital radii and planet radii are illustrative parameters; in-game habitability and resource values do not represent real astronomical conclusions.

### Solar System Imagery and Terrain

The Solar System now uses real imagery textures that permit use with attribution, and Earth planning shares real land/sea and regional elevation data. Resolution is approximately 20 km; agriculture and mineral resources are game estimates. Content version 0.6.0 requires starting a new epoch. See the [Solar System terrain notes](docs/verification/solar_terrain.md) for sources, licenses, reconstruction, and verification.

### Planet-Level Development

Version 0.7.0 supports selecting individual planets for colonization, transport, management, and surface planning. Mercury, Venus, and Mars can be developed within the Solar System, and established Solar System colonies can serve as departure points. A new epoch is required. See the [planet-level development notes](docs/verification/planetary_development.md).

## Spaceship Window Interface

The galaxy, star-system, and surface views share a curved metal window frame, with glass markings and subtle reflections overlaid on the live scene. Department controls sit on the bridge console at the bottom. Click a button to open its glass terminal; click the current department again, click collapse, or press Esc to return to observation. Opening a terminal does not unload the map or simulation session. Time, finances, and population readings are integrated into the instrument area below.

The galaxy uses glowing stars and sparse distance rings. Star names are directly clickable; labels in crowded areas are moved aside or hidden, while all targets remain accessible through the star-system selector. On narrow screens, department buttons scroll horizontally, and the page scrolls vertically to reach the time instruments. The decorative window frame does not intercept map interactions, and reduced-motion settings disable terminal entrance animations. See the [window interface verification record](docs/verification/cockpit_ui.md).

The lower left of the galaxy view shows the selected target, its distance, and how old the confirmed intelligence is. It also provides direct access to the star system, probe preparation, and intelligence. The lower right provides access to the latest received reports and the fleet. Entering surface planning collapses the management panel.

Expedition authorizations still use the existing forms. Ship labels in the galaxy can be clicked to view the estimated journey duration, departure or arrival countdown, and speed, or to jump to the destination. The fleet list opens the same journey view. The selected ship's route is highlighted.

Gold rings show the outbound positions of known administrative commands as simulation time advances. They disappear on arrival while the actual execution report is pending. Ship mission authorizations are not displayed as light-speed signals, and return reports that have not yet been received are not previewed. Continuous camera transitions have not yet been added.
