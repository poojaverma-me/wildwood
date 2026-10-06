"use client";

import type { Consumable, Decision, Item, TimeOfDay, Weather, WorldAction } from "./commands";
import { sfx } from "./audio";
import { TIME_HOURS, useGame } from "./store";

export type Executed = { id?: string; category: string; label: string; suppressed?: string };

const LABEL: Record<string, string> = { weather: "Weather", time: "Time", equip: "Equip", consume: "Use", action: "Action" };

/** Pure: which commands will run for a decision. All the rules live here, in code. */
export function planDecision(d: Decision, holding?: string): (Executed & { id: string; choice: string })[] {
  const fired = d.gates.filter((x) => x.fired);
  const out: (Executed & { id: string; choice: string })[] = fired.flatMap((gate) => {
    // "Use a bandage" sometimes also reads as "empty your hands": ignore that when something else fired.
    // Likewise, "equip what you're already holding" is noise when another command fired.
    const suppressed =
      gate.id === "equip" && fired.length > 1 && (gate.choice === "Empty hands" || gate.choice === holding) ? "another command fired" : undefined;
    // Supplies and world actions can fire several options at once, but only one item per need:
    // "patch me up" shouldn't burn both a bandage and the medkit.
    const groupOf = (c: string) => (c === "Bandage" || c === "Medkit" ? "heal" : c === "Water bottle" || c === "Energy drink" ? "drink" : c);
    const best = new Map<string, string>();
    for (const c of gate.choices) {
      const g = groupOf(c);
      if (!best.has(g) || (gate.probs[c] ?? 0) > (gate.probs[best.get(g)!] ?? 0)) best.set(g, c);
    }
    return gate.choices.map((choice) => ({
      id: gate.id,
      choice,
      category: LABEL[gate.id],
      label: choice,
      suppressed: suppressed ?? (best.get(groupOf(choice)) !== choice ? "one item per need" : undefined),
    }));
  });
  if (d.status >= 0.5) out.push({ id: "status", choice: "", category: "Status", label: "Show vitals" });
  return out;
}

/** Turn Jev's typed answers into game effects. */
export function applyDecision(d: Decision): Executed[] {
  const g = useGame.getState();
  const planned = planDecision(d, g.holding);
  for (const p of planned) {
    if (p.suppressed) continue;
    switch (p.id) {
      case "weather":
        setWeather(p.choice as Weather);
        break;
      case "time":
        setTime(p.choice as TimeOfDay);
        break;
      case "equip":
        equip(p.choice as Item);
        break;
      case "consume":
        consume(p.choice as Consumable);
        break;
      case "action":
        worldAction(p.choice as WorldAction);
        break;
      case "status":
        g.set({ statusAt: Date.now() });
        g.toast(`Health ${Math.round(g.health)}% · hunger ${Math.round(g.hunger)}% · thirst ${Math.round(g.thirst)}% · ${g.mag}/${g.reserve} rounds`, "info");
        break;
    }
  }
  const out: Executed[] = planned.map(({ id, category, label, suppressed }) => ({ id, category, label, suppressed }));
  if (out.filter((o) => !o.suppressed).length >= 2) g.complete("combo");
  if (!out.length) g.toast(`“${d.text}”: no game command heard`, "warn");
  return out;
}

function setWeather(w: Weather) {
  const g = useGame.getState();
  g.set({ weather: w, lightningAt: w === "Thunderstorm" ? Date.now() : g.lightningAt });
  if (w === "Thunderstorm") sfx.thunder();
  g.complete("weather");
  g.toast(`Weather → ${w}`, "jev");
  return w;
}

function setTime(t: TimeOfDay) {
  const g = useGame.getState();
  let target = TIME_HOURS[t];
  while (target < g.hour) target += 24; // always move forward through the day
  g.set({ targetHour: target });
  g.toast(`Time → ${t}`, "jev");
  return t;
}

function equip(item: Item) {
  const g = useGame.getState();
  if (g.holding === item) {
    g.toast(`Already holding ${item === "Empty hands" ? "nothing" : `the ${item.toLowerCase()}`}`, "info");
    return item;
  }
  g.set({ holding: item, swapAt: Date.now(), mapOpen: item === "Map" });
  sfx.equip();
  if (item !== "Empty hands" && item !== "Map") g.complete("equip");
  g.toast(item === "Empty hands" ? "Hands empty" : `Equipped ${item}`, "jev");
  return item;
}

function consume(c: Consumable) {
  const g = useGame.getState();
  if (g.inventory[c] <= 0) {
    g.toast(`No ${c.toLowerCase()} left`, "warn");
    return `${c} (none left)`;
  }
  const inv = { ...g.inventory, [c]: g.inventory[c] - 1 };
  const patch: Partial<typeof g> = { inventory: inv, healAt: Date.now() };
  if (c === "Bandage") patch.health = Math.min(100, g.health + 22);
  if (c === "Medkit") patch.health = Math.min(100, g.health + 55);
  if (c === "Canned food") patch.hunger = Math.min(100, g.hunger + 45);
  if (c === "Water bottle") patch.thirst = Math.min(100, g.thirst + 50);
  if (c === "Energy drink") {
    patch.stamina = 100;
    patch.boostUntil = Date.now() + 20_000;
  }
  g.set(patch);
  sfx.heal();
  if (c === "Bandage" || c === "Medkit") g.complete("heal");
  g.toast(`Used ${c.toLowerCase()} · ${inv[c]} left`, "good");
  return c;
}

function worldAction(a: WorldAction) {
  const g = useGame.getState();
  switch (a) {
    case "Light the campfire":
      if (g.campfire) g.toast("The fire is already burning", "info");
      else {
        g.set({ campfire: true });
        sfx.ignite();
        g.complete("fire");
        g.toast("Campfire lit. Stand close to recover health", "good");
      }
      break;
    case "Put out the campfire":
      g.set({ campfire: false });
      g.toast("Campfire out", "info");
      break;
    case "Reload weapon": {
      const need = 8 - g.mag;
      const take = Math.min(need, g.reserve);
      if (take <= 0) g.toast(need <= 0 ? "Magazine already full" : "No ammo left", "warn");
      else {
        g.set({ mag: g.mag + take, reserve: g.reserve - take, swapAt: Date.now() });
        sfx.reload();
        g.toast(`Reloaded · ${g.mag + take}/${g.reserve - take}`, "good");
      }
      break;
    }
    case "Flashlight on":
      g.set({ flashlightOn: true, ...(g.holding !== "Flashlight" ? { holding: "Flashlight" as Item, swapAt: Date.now() } : {}) });
      sfx.click();
      g.toast("Flashlight on", "jev");
      break;
    case "Flashlight off":
      g.set({ flashlightOn: false });
      sfx.click();
      g.toast("Flashlight off", "jev");
      break;
  }
  return a;
}
