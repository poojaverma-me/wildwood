"use client";

import { Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { setAmbience, sfx } from "@/lib/audio";
import type { Weather } from "@/lib/commands";
import { useGame } from "@/lib/store";
import { CAMPFIRE } from "@/lib/world";
import { ENV } from "./env";
import { syncLightVisibility, warmLightVariants } from "./lights";
import { sunState } from "./sun";
import Precipitation from "./Precipitation";

type Mix = { rain: number; snow: number; storm: number; fog: number; cloud: number };
const TARGET: Record<Weather, Mix> = {
  "Clear & sunny": { rain: 0, snow: 0, storm: 0, fog: 0, cloud: 0 },
  "Light rain": { rain: 0.35, snow: 0, storm: 0, fog: 0.25, cloud: 0.65 },
  "Heavy rain": { rain: 1, snow: 0, storm: 0, fog: 0.45, cloud: 0.9 },
  Thunderstorm: { rain: 1, snow: 0, storm: 1, fog: 0.5, cloud: 1 },
  Snow: { rain: 0, snow: 1, storm: 0, fog: 0.45, cloud: 0.8 },
  Fog: { rain: 0, snow: 0, storm: 0, fog: 1, cloud: 0.55 },
};

const C = (h: string) => new THREE.Color(h);
const HORIZON_DAY = C("#b4c7d8");
const HORIZON_GOLD = C("#e2a678");
const HORIZON_NIGHT = C("#0c1424");
const OVERCAST = C("#8a939b");
const OVERCAST_NIGHT = C("#0b0e13");
const FOG_GREY = C("#aab2b8");
const FLASH = C("#d6e0ff");
const NIGHT_SKYLIGHT = C("#3a4c78");

function makeSky(fogColor: THREE.Color) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const m = sky.material as THREE.ShaderMaterial;
  m.uniforms.uHorizon = { value: fogColor };
  m.uniforms.uOvercast = { value: 0 };
  m.uniforms.uOvercastColor = { value: new THREE.Color() };
  // Blend the horizon into the fog colour so distant mountains never show a seam, and grey
  // the whole dome out under heavy cloud.
  m.fragmentShader = m.fragmentShader
    .replace("void main() {", "uniform vec3 uHorizon; uniform float uOvercast; uniform vec3 uOvercastColor;\nvoid main() {")
    .replace(
      "gl_FragColor = vec4( texColor, 1.0 );",
      `texColor = min(texColor, vec3(1.8));
      float hz = 1.0 - smoothstep(-0.02, 0.2, direction.y);
      texColor = mix(texColor, uHorizon, hz * 0.9);
      texColor = mix(texColor, uOvercastColor, uOvercast);
      gl_FragColor = vec4( texColor, 1.0 );`,
    );
  return sky;
}

export default function Atmosphere() {
  const { scene, camera, gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null!);
  const moon = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const stars = useRef<THREE.Points>(null!);
  const moonDisc = useRef<THREE.Mesh>(null!);
  const mix = useRef<Mix>({ ...TARGET["Clear & sunny"] });
  const hour = useRef(useGame.getState().hour);
  const flash = useRef(0);
  const nextBolt = useRef(0);
  const lastPush = useRef(0);
  const shadowKey = useRef({ c: new THREE.Vector3(1e9, 0, 0), dir: new THREE.Vector3(), frame: 0 });
  const lastEnv = useRef({ at: -10, dir: new THREE.Vector3(), cloud: -1 });

  const fogColor = useMemo(() => new THREE.Color("#b4c7d8"), []);
  const sky = useMemo(() => makeSky(fogColor), [fogColor]);
  const env = useMemo(() => {
    const s = new THREE.Scene();
    const mirror = new THREE.Mesh(sky.geometry, sky.material);
    mirror.scale.setScalar(900);
    s.add(mirror);
    return { scene: s, pmrem: new THREE.PMREMGenerator(gl), rt: null as THREE.WebGLRenderTarget | null };
  }, [gl, sky]);
  const v = useMemo(() => ({ sunDir: new THREE.Vector3(), light: new THREE.Vector3(), moonDir: new THREE.Vector3(), Y: new THREE.Vector3(0, 1, 0) }), []);

  useEffect(() => {
    scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.002);
    scene.add(sun.current.target);
    // Shadows are re-rendered only when the light or the player moves (see useFrame).
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    // Compile every local-light combination while the start screen is up: once all assets have
    // streamed in (or after 8 s at the latest), and again on entering in case anything arrived late.
    let warmed = false;
    const warmNow = () => {
      warmed = true;
      void warmLightVariants(gl, scene, camera);
    };
    const prevOnLoad = THREE.DefaultLoadingManager.onLoad;
    THREE.DefaultLoadingManager.onLoad = () => {
      prevOnLoad?.();
      setTimeout(warmNow, 500);
    };
    const warm = setTimeout(() => !warmed && warmNow(), 8000);
    const unsub = useGame.subscribe((st, prev) => {
      if (st.started && !prev.started) warmNow();
    });
    return () => {
      scene.fog = null;
      scene.environment = null;
      env.rt?.dispose();
      gl.shadowMap.autoUpdate = true;
      clearTimeout(warm);
      unsub();
      THREE.DefaultLoadingManager.onLoad = prevOnLoad;
    };
  }, [scene, fogColor, env, gl, camera]);

  useFrame(({ clock }, dt) => {
    dt = Math.min(dt, 0.1);
    const g = useGame.getState();
    ENV.uTime.value = clock.elapsedTime;
    ENV.uCam.value.copy(camera.position);
    syncLightVisibility();

    // Time of day eases toward the target: a few seconds for a full transition.
    const diff = g.targetHour - hour.current;
    if (Math.abs(diff) > 0.001) hour.current += Math.sign(diff) * Math.min(Math.abs(diff), dt * Math.max(0.9, Math.abs(diff) * 0.9));
    else hour.current += dt * 0.004;
    const h = ((hour.current % 24) + 24) % 24;

    const target = TARGET[g.weather];
    const m = mix.current;
    (Object.keys(m) as (keyof Mix)[]).forEach((k) => (m[k] += (target[k] - m[k]) * Math.min(1, dt * 0.6)));
    ENV.uSnow.value += (target.snow - ENV.uSnow.value) * Math.min(1, dt * 0.15);
    ENV.uWet.value += ((m.rain > 0.2 ? 1 : 0) - ENV.uWet.value) * Math.min(1, dt * (m.rain > 0.2 ? 0.12 : 0.03));
    ENV.uWind.value = 0.35 + m.rain * 0.45 + m.storm * 1.3 + m.snow * 0.2;

    // Sun path: rises at 6, peaks at 12:30, sets around 18:45.
    const a = ((h - 6) / 13) * Math.PI;
    const elev = Math.sin(a);
    v.sunDir.set(Math.cos(a) * 0.82, elev, -0.55).normalize();
    const day = THREE.MathUtils.clamp(elev * 3.2 + 0.12, 0, 1);
    const golden = THREE.MathUtils.clamp(1 - Math.abs(elev - 0.1) * 5, 0, 1) * day;
    ENV.uDay.value = day;

    // Lightning: brief, bright flashes at random intervals during a storm.
    const now = performance.now();
    if (m.storm > 0.6 && now > nextBolt.current) {
      nextBolt.current = now + 3500 + Math.random() * 7000;
      flash.current = 1;
      sfx.thunder();
    }
    flash.current = Math.max(0, flash.current - dt * 4.5);
    const bolt = flash.current > 0.5 ? flash.current : flash.current * 0.4;

    // Sky
    const u = (sky.material as THREE.ShaderMaterial).uniforms;
    u.sunPosition.value.copy(v.sunDir);
    u.turbidity.value = 2.5 + m.cloud * 6 + m.fog * 4;
    u.rayleigh.value = 1.1 + golden * 1.2 + m.cloud * 0.8;
    u.mieCoefficient.value = 0.004 + m.fog * 0.01;
    u.mieDirectionalG.value = 0.82;
    u.time.value = clock.elapsedTime;
    u.cloudSpeed.value = 0.00002 + ENV.uWind.value * 0.00003;
    u.cloudCoverage.value = 0.32 + m.cloud * 0.6;
    u.cloudDensity.value = 0.45 + m.cloud * 0.5;
    const over = Math.min(1, m.cloud * 0.85 + m.fog * 0.4);
    u.uOvercast.value = Math.max(0, over - 0.35) / 0.65 * 0.95;
    u.uOvercastColor.value.copy(OVERCAST_NIGHT).lerp(OVERCAST, day).lerp(FLASH, bolt * 0.7);

    // Fog and horizon share one colour.
    fogColor.copy(HORIZON_NIGHT).lerp(HORIZON_DAY, day).lerp(HORIZON_GOLD, golden * 0.6 * (1 - m.cloud));
    fogColor.lerp(OVERCAST, over * 0.75 * day).lerp(FOG_GREY, m.fog * 0.6 * day);
    if (bolt > 0.05) fogColor.lerp(FLASH, bolt * 0.5);
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(fogColor);
      fog.density = 0.0019 + m.fog * 0.03 + m.rain * 0.006 + m.snow * 0.009 + m.cloud * 0.0015 + (1 - day) * 0.002;
    }
    scene.background = fogColor;

    // Sun: follows the player so there are crisp shadows wherever they walk, snapped to
    // shadow-map texels so edges don't shimmer.
    // The shadow map covers ±70 m around a centre that only moves when the player has walked
    // ~6 m or the sun has shifted, so it is re-rendered a few times a minute instead of every frame.
    v.light.copy(v.sunDir);
    v.light.y = Math.max(0.14, v.light.y);
    v.light.normalize();
    const sk = shadowKey.current;
    sk.frame++;
    const p = camera.position;
    if (sk.c.distanceTo(p) > 6 || v.light.angleTo(sk.dir) > 0.004 || sk.frame > 240) {
      sk.c.copy(p);
      sk.dir.copy(v.light);
      sk.frame = 0;
      sun.current.position.copy(p).addScaledVector(v.light, 200);
      sun.current.target.position.copy(p);
      sun.current.target.updateMatrixWorld();
      gl.shadowMap.needsUpdate = true;
    }
    sun.current.intensity = day * (3.4 - m.cloud * 2.7 - m.fog * 0.6);
    sun.current.color.setHSL(0.09 - golden * 0.035, 0.45 + golden * 0.5, 0.78 - golden * 0.14);
    moon.current.intensity = (1 - day) * 0.75 * (1 - m.cloud * 0.6);
    v.moonDir.set(-v.sunDir.x, Math.max(0.2, -v.sunDir.y), -v.sunDir.z).normalize();
    moon.current.position.copy(v.moonDir);
    sunState.dir.copy(day > 0.05 ? v.sunDir : v.moonDir);
    sunState.color.copy(day > 0.05 ? sun.current.color : moon.current.color);
    sunState.strength = day > 0.05 ? Math.max(0.05, 1 - m.cloud * 0.9) : 0.25 * (1 - m.cloud);

    hemi.current.intensity = 0.3 * (1 - day) + day * (0.28 - m.cloud * 0.08) + bolt * 3;
    hemi.current.color.copy(fogColor).lerp(NIGHT_SKYLIGHT, 1 - day);

    // Image-based lighting from the same sky, refreshed when the sun or clouds move.
    const envDirty = v.sunDir.angleTo(lastEnv.current.dir) > 0.015 || Math.abs(m.cloud - lastEnv.current.cloud) > 0.04;
    if (envDirty && clock.elapsedTime - lastEnv.current.at > 0.4) {
      lastEnv.current = { at: clock.elapsedTime, dir: v.sunDir.clone(), cloud: m.cloud };
      env.rt?.dispose();
      env.rt = env.pmrem.fromScene(env.scene, 0, 1, 2000);
      scene.environment = env.rt.texture;
    }
    scene.environmentIntensity = (0.12 + day * 0.85) * (1 - over * 0.25) + bolt * 1.5;

    // Moon, stars and clouds
    moonDisc.current.position.copy(v.moonDir).multiplyScalar(1000).add(camera.position);
    (moonDisc.current.material as THREE.MeshBasicMaterial).opacity = (1 - day) * (1 - m.cloud * 0.9);
    moonDisc.current.visible = day < 0.6;
    stars.current.visible = day < 0.45 && m.cloud < 0.85;

    // React-free cadence for the HUD clock and ambience.
    if (now - lastPush.current > 200) {
      lastPush.current = now;
      useGame.setState({ hour: hour.current });
      const fire = g.campfire ? Math.max(0, 1 - Math.hypot(camera.position.x - CAMPFIRE.x, camera.position.z - CAMPFIRE.z) / 22) : 0;
      setAmbience(m.rain, 0.25 + m.storm * 0.6 + m.snow * 0.4 + m.fog * 0.1, fire);
    }
  });

  return (
    <>
      <primitive object={sky} />
      <Stars ref={stars} radius={900} depth={80} count={4000} factor={14} saturation={0} fade speed={0.3} />
      <mesh ref={moonDisc}>
        <sphereGeometry args={[22, 24, 16]} />
        <meshBasicMaterial color={new THREE.Color(3.2, 3.1, 2.8)} transparent fog={false} toneMapped={false} />
      </mesh>
      <directionalLight
        ref={sun}
        castShadow={!(typeof window !== "undefined" && window.location.search.includes("noshadow"))}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={420}
        shadow-bias={-0.0002}
        shadow-normalBias={0.035}
      />
      <directionalLight ref={moon} color="#8ea6e8" />
      <hemisphereLight ref={hemi} groundColor="#2b2416" />
      <Precipitation mix={mix} flash={flash} />
    </>
  );
}
