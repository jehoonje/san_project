"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import WaterRippleSpinner from "./WaterRippleSpinner";
import { sampleAvatarPoints, type AvatarScreenRect } from "@/lib/avatar3d";
import { currentTheme, hexToRgb01, readToken } from "@/lib/themeTokens";

export type BootMode = "full" | "quick";

export interface BootIntroScreenProps {
  /** 리빌 애니메이션이 모두 끝났을 때 1회 호출 */
  onComplete: () => void;
  /** 지도 위 실제 아바타의 화면 좌표 (없으면 화면 중앙 45% 지점 폴백) */
  getAvatarRect?: () => AvatarScreenRect | null;
  /** 지도·아바타 준비 완료 여부. true가 될 때까지 완성된 아바타 모양에서 대기 */
  mapReady?: boolean;
  /** full: 최초 1회용 긴 버전(약 8초) / quick: 이후 실행용 짧은 버전(약 3초) */
  mode?: BootMode;
}

type BootUniforms = {
  uIntro: { value: number };
  uMorph: { value: number };
  uBlur: { value: number };
  uDrift: { value: number };
  uFade: { value: number };
  uTilt: { value: number };
  uTime: { value: number };
  uSize: { value: number };
  uPixelRatio: { value: number };
  uRing: { value: number };
  uBurstScale: { value: number };
  uTargetPos: { value: THREE.Vector2 };
  uTargetScale: { value: number };
  /** 입자 색 (테마 토큰): 응축된 형태 / 번지는 원반 */
  uInk: { value: THREE.Vector3 };
  uInkSoft: { value: THREE.Vector3 };
  /** 1 = 먹(가산 혼합, 빛나는 골드) / 0 = 종이(일반 혼합, 잉크 점) */
  uGlow: { value: number };
};

/* ------------------------------ constants ------------------------------ */

const CAMERA_Z = 7;
const CAMERA_FOV = 50;
const MAX_DPR = 1.25;
const REF_HALF_H = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * CAMERA_Z;
/** 파티클 준비가 이 시간(초)보다 늦어지면 기다리지 않고 진행 */
const GPU_READY_TIMEOUT = 3;

/** 타임라인 (초) */
type Timings = {
  spinnerEnd: number;
  ringStart: number;
  ringDuration: number;
  morphStart: number;
  morphDuration: number;
  blurStart: number;
  blurDuration: number;
  tiltStart: number;
  tiltDuration: number;
  hold: number;
  fadeDuration: number;
  bgFadeDuration: number;
  hostFadeDuration: number;
  maxMapWait: number;
};

const TIMINGS: Record<BootMode, Timings> = {
  full: {
    spinnerEnd: 1.6,
    ringStart: 1.4,
    ringDuration: 1.8,
    morphStart: 3.6,
    morphDuration: 1.9,
    blurStart: 3.8,
    blurDuration: 1.5,
    tiltStart: 3.2,
    tiltDuration: 2.2,
    hold: 1.6,
    fadeDuration: 0.9,
    bgFadeDuration: 1.1,
    hostFadeDuration: 0.5,
    maxMapWait: 4,
  },
  quick: {
    spinnerEnd: 0.5,
    ringStart: 0.3,
    ringDuration: 0.8,
    morphStart: 0.9,
    morphDuration: 1.1,
    blurStart: 1.0,
    blurDuration: 0.7,
    tiltStart: 0.6,
    tiltDuration: 1.0,
    hold: 0.25,
    fadeDuration: 0.6,
    bgFadeDuration: 0.7,
    hostFadeDuration: 0.3,
    maxMapWait: 3,
  },
};

function isPortraitViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerHeight > window.innerWidth;
}

function getParticleCount(): number {
  if (typeof navigator === "undefined") return 12000;
  if (isPortraitViewport() || window.innerWidth < 768) return 16000;
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 4 ? 12000 : 22000;
}

/* -------------------------------- GLSL --------------------------------- */

const VERTEX_SHADER = /* glsl */ `
attribute vec3 aTarget;
attribute vec3 aRand;
attribute float aSeed;

uniform float uIntro;
uniform float uMorph;
uniform float uBlur;
uniform float uDrift;
uniform float uFade;
uniform float uTilt;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uRing;
uniform float uBurstScale;
uniform vec2 uTargetPos;
uniform float uTargetScale;
uniform vec3 uInk;
uniform vec3 uInkSoft;
uniform float uGlow;

varying vec3 vColor;
varying float vAlpha;

void main() {
  // position.x = 반지름 비율, position.y = 초기 각도, position.z = 두께
  float radial = position.x;
  float a0 = position.y;
  float h = position.z;

  // ---- Phase 1: 기울어진 강착원반 (안쪽일수록 빠르게 회전) ----
  float omega = 0.5 / (0.35 + radial);
  float ang = a0 + uTime * omega * 0.6 + (1.0 - uIntro) * 2.2;
  float wob = 1.0 + 0.06 * sin(ang * 3.0 + uTime * 0.8 + aSeed * 6.2831);
  float R = radial * uRing * wob * mix(0.2, 1.0, uIntro);
  vec3 d = vec3(cos(ang) * R, sin(ang) * R, h * uRing * 0.5);
  float ct = cos(uTilt);
  float st = sin(uTilt);
  d = vec3(d.x, d.y * ct - d.z * st, d.y * st + d.z * ct);

  // ---- Phase 2: 아바타 모양으로 응축 ----
  vec3 tg = vec3(aTarget.xy * uTargetScale + uTargetPos, aTarget.z * uTargetScale);
  tg += aRand * uBlur * 0.5 * uBurstScale;

  float m = clamp(uMorph * 1.5 - aSeed * 0.5, 0.0, 1.0);
  float em = m * m * (3.0 - 2.0 * m);

  vec3 pos = mix(d, tg, em);
  vec2 dir = tg.xy - d.xy;
  vec2 perp = normalize(vec2(-dir.y, dir.x) + 1e-5);
  float arc = sin(em * 3.14159265) * (aSeed - 0.5) * 2.0;
  pos.xy += perp * arc * uBurstScale * 1.2;
  pos.z += sin(em * 3.14159265) * aRand.z * 0.8;

  // ---- Phase 3: 숨쉬는 일렁임 ----
  pos += vec3(
    sin(uTime * 0.6 + aSeed * 40.0 + tg.y * 3.0),
    cos(uTime * 0.5 + aSeed * 55.0 + tg.x * 3.0),
    sin(uTime * 0.4 + aSeed * 23.0)
  ) * 0.014 * uDrift * em;

  // ---- Phase 4: 리빌 - 살짝 떠오르며 흩어져 사라짐 ----
  pos.x += aRand.x * uFade * 0.12 * uTargetScale;
  pos.y += uFade * (0.08 + aSeed * 0.22) * uTargetScale;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dz = max(-mv.z, 0.5);

  // 블룸 느낌의 대형 플레어 입자
  float flare = step(0.965, aSeed);

  float sizeVar = 0.45 + aSeed * aSeed;
  float sizeMul = mix(1.0, 0.6, em) * (1.0 + uBlur * 0.5)
    * (1.0 + 2.0 * flare * (1.0 - em));
  gl_PointSize = clamp(
    uSize * uPixelRatio * (7.0 / dz) * sizeVar * sizeMul,
    1.0, 9.0 * uPixelRatio
  );

  // ---- 색상: 테마 팔레트 (종이 = 잉크, 먹 = 골드) ----
  // 원반은 한 톤 옅게 번지고, 아바타로 응축될수록 또렷한 본색이 된다.
  vec3 discCol = mix(uInkSoft, uInk, smoothstep(0.4, 1.2, radial));
  vec3 shapeCol = mix(uInk, uInkSoft, aSeed * 0.35 * uGlow);

  vColor = mix(discCol, shapeCol, em);

  float twinkle = 0.6 + 0.4 * sin(uTime * (0.8 + aSeed * 1.6) + aSeed * 60.0);
  float discA = mix(0.35, 0.9, 1.0 - smoothstep(0.3, 1.1, radial));
  vAlpha = mix(discA, mix(0.72, 0.95, uGlow), em)
    * mix(twinkle, 1.0, em * 0.6)
    * smoothstep(0.0, 0.4, uIntro)
    * mix(1.0, 0.75, uBlur)
    * (1.0 - 0.6 * flare)
    * (1.0 - uFade);
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
    uIntro: { value: 0 },
    uMorph: { value: 0 },
    uBlur: { value: 1 },
    uDrift: { value: 0 },
    uFade: { value: 0 },
    uTilt: { value: 1.05 },
    uTime: { value: 0 },
    uSize: { value: 3.4 },
    uPixelRatio: { value: 1 },
    uRing: { value: 3 },
    uBurstScale: { value: 1 },
    uTargetPos: { value: new THREE.Vector2(0, 0) },
    uTargetScale: { value: 1 },
    uInk: { value: new THREE.Vector3(0.42, 0.42, 0.31) },
    uInkSoft: { value: new THREE.Vector3(0.66, 0.65, 0.54) },
    uGlow: { value: 0 },
  };
}

function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

function buildGeometry(avatarPoints: Float32Array): THREE.BufferGeometry {
  const count = avatarPoints.length / 3;
  const positions = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const rands = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  const jitter = 0.002;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const isRing = Math.random() < 0.78;

    // 링 78% + 바깥 헤일로 22%
    const radial = isRing
      ? Math.max(0.05, 0.62 + gauss() * 0.11)
      : 0.25 + Math.random() * 1.1;
    positions[i3] = radial;
    positions[i3 + 1] = Math.random() * Math.PI * 2;
    positions[i3 + 2] = gauss() * (isRing ? 0.07 : 0.2);

    targets[i3] = avatarPoints[i3] + (Math.random() - 0.5) * jitter;
    targets[i3 + 1] = avatarPoints[i3 + 1] + (Math.random() - 0.5) * jitter;
    targets[i3 + 2] = avatarPoints[i3 + 2];

    rands[i3] = gauss();
    rands[i3 + 1] = gauss();
    rands[i3 + 2] = gauss();
    seeds[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
  geometry.setAttribute("aRand", new THREE.BufferAttribute(rands, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  return geometry;
}

/* ------------------------------ component ------------------------------ */

export default function BootIntroScreen({
  onComplete,
  getAvatarRect,
  mapReady = true,
  mode = "full",
}: BootIntroScreenProps) {
  const [uniforms] = useState(createUniforms);

  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const spinnerWrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const getRectRef = useRef(getAvatarRect);
  const mapReadyRef = useRef(mapReady);
  const startLoopRef = useRef<(() => void) | null>(null);
  const loopRequestedRef = useRef(false);
  const gpuReadyRef = useRef(false);
  const resumeRef = useRef<(() => void) | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    getRectRef.current = getAvatarRect;
  }, [getAvatarRect]);
  useEffect(() => {
    mapReadyRef.current = mapReady;
  }, [mapReady]);

  /* ---- 마스터 타임라인 ---- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const T = TIMINGS[mode];
    const SHAPE_VISIBLE_AT = T.morphStart + T.morphDuration;
    const REVEAL_AT = SHAPE_VISIBLE_AT + T.hold;

    uniforms.uIntro.value = 0;
    uniforms.uMorph.value = 0;
    uniforms.uBlur.value = 1;
    uniforms.uDrift.value = 0;
    uniforms.uFade.value = 0;
    uniforms.uTilt.value = 1.05;
    loopRequestedRef.current = false;
    gpuReadyRef.current = false;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onCompleteRef.current();
    };

    const root = rootRef.current;
    const bg = bgRef.current;
    const host = hostRef.current;

    if (host) gsap.set(host, { opacity: 0, scale: 1.06 });
    if (bg) gsap.set(bg, { opacity: 1 });

    const tl = gsap.timeline();

    let gpuTimeout: gsap.core.Tween | null = null;
    const resume = () => {
      gpuTimeout?.kill();
      gpuTimeout = null;
      if (tl.paused()) tl.resume();
    };
    resumeRef.current = resume;

    tl.call(
      () => {
        loopRequestedRef.current = true;
        if (gpuReadyRef.current) {
          startLoopRef.current?.();
        } else {
          // 파티클이 준비될 때까지 스피너만 돌리고 타임라인을 멈춘다
          // (준비 후 uIntro/uTilt 등이 갑자기 점프하는 것을 방지)
          tl.pause();
          gpuTimeout = gsap.delayedCall(GPU_READY_TIMEOUT, resume);
        }
      },
      undefined,
      T.ringStart,
    );

    // 파티클 레이어 등장 + 느린 줌아웃 (REVEAL_AT 직전에 scale 1 도달)
    tl.to(host, { opacity: 1, duration: 0.8, ease: "power1.out" }, T.ringStart);
    tl.to(
      host,
      { scale: 1, duration: SHAPE_VISIBLE_AT - T.ringStart, ease: "power2.out" },
      T.ringStart,
    );

    // 스피너 퇴장
    tl.to(
      spinnerWrapRef.current,
      { opacity: 0, scale: 0.9, duration: 0.5, ease: "power2.in" },
      T.spinnerEnd,
    );

    // 링 등장 -> 평평해지며 아바타로 응축
    tl.to(uniforms.uIntro, { value: 1, duration: T.ringDuration, ease: "power3.out" }, T.ringStart);
    tl.to(uniforms.uTilt, { value: 0, duration: T.tiltDuration, ease: "power2.inOut" }, T.tiltStart);
    tl.to(uniforms.uMorph, { value: 1, duration: T.morphDuration, ease: "power3.inOut" }, T.morphStart);
    tl.to(uniforms.uBlur, { value: 0, duration: T.blurDuration, ease: "power2.out" }, T.blurStart);
    tl.to(
      uniforms.uDrift,
      { value: 1, duration: 1.0, ease: "sine.inOut" },
      Math.max(0, SHAPE_VISIBLE_AT - 0.6),
    );

    // ---- 리빌: 지도가 준비될 때까지 대기 -> 파티클 소멸 + 검은 배경 페이드아웃 ----
    let revealTl: gsap.core.Timeline | null = null;
    let waitCall: gsap.core.Tween | null = null;
    let waited = 0;

    const reveal = () => {
      if (done) return;
      if (root) root.style.pointerEvents = "none"; // 아래 지도가 바로 조작 가능
      revealTl = gsap.timeline({ onComplete: finish });
      revealTl.to(uniforms.uFade, { value: 1, duration: T.fadeDuration, ease: "power2.in" }, 0);
      revealTl.to(bg, { opacity: 0, duration: T.bgFadeDuration, ease: "power1.inOut" }, 0.1);
      revealTl.to(
        host,
        { opacity: 0, duration: T.hostFadeDuration, ease: "power1.in" },
        Math.max(0, T.fadeDuration - 0.2),
      );
    };

    const checkReady = () => {
      if (mapReadyRef.current) {
        // 첫 프레임에 아바타가 그려질 시간을 조금 준다
        waitCall = gsap.delayedCall(mode === "quick" ? 0.15 : 0.3, reveal);
        return;
      }
      if (waited >= T.maxMapWait) {
        reveal();
        return;
      }
      waited += 0.1;
      waitCall = gsap.delayedCall(0.1, checkReady);
    };

    tl.call(checkReady, undefined, REVEAL_AT);

    return () => {
      tl.kill();
      gpuTimeout?.kill();
      waitCall?.kill();
      revealTl?.kill();
      resumeRef.current = null;
    };
  }, [uniforms, mode]);

  /* ---- Three.js ---- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;
    let resizeRaf = 0;
    let running = false;
    let timer = 0;
    let teardown: (() => void) | null = null;

    /** 파티클 준비 완료(또는 실패) 신호: 멈춰 있던 타임라인을 재개 */
    const markReady = () => {
      gpuReadyRef.current = true;
      if (loopRequestedRef.current) startLoopRef.current?.();
      resumeRef.current?.();
    };

    const onPointer = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const prepare = async () => {
      await new Promise<void>((r) => {
        timer = window.setTimeout(r, mode === "quick" ? 0 : 200);
      });
      if (disposed) return;

      const geometry = buildGeometry(sampleAvatarPoints(getParticleCount()));
      const totalCount = geometry.getAttribute("position").count;
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
        markReady(); // 파티클 없이라도 지도로 넘어가게
        return;
      }

      let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.className = "block h-full w-full";
      host.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50);
      camera.position.set(0, 0, CAMERA_Z);

      // 새 팔레트: 종이 위에서는 잉크 점(일반 혼합), 먹 위에서는 골드 빛(가산 혼합)
      const dark = currentTheme() === "dark";
      uniforms.uInk.value.set(...hexToRgb01(readToken("--san-particle", "#2e3440")));
      uniforms.uInkSoft.value.set(
        ...hexToRgb01(readToken("--san-particle-soft", "#9aa0a8")),
      );
      uniforms.uGlow.value = dark ? 1 : 0;

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      scene.add(points);

      // 호스트 크기 캐시 (매 프레임 clientWidth/Height 읽기 → 강제 레이아웃 방지)
      let hw = 1;
      let hh = 1;

      /** 실제 아바타의 화면 좌표(px) -> 파티클 월드 좌표. snap=false면 부드럽게 따라감 */
      const applyTarget = (snap: boolean) => {
        const w = hw;
        const h = hh;
        const rect = getRectRef.current?.() ?? {
          x: w / 2,
          y: h * 0.45,
          height: Math.min(h * 0.16, 160),
        };
        const halfH = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * CAMERA_Z;
        const wpp = (halfH * 2) / h; // 월드 단위 / px (z=0 평면)
        const tx = (rect.x - w / 2) * wpp;
        const ty = -(rect.y - h / 2) * wpp;
        const ts = Math.max(0.01, rect.height * wpp);
        const k = snap ? 1 : 0.25;
        const pos = uniforms.uTargetPos.value;
        pos.x += (tx - pos.x) * k;
        pos.y += (ty - pos.y) * k;
        uniforms.uTargetScale.value += (ts - uniforms.uTargetScale.value) * k;
      };

      const applyResize = () => {
        hw = Math.max(1, host.clientWidth);
        hh = Math.max(1, host.clientHeight);
        const w = hw;
        const h = hh;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        const halfH = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * CAMERA_Z;
        const halfW = halfH * camera.aspect;
        const portrait = h > w;

        uniforms.uPixelRatio.value = dpr;
        uniforms.uRing.value = Math.min(halfW, halfH) * (portrait ? 1.25 : 1.15);
        uniforms.uBurstScale.value = Math.min(1, Math.min(halfW, halfH) / REF_HALF_H);
        uniforms.uSize.value = portrait || w < 768 ? 2.2 : 3.0;
        applyTarget(true);
      };
      applyResize();

      const ro = new ResizeObserver(() => {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          if (!disposed) applyResize();
        });
      });
      ro.observe(host);

      teardown = () => {
        cancelAnimationFrame(raf);
        cancelAnimationFrame(resizeRaf);
        ro.disconnect();
        scene.remove(points);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        if (canvas.parentNode === host) host.removeChild(canvas);
      };

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
      renderer.render(scene, camera);

      const clock = new THREE.Clock();

      // 적응형 품질: 캔버스 재할당 없이 입자 수만 줄인다 (재할당 자체가 끊김 유발)
      let frame = 0;
      let acc = 0;
      let samples = 0;
      let last = 0;
      let degraded = 0;
      const degrade = () => {
        degraded++;
        geometry.setDrawRange(0, Math.floor(totalCount * (degraded === 1 ? 0.6 : 0.4)));
      };

      const loop = (now: number) => {
        uniforms.uTime.value = clock.getElapsedTime();

        // 지도/아바타 위치가 바뀌면 목표를 부드럽게 따라감
        applyTarget(false);

        // 포인터 패럴랙스: 아바타로 응축될수록 0으로 수렴 (목표 좌표와 어긋나지 않게)
        const p = pointerRef.current;
        const k = 1 - uniforms.uMorph.value;
        camera.position.x += (p.x * 0.35 * k - camera.position.x) * 0.05;
        camera.position.y += (-p.y * 0.22 * k - camera.position.y) * 0.05;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);

        if (last && degraded < 2) {
          const dt = now - last;
          if (frame > 5 && dt < 200) {
            acc += dt;
            samples++;
          }
          frame++;
          // 약 25프레임(≈0.4초) 만에 1차 판단, 이후 70프레임에서 2차 판단
          if (frame === 25 || frame === 70) {
            const avg = acc / Math.max(1, samples);
            if (avg > 22) degrade();
            acc = 0;
            samples = 0;
          }
        }
        last = now;
        raf = requestAnimationFrame(loop);
      };

      startLoopRef.current = () => {
        if (running || disposed) return;
        running = true;
        clock.start();
        raf = requestAnimationFrame(loop);
      };

      // 준비 완료: 타임라인 재개 + (이미 요청됐다면) 루프 시작
      markReady();
    };

    void prepare();

    return () => {
      disposed = true;
      window.removeEventListener("pointermove", onPointer);
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      startLoopRef.current = null;
      teardown?.();
    };
  }, [uniforms, mode]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[9999] h-[100dvh] w-full overflow-hidden"
      role="presentation"
      aria-hidden
    >
      {/* 종이(먹) 배경: 리빌 때 페이드아웃되며 아래 지도를 드러냄 */}
      <div ref={bgRef} className="absolute inset-0 bg-san-bg" />

      {/* 파티클 */}
      <div ref={hostRef} className="absolute inset-0 will-change-[opacity,transform]" />

      {/* 스피너 */}
      <div
        ref={spinnerWrapRef}
        className="absolute inset-0 flex items-center justify-center will-change-transform"
      >
        <WaterRippleSpinner size={120} />
      </div>
    </div>
  );
}
