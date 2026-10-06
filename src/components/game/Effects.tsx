"use client";

import { Bloom, EffectComposer, FXAA, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * Bloom makes fire and lamps glow; ACES keeps highlights filmic; AO is opt-in. FXAA rather than
 * SMAA: near-identical edges here, at about a sixth of the cost (SMAA alone was ~4 ms a frame).
 */
export default function Effects({ ao }: { ao: boolean }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <>{ao && <N8AO halfRes aoRadius={1.6} distanceFalloff={0.6} intensity={1.4} quality="performance" />}</>
      <Bloom mipmapBlur luminanceThreshold={1.2} luminanceSmoothing={0.2} intensity={0.7} radius={0.65} levels={4} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <FXAA />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}
