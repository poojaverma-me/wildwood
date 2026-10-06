import type { Question } from "./jev";

export const WEATHER = {
  "Clear & sunny": "Blue sky, sunshine, no rain",
  "Light rain": "Drizzle, a little rain",
  "Heavy rain": "Downpour, pouring rain",
  Thunderstorm: "Storm with lightning and thunder",
  Snow: "Snowfall, winter, cold",
  Fog: "Mist, fog, haze, low visibility",
} as const;

export const TIMES = {
  Sunrise: "Dawn, early morning",
  Midday: "Daytime, bright, noon",
  Sunset: "Dusk, golden hour, evening",
  Night: "Dark, midnight, stars",
} as const;

export const ITEMS = {
  Pistol: "Handgun, gun, sidearm, weapon",
  Axe: "Hatchet, chopping tool",
  Flashlight: "Torchlight, electric light to see in the dark",
  Torch: "Burning wooden torch, fire on a stick",
  Map: "Paper map of the valley; look at or check the map",
  "Empty hands": "Put the item away, holster, unequip",
} as const;

export const CONSUMABLES = {
  Bandage: "Treat a small wound, stop bleeding",
  Medkit: "First-aid kit, heal a lot",
  "Canned food": "Eat something, hunger",
  "Water bottle": "Drink water, thirst",
  "Energy drink": "Restore stamina, feel tired",
} as const;

export const ACTIONS = {
  "Light the campfire": "Start or light the fire",
  "Put out the campfire": "Extinguish the fire",
  "Reload weapon": "Reload the pistol",
  "Flashlight on": "Switch the flashlight on",
  "Flashlight off": "Switch the flashlight off",
} as const;

export type Weather = keyof typeof WEATHER;
export type TimeOfDay = keyof typeof TIMES;
export type Item = keyof typeof ITEMS;
export type Consumable = keyof typeof CONSUMABLES;
export type WorldAction = keyof typeof ACTIONS;

export const CATEGORIES = [
  { id: "weather", multi: false, gate: "wantsWeather", pick: "weather", label: "Weather", ask: "Does the player want to change the weather (sun, rain, pouring, storm, snow, fog)?", options: WEATHER, question: "What weather does the player want?" },
  { id: "time", multi: false, gate: "wantsTime", pick: "time", label: "Time of day", ask: "Does the player want to change the time of day (morning, day, evening, night)?", options: TIMES, question: "What time of day does the player want?" },
  { id: "equip", multi: false, gate: "wantsEquip", pick: "item", label: "Equip", ask: "Does the player ask to take out, hold, look at, switch to, or put away an item (pistol, axe, flashlight, torch or map)?", options: ITEMS, question: "Which item does the player want in their hands?" },
  { id: "consume", gate: "wantsConsume", pick: "consumable", label: "Use item", ask: "Does the player want to use, eat or drink a supply such as a bandage, medkit, food, water or a drink?", options: CONSUMABLES, question: "Does the player want to use this supply?", multi: true },
  { id: "action", gate: "wantsAction", pick: "action", label: "World action", ask: "Does the player want to light or put out the campfire, reload, or switch the flashlight on or off?", options: ACTIONS, question: "Does the player want to do this?", multi: true },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export type GameContext = { weather: Weather; time: TimeOfDay; holding: Item; campfire: boolean; flashlightOn: boolean; health: number };

/**
 * Speculative fan-out: one yes/no gate per command category plus a speculative choice for each,
 * all in one request. Code runs every category whose gate passes, so compound commands
 * ("make it night and grab my flashlight") need no splitting step.
 */
export function commandQuestions(): Record<string, Question> {
  const q: Record<string, Question> = {};
  for (const c of CATEGORIES) {
    q[c.gate] = { type: "noul", instructions: c.ask };
    if (c.multi) {
      // Several supplies or actions can be wanted at once ("bandage and water"), so each gets its own yes/no.
      Object.entries(c.options as Record<string, string>).forEach(([opt, hint], i) => {
        q[`${c.pick}_${i}`] = { type: "noul", instructions: { item: `${opt} (${hint})`, question: `${c.question} Consider \`item\`.` } };
      });
    } else q[c.pick] = { type: "choice", instructions: c.question, criteria: c.options as Record<string, string> };
  }
  q.wantsStatus = { type: "noul", instructions: "Is the player asking how they are doing (health, hunger, supplies, ammo)?" };
  return q;
}

export const commandState = (text: string, game: GameContext) => ({
  player_said: text,
  game_state: {
    weather: game.weather,
    time_of_day: game.time,
    holding: game.holding,
    campfire_lit: game.campfire,
    flashlight_on: game.flashlightOn,
    health_percent: Math.round(game.health),
  },
});

export type Decision = {
  text: string;
  gates: { id: CategoryId; label: string; p: number; choice: string; choices: string[]; multi: boolean; probs: Record<string, number>; confidence: number; fired: boolean }[];
  questions: number;
  status: number;
  latencyMs: number;
  inputTokens: number;
  costUsd: number;
  request?: unknown;
  error?: string;
};
