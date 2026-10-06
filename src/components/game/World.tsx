"use client";

import Cabin from "./Cabin";
import Campfire from "./Campfire";
import Grass from "./Grass";
import Lake from "./Lake";
import { Rocks, Undergrowth } from "./Props";
import Range from "./Range";
import Safe from "./Safe";
import Terrain from "./Terrain";
import Trees from "./Trees";

export { snowRef } from "./env";

// `?off=grass,trees` hides parts of the world, for profiling.
const off =
  typeof window === "undefined"
    ? []
    : (new URLSearchParams(window.location.search).get("off")?.split(",") ??
      []);
const show = (k: string) => !off.includes(k);

/** Each piece streams in on its own, so a slow asset never blocks the rest of the valley. */
export default function World() {
  return (
    <>
      {show("terrain") && (
        <Safe name="terrain">
          <Terrain />
        </Safe>
      )}
      {show("grass") && <Grass />}
      {show("trees") && (
        <Safe name="trees">
          <Trees />
        </Safe>
      )}
      {show("rocks") && (
        <Safe name="rocks">
          <Rocks />
        </Safe>
      )}
      {show("undergrowth") && (
        <Safe name="undergrowth">
          <Undergrowth />
        </Safe>
      )}
      {show("lake") && (
        <Safe name="lake">
          <Lake />
        </Safe>
      )}
      {show("cabin") && (
        <Safe name="cabin">
          <Cabin />
        </Safe>
      )}
      {show("campfire") && (
        <Safe name="campfire">
          <Campfire />
        </Safe>
      )}
      {show("range") && (
        <Safe name="range">
          <Range />
        </Safe>
      )}
    </>
  );
}
