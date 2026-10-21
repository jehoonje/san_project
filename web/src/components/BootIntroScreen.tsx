"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import WaterRippleSpinner from "./WaterRippleSpinner";

export interface BootIntroScreenProps {
  /** 인트로 종료 시점(COMPLETE_AT)에 1회 호출 */
  onComplete: () => void;
}

interface BootUniforms {
  [key: string]: { value: number };
  uProgress: { value: number };
  uMorph: { value: number };
  uBlur: { value: number };
  uScatter: { value: number };
  uDrift: { value: number };
  uTime: { value: number };
  uSize: { value: number };
  uPixelRatio: { value: number };
  uTextWidth: { value: number };
}

/* ------------------------------ constants ------------------------------ */

const TEXT = "TIMSHEL";
const FONT_STACK = '"Cinzel", "Playfair Display", Georgia, serif';
const GOLD = "#D4AF37";
const SILVER = "#FFFFFF";
const CAMERA_Z = 7;
const CAMERA_FOV = 50;
const MAX_DPR = 1.5;

/** 타임라인 (초). 글자가 선명해진 뒤 hold 만큼 유지 */
const T = {
  spinnerEnd: 2.0,
  vortexStart: 2.0,
  vortexDuration: 2.4,
  morphStart: 3.9,
  morphDuration: 1.5, // 3.9 ~ 5.4 (power4.out)
  blurStart: 4.1,
  blurDuration: 1.4,
  driftStart: 4.6,
  hold: 2.0,
  scatterDuration: 1.8, // 발광하며 가로 띠로 퍼지는 시간
  fadeDuration: 0.7,
} as const;
const TEXT_VISIBLE_AT = T.morphStart + T.morphDuration; // 5.4
const SCATTER_START = TEXT_VISIBLE_AT + T.hold; // 7.4
const COMPLETE_AT = SCATTER_START + T.scatterDuration; // 9.2

/** 입자 수 (저사양 4코어 이하: 7,000 / 그 외: 11,000) */
function getParticleCount(): number {
  if (typeof navigator === "undefined") return 7000;
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 4 ? 7000 : 11000;
}

/* -------------------------------- GLSL --------------------------------- */

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aTargetPosition;
  attribute vec3 aColor;
  attribute vec3 aRand;
  attribute float aSeed;

  uniform float uProgress;
  uniform float uMorph;
  uniform float uBlur;
  uniform float uScatter;
  uniform float uDrift;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTextWidth;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float r0 = length(p.xy);
    float a0 = atan(p.y, p.x);

    // --- Phase 2: 흩어진 금/은 나선 (회전량 감소) ---
    float k = pow(clamp(uProgress, 0.0, 1.0), 1.4);
    float radius = r0 * mix(1.0, 0.55 + 0.3 * aSeed, k);
    float spin = uTime * 0.02 + k * (0.6 + 1.1 / (0.3 + r0));
    float ang = a0 + spin;
    vec3 vortex = vec3(cos(ang) * radius, sin(ang) * radius, p.z * (1.0 - 0.5 * k));

    // --- Phase 3: 글자로 모핑 (uMorph: power4.out) + 흐릿함(uBlur) -> 선명 ---
    float m = clamp(uMorph * 1.3 - aSeed * 0.3, 0.0, 1.0);
    vec3 target = vec3(aTargetPosition.xy * uTextWidth, aTargetPosition.z);
    target.xy += aRand.xy * uBlur * 0.45;
    target.z += aRand.z * uBlur * 0.6;

    vec3 pos = mix(vortex, target, m);

    vec2 dir = target.xy - vortex.xy;
    vec2 perp = normalize(vec2(-dir.y, dir.x) + 1e-5);
    float arc = sin(m * 3.14159265) * (1.0 - m);
    pos.xy += perp * arc * (aSeed - 0.5) * 2.0;

    // 안착 후 느리고 미세한 유기적 노이즈
    vec3 drift = vec3(
      sin(uTime * 0.45 + aSeed * 40.0 + target.y * 3.0),
      cos(uTime * 0.4 + aSeed * 55.0 + target.x * 3.0),
      sin(uTime * 0.35 + aSeed * 23.0)
    ) * 0.016 * uDrift * m;
    pos += drift;

    // --- Phase 4: 발광하며 가로 띠로 흩어짐 ---
    float s = uScatter;
    float glow = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.7, 1.0, s));
    vec2 outward = normalize(pos.xy + aRand.xy * 0.2 + 1e-4);
    pos.x += (outward.x * (0.8 + abs(aRand.x) * 3.0) + aRand.x * 1.8) * s;
    pos.y += (outward.y * 0.35 + aRand.y * 0.45) * s;
    pos.z += aRand.z * 2.0 * s;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float sizeVar = 0.5 + aSeed * aSeed * 1.0;
    float sizeMul = mix(1.0, 0.8, m) * (1.0 + uBlur * 0.5) * (1.0 + 2.2 * glow);
    gl_PointSize = clamp(uSize * uPixelRatio * (7.0 / -mv.z) * sizeVar * sizeMul, 1.0, 16.0 * uPixelRatio);

    float twinkle = 0.6 + 0.4 * sin(uTime * (0.8 + aSeed * 1.6) + aSeed * 60.0);
    float whiten = max(m * 0.85, smoothstep(0.0, 0.3, s));
    vColor = mix(aColor, vec3(1.0), whiten);
    float fade = 1.0 - smoothstep(0.7, 1.0, s);
    vAlpha = mix(0.6, 0.95, m) * mix(twinkle, 1.0, m * 0.6) * mix(1.0, 0.75, uBlur)
             * (1.0 + 1.5 * glow) * fade;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float f = 1.0 - d * 2.0;
    float core = pow(f, 6.0) * 0.6;
    gl_FragColor = vec4(vColor, (f * f + core) * vAlpha);
  }
`;

/* ------------------------------- helpers ------------------------------- */

function createUniforms(): BootUniforms {
  return {
    uProgress: { value: 0 },
    uMorph: { value: 0 },
    uBlur: { value: 1 },
    uScatter: { value: 0 },
    uDrift: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: 3.2 },
    uPixelRatio: { value: 1 },
    uTextWidth: { value: 5 },
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

/** 오프스크린 2D 캔버스에서 "TIMSHEL" 픽셀 샘플링 (가로폭 1로 정규화, 중심 0,0) */
function sampleTextPoints(): Float32Array {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return new Float32Array(0);
  }
  const W = 1000;
  const H = 320;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Float32Array(0);

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineJoin = "round";
  ctx.lineWidth = 7;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 190px ${FONT_STACK}`;
  ctx.fillText(TEXT, W / 2, H / 2);
  ctx.strokeText(TEXT, W / 2, H / 2);

  const { data } = ctx.getImageData(0, 0, W, H);
  const step = 3;
  const xs: number[] = [];
  const ys: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] > 128) {
        xs.push(x);
        ys.push(y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (xs.length === 0) return new Float32Array(0);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = Math.max(1, maxX - minX);
  const out = new Float32Array(xs.length * 2);
  for (let i = 0; i < xs.length; i++) {
    out[i * 2] = (xs[i] - cx) / w;
    out[i * 2 + 1] = -(ys[i] - cy) / w;
  }
  return out;
}

function buildGeometry(textPoints: Float32Array): THREE.BufferGeometry {
  const count = getParticleCount();
  const positions = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const rands = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  const gold = hexToRgb(GOLD);
  const silver = hexToRgb(SILVER);
  const textCount = textPoints.length / 2;
  const pixelJitter = 0.005;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const isGold = i % 2 === 0;

    // 금/은 두 팔의 로그 나선 + 넓은 가우시안 산포로 흩어진 느낌
    const t = Math.pow(Math.random(), 0.85);
    const theta = t * Math.PI * 4;
    const r = 0.25 * Math.exp(0.2 * theta);
    const arm = isGold ? 0 : Math.PI;
    const scatter = gauss() * (0.25 + r * 0.42);
    const ang = theta + arm + gauss() * 0.34;
    positions[i3] = Math.cos(ang) * (r + scatter);
    positions[i3 + 1] = Math.sin(ang) * (r + scatter);
    positions[i3 + 2] = gauss() * 1.1;

    const c = isGold ? gold : silver;
    colors[i3] = c[0];
    colors[i3 + 1] = c[1];
    colors[i3 + 2] = c[2];

    if (textCount > 0) {
      const idx = Math.floor(Math.random() * textCount);
      targets[i3] = textPoints[idx * 2] + (Math.random() - 0.5) * pixelJitter;
      targets[i3 + 1] = textPoints[idx * 2 + 1] + (Math.random() - 0.5) * pixelJitter;
    }
    targets[i3 + 2] = (Math.random() - 0.5) * 0.04;

    rands[i3] = gauss();
    rands[i3 + 1] = gauss();
    rands[i3 + 2] = gauss();
    seeds[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aTargetPosition", new THREE.BufferAttribute(targets, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aRand", new THREE.BufferAttribute(rands, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  return geometry;
}

/* ------------------------------ component ------------------------------ */

export default function BootIntroScreen({ onComplete }: BootIntroScreenProps) {
  const [uniforms] = useState<BootUniforms>(createUniforms);

  const spinnerWrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const startLoopRef = useRef<(() => void) | null>(null);
  const loopRequestedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  /* ---- 마스터 타임라인 ---- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    uniforms.uProgress.value = 0;
    uniforms.uMorph.value = 0;
    uniforms.uBlur.value = 1;
    uniforms.uScatter.value = 0;
    uniforms.uDrift.value = 0;
    loopRequestedRef.current = false;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onCompleteRef.current();
    };

    const host = hostRef.current;
    if (host) gsap.set(host, { opacity: 0 });

    const tl = gsap.timeline();

    // Phase 1: 0.0 ~ 2.0s — 물결 스피너 (뒤에서 WebGL 사전 준비)

    // Phase 2: 나선 소용돌이 (등장과 동시에 이동 시작)
    tl.call(
      () => {
        loopRequestedRef.current = true;
        startLoopRef.current?.();
      },
      undefined,
      T.vortexStart
    );
    tl.to(host, { opacity: 1, duration: 0.6, ease: "power1.out" }, T.vortexStart);
    tl.to(
      spinnerWrapRef.current,
      { opacity: 0, scale: 0.92, duration: 0.5, ease: "power2.in" },
      T.spinnerEnd
    );
    tl.to(
      uniforms.uProgress,
      { value: 1, duration: T.vortexDuration + 0.6, ease: "power1.out" },
      T.vortexStart
    );

    // Phase 3: TIMSHEL 모핑(power4.out) + 흐림 -> 선명
    tl.to(uniforms.uMorph, { value: 1, duration: T.morphDuration, ease: "power4.out" }, T.morphStart);
    tl.to(uniforms.uBlur, { value: 0, duration: T.blurDuration, ease: "power2.out" }, T.blurStart);
    tl.to(uniforms.uDrift, { value: 1, duration: 1.0, ease: "sine.inOut" }, T.driftStart);

    // Phase 4: hold 후 발광하며 가로 띠로 흩어짐
    tl.to(uniforms.uScatter, { value: 1, duration: T.scatterDuration, ease: "power1.inOut" }, SCATTER_START);
    tl.to(
      host,
      { opacity: 0, duration: T.fadeDuration, ease: "power1.in" },
      COMPLETE_AT - T.fadeDuration
    );
    tl.call(finish, undefined, COMPLETE_AT);

    return () => {
      tl.kill();
    };
  }, [uniforms]);

  /* ---- Three.js: 마운트 직후 단계적으로 사전 준비, vortexStart에 루프만 시작 ---- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;
    let running = false;
    let timer = 0;
    let teardown: (() => void) | null = null;

    const prepare = async () => {
      await new Promise<void>((r) => {
        timer = window.setTimeout(r, 250);
      });
      if (disposed) return;

      try {
        await Promise.race([
          document.fonts.load(`700 190px ${FONT_STACK}`, TEXT),
          new Promise((r) => setTimeout(r, 300)),
        ]);
      } catch {
        /* serif 폴백 */
      }
      if (disposed) return;

      const geometry = buildGeometry(sampleTextPoints());
      await new Promise<void>((r) => {
        timer = window.setTimeout(r, 0);
      });
      if (disposed) {
        geometry.dispose();
        return;
      }

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        });
      } catch {
        geometry.dispose();
        return; // WebGL 불가: 타임라인만 진행
      }

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.className = "block h-full w-full";
      host.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50);
      camera.position.set(0, 0, CAMERA_Z);

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      scene.add(points);

      const resize = () => {
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const visibleW =
          2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * CAMERA_Z * camera.aspect;
        uniforms.uTextWidth.value = Math.min(visibleW * 0.8, 6.5);
        uniforms.uPixelRatio.value = dpr;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      teardown = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        scene.remove(points);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        if (canvas.parentNode === host) host.removeChild(canvas);
      };

      // 셰이더 컴파일을 비동기로 처리해 메인 스레드 차단을 줄임
      try {
        await renderer.compileAsync(scene, camera);
      } catch {
        renderer.compile(scene, camera);
      }
      if (disposed) {
        teardown();
        teardown = null;
        return;
      }
      renderer.render(scene, camera); // 버퍼 업로드 웜업 (host는 opacity 0)

      const clock = new THREE.Clock();
      const loop = () => {
        uniforms.uTime.value = clock.getElapsedTime();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };

      startLoopRef.current = () => {
        if (running || disposed) return;
        running = true;
        clock.start();
        loop();
      };
      if (loopRequestedRef.current) startLoopRef.current();
    };

    void prepare();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      startLoopRef.current = null;
      teardown?.();
    };
  }, [uniforms]);

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden bg-black"
      role="presentation"
      aria-hidden
    >
      <div ref={hostRef} className="absolute inset-0 will-change-[opacity]" />

      <div
        ref={spinnerWrapRef}
        className="absolute inset-0 flex items-center justify-center will-change-transform"
      >
        <WaterRippleSpinner size={96} color="white" />
      </div>
    </div>
  );
}