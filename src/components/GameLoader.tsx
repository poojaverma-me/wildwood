"use client";

import dynamic from "next/dynamic";

const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 grid place-items-center bg-[#07090c]">
      <div className="font-title text-6xl tracking-wide text-amber">Wildwood</div>
    </div>
  ),
});

export default function GameLoader() {
  return <Game />;
}
