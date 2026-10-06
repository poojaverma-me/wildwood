# Wildwood — voice-controlled survival, powered by Jev

Wildwood is a first-person survival sandbox in a forest valley. You walk with the keyboard and mouse, and you change
the world with your voice: *"make it rain"*, *"bring out my pistol"*, *"use a bandage and drink some water"*,
*"make it night and grab my flashlight"*. There are no menus, inventory wheels or hotkeys for any of it.

Every sentence you say is understood by **Jev**, TypeSafe's System One model, in roughly a tenth of a second. This
document explains how the game uses Jev, why a classification model is the right tool for game input, and how the
pieces fit together.

---

## Contents

1. [What Jev is](#1-what-jev-is)
2. [The idea: voice as a game controller](#2-the-idea-voice-as-a-game-controller)
3. [How a spoken sentence becomes a game action](#3-how-a-spoken-sentence-becomes-a-game-action)
4. [The request: one sentence, nineteen questions](#4-the-request-one-sentence-nineteen-questions)
5. [Speculative fan-out, explained](#5-speculative-fan-out-explained)
6. [Rules live in code, not in the model](#6-rules-live-in-code-not-in-the-model)
7. [Everything Jev does in Wildwood](#7-everything-jev-does-in-wildwood)
8. [Measured results](#8-measured-results)
9. [Why Jev and not an LLM](#9-why-jev-and-not-an-llm)
10. [Seeing Jev think: the Jev brain and the `/how` page](#10-seeing-jev-think-the-jev-brain-and-the-how-page)
11. [Using a model like Jev in other games](#11-using-a-model-like-jev-in-other-games)
12. [Adding a new voice command](#12-adding-a-new-voice-command)
13. [Running the game](#13-running-the-game)
14. [The world and the engine](#14-the-world-and-the-engine)
15. [Limits and known issues](#15-limits-and-known-issues)
16. [Code map and credits](#16-code-map-and-credits)

---

## 1. What Jev is

Jev is a **System One** model: a fast classifier, not a text generator. You send it a piece of state (here, what the
player said plus a snapshot of the game) and a set of typed questions. It returns typed answers, each with
probabilities:

| Question type | What you ask | What comes back |
|---|---|---|
| `noul` | A yes/no question | A probability between 0 and 1 |
| `choice` | Pick one option from a list you define | The chosen option, a probability for every option, and a confidence |
| `score` | Rate something on a scale you define | A score, the probability of each level, and a confidence |

Because Jev only ever answers with options you defined, it cannot invent a command the game doesn't have, and there is
no free text to parse. It answers many questions about the same state in a single request, in parallel.

| | |
|---|---|
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` |
| Speed | ~70–250 ms per request in this game (measured) |
| Price | $0.042 per million input tokens; output is free |
| Context | Up to 64k tokens of state |

---

## 2. The idea: voice as a game controller

Most games turn intent into a chain of finger movements. To heal, you open the inventory, find the first-aid kit,
select it, then confirm. To switch guns, you hold a key, aim at a slot on a weapon wheel and release. Each of these is
a small menu game layered on top of the real game, and every one has to be learned.

Wildwood skips the menus. You say what you want, the way you'd say it to a person, and the game does it:

| In a typical game | In Wildwood |
|---|---|
| Open inventory → find first-aid kit → select → apply bandage | *"Use a bandage"* |
| Hold weapon-wheel key → aim at pistol slot → release | *"Bring out my pistol"* |
| Open menu → eat → open menu → drink | *"Eat something and drink some water"* |
| Equip flashlight → press a key to switch it on | *"It's too dark, I can't see anything"* |
| Not possible: weather and time are fixed or scripted | *"Make it night and start a thunderstorm"* |

This works because the model's job is narrow and well defined: map a free-form sentence onto a fixed set of game
actions, fast enough to feel instant.

---

## 3. How a spoken sentence becomes a game action

```text
 You speak                      Browser                         Server                       Jev
 ─────────                      ───────                         ──────                       ───
 "use a bandage and     ──▶  Speech recognition         ──▶  /api/command builds     ──▶  answers 19 typed
  drink some water"          (Chrome Web Speech API)          one request: what you        questions in one
                             turns audio into text.           said + game state +          pass (~100 ms)
                             Or press T and type.             19 questions                       │
                                                                                                 │
 The game changes  ◀──  Game rules in code           ◀──  Typed answers with probabilities ◀────┘
 (health +22,           (planDecision / applyDecision)
  thirst +50)           decide what actually runs
```

1. **Hearing.** The browser's built-in speech recognition listens continuously while the mic is on and turns each
   finished phrase into text (`src/lib/voice.ts`). Where speech isn't available, you press **T** and type the same
   sentence. Both paths go through the same pipeline.
2. **Asking.** The text and a snapshot of the game go to `src/app/api/command/route.ts`, which builds one Jev request
   (section 4) and calls Jev server-side, so the API key never reaches the browser.
3. **Deciding.** The route turns Jev's answers into a `Decision`: which command categories passed their yes/no gate
   (probability ≥ 0.5), and which option(s) Jev picked inside each.
4. **Acting.** Plain TypeScript (`src/lib/apply.ts`) applies game rules and runs the commands: changing the weather,
   swapping the item in your hands, using up a bandage, lighting the fire.

Jev decides *what you meant*; the game code decides *what happens*.

---

## 4. The request: one sentence, nineteen questions

Every sentence becomes **one** request containing **19 questions**. The state Jev sees looks like this:

```json
{
  "player_said": "use a bandage and drink some water",
  "game_state": {
    "weather": "Clear & sunny",
    "time_of_day": "Sunset",
    "holding": "Empty hands",
    "campfire_lit": false,
    "flashlight_on": false,
    "health_percent": 58
  }
}
```

Including the game state lets Jev resolve context. "Put it away" means something only if you're holding something, and
"it's too dark" reads differently at night.

The 19 questions are built from the command vocabulary in `src/lib/commands.ts`:

| Category | Gate question (yes/no) | Pick inside the category | Questions |
|---|---|---|---|
| **Weather** | Does the player want to change the weather? | `choice` of Clear & sunny, Light rain, Heavy rain, Thunderstorm, Snow, Fog | 2 |
| **Time of day** | Does the player want to change the time of day? | `choice` of Sunrise, Midday, Sunset, Night | 2 |
| **Equip** | Does the player ask to take out, hold, switch to or put away an item? | `choice` of Pistol, Axe, Flashlight, Torch, Map, Empty hands | 2 |
| **Use a supply** | Does the player want to use, eat or drink a supply? | One yes/no **per supply**: Bandage, Medkit, Canned food, Water bottle, Energy drink | 6 |
| **World action** | Does the player want to light/put out the fire, reload, or switch the flashlight? | One yes/no **per action**: Light campfire, Put out campfire, Reload, Flashlight on, Flashlight off | 6 |
| **Status** | Is the player asking how they're doing? | (none) | 1 |
| | | **Total** | **19** |

Every option carries a short hint that steers Jev without examples, for instance
`"Medkit": "First-aid kit, heal a lot"` or `"Map": "Paper map of the valley; look at or check the map"`. Per-option
questions use Jev's structured instructions, which point at a field:

```json
"consumable_0": {
  "type": "noul",
  "instructions": {
    "item": "Bandage (Treat a small wound, stop bleeding)",
    "question": "Does the player want to use this supply? Consider `item`."
  }
}
```

---

## 5. Speculative fan-out, explained

The pattern comes from TypeSafe's smart-home demo. Instead of first asking *"what kind of command is this?"* and then
asking a follow-up, Wildwood asks **every** category its yes/no gate *and* its pick, all at once, in a single request.
Most of those answers are thrown away. That's the "speculative" part, and it's affordable because Jev is cheap and
answers questions in parallel.

What you get in return:

- **One round trip.** No second call after classifying the intent, so latency stays around 100 ms.
- **Compound commands for free.** *"Make it night and grab my flashlight"* passes two gates (Time → Night and
  Equip → Flashlight), and both run. Nothing has to split the sentence first.
- **Several items at once.** Supplies and world actions get one yes/no per option rather than a single choice, so
  *"use a bandage and drink some water"* returns *yes* for both. An earlier version used a single choice there and
  could only ever use one item per sentence.
- **Ignoring chatter.** *"What a beautiful view"* fails every gate, so the game does nothing. That matters with an
  always-on microphone.

The threshold is **0.5** on each gate. When a gate passes, a single-choice category takes Jev's top option, and a
multi-option category takes every option at or above 0.5 (or the single best one if none reach it).

---

## 6. Rules live in code, not in the model

Jev reports what the player wants, with probabilities. Whether and how that happens is the game's business, and it lives
in ordinary, testable code (`planDecision` in `src/lib/apply.ts`):

- **One item per need.** *"Patch me up"* scores both Medkit (0.76) and Bandage (0.75) as plausible. Using both would
  waste supplies, so the game keeps only the most likely item in each need group: healing (bandage or medkit) and
  drinking (water or energy drink).
- **Ignore equip noise.** *"Use a bandage"* can faintly read as "empty your hands". When another command has already
  fired, an equip of *Empty hands*, or of the item you're already holding, is ignored.
- **Game consequences.** Inventory counts, health gains (bandage +22, medkit +55), ammo limits, "already holding that",
  "the fire is already burning", objectives and the combo achievement are all plain game logic.

This split keeps the model's job small and stable. Balancing the game never means rewording a prompt, and every rule
can be read in one file.

---

## 7. Everything Jev does in Wildwood

| You can say… | Category | What happens |
|---|---|---|
| "make it rain", "let it pour", "start a thunderstorm", "I want snow", "clear skies" | Weather | Weather eases to the new state: rain streaks, lightning and thunder, snow that settles, fog |
| "make it night", "sunrise please", "take me to midday" | Time of day | The sun moves forward to that time; stars, moon, cabin lights and fog colour follow |
| "bring out my pistol", "switch to the axe", "show me the map", "put it away" | Equip | The held item swaps, with sound and a short lower/raise animation |
| "use a bandage", "I'm starving", "I'm thirsty", "patch me up", "I'm exhausted" | Use a supply | The right supply is used up and health, hunger, thirst or stamina recover |
| "light the fire", "reload", "turn on the flashlight", "it's too dark" | World action | The campfire lights, the pistol reloads, the beam switches on |
| "how am I doing?" | Status | Shows health, hunger, thirst and ammo |
| "make it night and grab my flashlight" | Two categories | Both happen, from one sentence |
| "what a beautiful view" | None | Nothing; chatter is ignored |

Voice keeps working while the game is paused, and you can also press **T** and type any of the above.

---

## 8. Measured results

Live calls to Jev through the game's own `/api/command` route, from a fresh game state (sunset, 58% health, empty hands):

| Player said | What Jev answered (gate → picks) | Latency |
|---|---|---|
| "use a bandage and drink some water" | Use item 0.96 → Bandage 0.95, Water bottle 0.88 | 236 ms |
| "bring out my pistol" | Equip 0.98 → Pistol 1.00 | 84 ms |
| "make it night and grab my flashlight" | Time 0.98 → Night 1.00 · Equip 0.97 → Flashlight 1.00 | 77 ms |
| "patch me up" | Use item 0.79 → Medkit 0.76, Bandage 0.75 (game keeps Medkit only) | 123 ms |
| "it's too dark, I can't see anything" | World action 0.78 → Flashlight on 0.80, Light the campfire 0.76 | 187 ms |
| "let it pour" | Weather 0.72 → Heavy rain 1.00 | 142 ms |
| "what a beautiful view" | No gate passed → nothing happens | 76 ms |

Each request is about **1,330 input tokens** for 19 questions, which works out to **about $0.000056 per command**:
roughly **$0.06 per thousand spoken commands**. Latency is the round trip from the game server to Jev; the very first
request after starting can take 300–400 ms while connections warm up.

---

## 9. Why Jev and not an LLM

You could send the sentence to a large language model with a list of tools and parse the function call it writes.
For game input, Jev is a better fit:

- **Speed you can play with.** At 60 fps a frame lasts 16.7 ms, so a Jev answer arrives in about 5–14 frames. A
  generated function call has to read the prompt, write JSON token by token and come back. We estimate around 1.9 s
  for that, or about 110 frames, which is long enough for the moment to pass. (Jev figures are measured; the LLM
  figure is an estimate.)
- **No parsing, no surprises.** Jev can only answer with the options the game defined. A generated call can be
  malformed, name an item that doesn't exist, or answer in prose. Here there is nothing to validate.
- **Probabilities, not just answers.** Every pick comes with a probability. The game uses that for its 0.5 gates, the
  one-item-per-need rule and the on-screen explanations.
- **Cost.** At ~$0.06 per thousand commands, players can talk to the game constantly.
- **Many questions, one call.** Nineteen questions cost one request, which is what makes speculative fan-out practical.

The trade-off is that Jev chooses rather than writes. It can't invent a new kind of action. For game controls that's
exactly what you want.

---

## 10. Seeing Jev think: the Jev brain and the `/how` page

Two views make every decision visible:

- **Jev brain (press Tab in game).** For the last sentence, it shows each category's gate probability, the
  probabilities of the options inside it, which gates fired, and which picks a game rule suppressed and why.
- **`/how` page.** Type any sentence, or click an example, to see the full decision, what the game would do, the exact
  request sent to Jev, and a frame-budget strip comparing Jev's measured latency with the estimated LLM call at 60 fps.

---

## 11. Using a model like Jev in other games

Voice is one of the most natural inputs we have, but games have mostly kept it to voice chat with other players. The
obstacle was never the microphone. It was understanding loose, everyday speech quickly enough to drive gameplay, and
safely enough that the game never does something the designer didn't allow. A classification model removes both
obstacles: it hears *"patch me up"*, *"I'm hurt, use something"* or *"heal"* as the same intent, answers inside a
handful of frames, and can only ever pick actions the game already defined.

That turns many finger-heavy interactions into a single sentence:

- **Inventory and first aid.** Instead of opening a bag, finding the first-aid kit and pressing *apply*, the player says
  *"use a bandage"*. The game still checks you have one; you just skip the menu.
- **Weapon selection.** Instead of a weapon wheel, *"switch to the shotgun"*, *"give me something quieter"* or *"pull
  out the sniper"*. Fuzzy requests like "something quieter" can work because each option carries a description Jev reads.
- **Commanding squads and companions.** *"Cover me"*, *"flank left"*, *"hold this position"* map to a fixed set of AI
  orders. Speculative fan-out lets one sentence carry an order and a target together.
- **Strategy and simulation.** *"Build two barracks near the river"* or *"set taxes to low"* classify into build and
  policy actions, with `score` questions for amounts.
- **Accessibility.** Players with limited hand mobility, or who find complex controllers hard to use, get a full
  control scheme from speech. Voice can sit alongside the controller rather than replace it.
- **Immersion and pacing.** Calling for a bandage mid-fight or asking a companion for a torch keeps your eyes on the
  world instead of on menus.
- **Dialogue and narrative.** Classify what the player says to a character (threat, bargain, lie, compliment) and branch
  the scripted story, without generating any dialogue.

What makes it work well in practice:

1. **Keep the vocabulary closed.** List the actions the game supports, each with a short description. The model chooses
   among them; it doesn't invent.
2. **Fan out speculatively.** Ask every category at once with a yes/no gate plus a pick, so compound sentences and idle
   chatter are handled in one request.
3. **Send game state.** What the player holds, where they are and what's nearby resolves "put it away" and "light it".
4. **Gate on confidence.** Act above a threshold; below it, do nothing, ask the player, or show a hint. Never act on a
   guess for something irreversible.
5. **Keep rules in code.** Ammo, cooldowns, inventory and balance stay in the game, not in the model.
6. **Respect the latency budget.** Aim for answers within a few frames. Run the call off the main thread and give
   instant feedback (a sound, a "listening" indicator) while it's in flight.
7. **Always offer a fallback.** Typed commands, push-to-talk for noisy rooms, and normal controls for players who
   prefer them.

---

## 12. Adding a new voice command

Say you want *"throw a rock"* and *"whistle"*.

1. **Vocabulary.** Add the actions to `ACTIONS` in `src/lib/commands.ts`, each with a short hint:
   ```ts
   export const ACTIONS = {
     // …existing actions
     "Throw a rock": "Throw a stone at something",
     Whistle: "Whistle loudly to call or startle",
   } as const;
   ```
   Because world actions use one yes/no per option, this automatically adds two questions to the request. If the new
   actions don't fit any category, add a category to `CATEGORIES` with its own gate question.
2. **Effect.** Handle the new cases in `worldAction` in `src/lib/apply.ts`, which is where the game logic lives (sounds,
   animations, inventory).
3. **Try it.** Open `/how`, type a few phrasings, and check the probabilities in the inspector. If a phrasing is missed,
   improve the option's hint or the gate question rather than adding special cases.

No training, examples or prompt engineering are needed beyond the descriptions.

---

## 13. Running the game

```bash
cd 05-wildwood
npm install
npm run dev -- -p 3105
```

- Put your TypeSafe key in `05-wildwood/.env.local` as `TYPESAFE_API_KEY=…`. It's only read on the server.
- Open <http://localhost:3105>. **Use Chrome for voice**, since it has built-in speech recognition. In other browsers
  (and in the in-app preview) press **T** to type commands.
- **Controls:** WASD or arrow keys to move, mouse to look, Shift to sprint, Space to jump, left-click to shoot or chop,
  **T** to type, **Tab** for the Jev brain, **Esc** to pause.
- **Power modes** (start screen or pause menu, remembered between visits): *Cool* 30 fps for battery and heat,
  *Balanced* (default) 60 fps while moving and 30 when still, *Smooth* full rate and a sharper image.
- URL options: `?power=cool|balanced|smooth`, `?fx=0` (no post-processing), `?ao=1` (ambient occlusion).

---

## 14. The world and the engine

The valley is rendered in real time with three.js through React Three Fiber, inside a Next.js app.

- **Terrain:** ridged-noise mountains around a walkable valley. A shader blends photoscanned forest floor, trails, cliff
  rock and snow by slope and altitude.
- **Forest:** procedurally grown pines (ez-tree) with real bark and needle textures. Near trees are full meshes; about
  4,700 distant trees are camera-facing impostors baked at startup.
- **Grass, props and cabin:** GPU grass that bends in the wind and flattens under snow. Photoscanned rocks, ferns, fire
  pit, lantern and held items come from Poly Haven. The log cabin is built from bark-textured logs, with a slate roof
  and stone chimney.
- **Sky, light and weather:** a physical sky with its own clouds; lighting generated from that sky as the sun moves;
  moon and stars; GPU rain and snow; lightning; a lake with real reflections.
- **Efficiency:** the game renders only as often as needed (full rate while you move, less when you stand still, a
  trickle behind menus, nothing in a hidden tab). Lights exist only while lit, shadows refresh only when you've walked a
  few metres, and the lake mirror refreshes every few frames. On an Apple M4 at 1440×900 a Balanced frame costs about
  7 ms of GPU time.
- **Sound:** all synthesised in the browser with WebAudio, with no audio files.

---

## 15. Limits and known issues

- **Voice needs Chrome.** Speech-to-text is the browser's own (Web Speech API), not Jev. Accents, background noise and
  the browser's recogniser affect what text reaches Jev. Typing with **T** always works.
- **Thresholds are fixed at 0.5.** Borderline phrases like *"let it pour"* (weather gate 0.72) pass comfortably, but
  very vague requests may not. A future version could ask the player to confirm when a gate lands between, say, 0.4
  and 0.6.
- **"It's too dark" can do two things.** It currently both switches the flashlight on and lights the campfire, because
  they're separate needs. A rule could prefer one.
- **First load streams ~25 MB** of models and textures from Poly Haven's CDN; the start screen shows progress.
- **Pointer lock** (mouse look) needs a click into the game; shooting and chopping can't be tested in headless
  browsers.

---

## 16. Code map and credits

| File | What it does |
|---|---|
| `src/lib/commands.ts` | Command vocabulary, the 19 questions, the state sent to Jev |
| `src/app/api/command/route.ts` | One Jev request per sentence; turns answers into a `Decision` |
| `src/lib/jev.ts` | Server-only Jev client: timeouts, retries, cost |
| `src/lib/apply.ts` | Game rules (`planDecision`) and effects (`applyDecision`) |
| `src/lib/voice.ts` | Always-on speech recognition and the typed fallback |
| `src/components/hud/Inspector.tsx` | The Jev brain panel |
| `src/app/how/*` | The "How Jev hears you" page |
| `src/components/game/*` | World, weather, player, held items, rendering and power management |
| `src/lib/power.ts` | Power modes |

**Credits:** Jev by TypeSafe. Models and textures from [Poly Haven](https://polyhaven.com) (CC0). Pine generator
[ez-tree](https://github.com/dgreenheck/ez-tree) by Daniel Greenheck (MIT). Built with three.js, React Three Fiber,
drei, postprocessing and Next.js.
