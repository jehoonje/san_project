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
  uIntro: { value: number };
  uMorph: { value: number };
  uBlur: { value: number };
  uDrift: { value: number };
  uFly: { value: number };
  uTilt: { value: number };
  uTime: { value: number };
  uSize: { value: number };
  uPixelRatio: { value: number };
  uTextWidth: { value: number };
  uRing: { value: number };
  uBurstScale: { value: number };
}


/* ------------------------------ constants ------------------------------ */


const TEXT = "TIMSHEL";
const FONT_STACK = '"Cinzel", "Playfair Display", Georgia, serif';
const CAMERA_Z = 7;
const CAMERA_FOV = 50;
const MAX_DPR = 1.5;
const REF_HALF_H = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * CAMERA_Z;


/** 타임라인 (초) */
const T = {
  spinnerEnd: 1.6,
  ringStart: 1.4,
  ringDuration: 1.8,
  morphStart: 3.6,
  morphDuration: 1.9,
  blurStart: 3.8,
  blurDuration: 1.5,
  tiltStart: 3.2,
  tiltDuration: 2.2,
  hold: 2.0,
  flyDuration: 1.7,
  endFade: 0.5,
} as const;
const TEXT_VISIBLE_AT = T.morphStart + T.morphDuration; // 5.5
const FLY_START = TEXT_VISIBLE_AT + T.hold; // 7.5
const COMPLETE_AT = FLY_START + T.flyDuration; // 9.2


function isPortraitViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerHeight > window.innerWidth;
}


function getParticleCount(): number {
  if (typeof navigator === "undefined") return 18000;
  if (isPortraitViewport() || window.innerWidth < 768) return 26000;
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 4 ? 18000 : 32000;
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
  uniform float uFly;
  uniform float uTilt;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTextWidth;
  uniform float uRing;
  uniform float uBurstScale;


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


    // ---- Phase 2: 글자로 응축 ----
    vec3 tg = vec3(aTarget.xy * uTextWidth, aTarget.z);
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


    // ---- Phase 4: 워프 돌진 (글자를 뚫고 지나감) ----
    float f = uFly;
    vec2 rad = normalize(pos.xy + vec2(1e-4));
    pos.xy += rad * f * f * (0.5 + aSeed * 2.5) * uBurstScale;
    pos.z += f * (6.0 + aSeed * 9.0);


    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float dz = max(-mv.z, 0.5);


    // 블룸 느낌의 대형 플레어 입자
    float flare = step(0.965, aSeed);


    float sizeVar = 0.45 + aSeed * aSeed;
    float sizeMul = mix(1.0, 0.8, em) * (1.0 + uBlur * 0.5)
                  * (1.0 + 2.0 * flare * (1.0 - em));
    gl_PointSize = clamp(
      uSize * uPixelRatio * (7.0 / dz) * sizeVar * sizeMul,
      1.0, 14.0 * uPixelRatio
    );


    // ---- 색상: 원반(내부 화이트골드 -> 외곽 앰버) -> 글자(골드/샴페인) ----
    vec3 hot = vec3(1.0, 0.93, 0.72);
    vec3 amber = vec3(0.72, 0.45, 0.08);
    vec3 discCol = mix(hot, amber, smoothstep(0.4, 1.2, radial));
    if (aSeed > 0.86 && aSeed < 0.93) discCol = vec3(1.0);


    vec3 gold = vec3(0.83, 0.69, 0.22);
    vec3 champagne = vec3(0.96, 0.89, 0.66);
    vec3 textCol = mix(gold, champagne, aSeed);


    vec3 col = mix(discCol, textCol, em);
    vColor = mix(col, vec3(1.0), clamp(f * 0.8, 0.0, 1.0));


    float twinkle = 0.6 + 0.4 * sin(uTime * (0.8 + aSeed * 1.6) + aSeed * 60.0);
    float discA = mix(0.35, 0.9, 1.0 - smoothstep(0.3, 1.1, radial));
    vAlpha = mix(discA, 0.95, em)
           * mix(twinkle, 1.0, em * 0.6)
           * smoothstep(0.0, 0.4, uIntro)
           * mix(1.0, 0.75, uBlur)
           * (1.0 + 1.5 * f)
           * (1.0 - 0.6 * flare)
           * (1.0 - smoothstep(0.7, 1.0, f));
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
    uFly: { value: 0 },
    uTilt: { value: 1.05 },
    uTime: { value: 0 },
    uSize: { value: 3.4 },
    uPixelRatio: { value: 1 },
    uTextWidth: { value: 5 },
    uRing: { value: 3 },
    uBurstScale: { value: 1 },
  };
}


function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}


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
  const step = 2;
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
  const rands = new Float32Array(count * 3);
  const seeds = new Float32Array(count);


  const textCount = textPoints.length / 2;
  const jitter = 0.004;


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


    if (textCount > 0) {
      const idx = Math.floor(Math.random() * textCount);
      targets[i3] = textPoints[idx * 2] + (Math.random() - 0.5) * jitter;
      targets[i3 + 1] = textPoints[idx * 2 + 1] + (Math.random() - 0.5) * jitter;
    }
    targets[i3 + 2] = (Math.random() - 0.5) * 0.04;


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


export default function BootIntroScreen({ onComplete }: BootIntroScreenProps) {
  const [uniforms] = useState<BootUniforms>(createUniforms);


  const spinnerWrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const progressWrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const onCompleteRef = useRef(onComplete);
  const startLoopRef = useRef<(() => void) | null>(null);
  const loopRequestedRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });


  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);


  /* ---- 마스터 타임라인 ---- */
  useEffect(() => {
    if (typeof window === "undefined") return;


    uniforms.uIntro.value = 0;
    uniforms.uMorph.value = 0;
    uniforms.uBlur.value = 1;
    uniforms.uDrift.value = 0;
    uniforms.uFly.value = 0;
    uniforms.uTilt.value = 1.05;
    loopRequestedRef.current = false;


    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onCompleteRef.current();
    };


    const host = hostRef.current;
    const glow = glowRef.current;
    const line = lineRef.current;
    
    const bar = barRef.current;
    const counter = counterRef.current;


    if (host) gsap.set(host, { opacity: 0, scale: 1.06 });
    if (glow) gsap.set(glow, { opacity: 0, scale: 0.8 });
    if (line) gsap.set(line, { scaleX: 0 });
    if (bar) gsap.set(bar, { scaleX: 0 });


    const tl = gsap.timeline();


    // 진행률 카운터 + 바
    const prog = { v: 0 };
    tl.to(
      prog,
      {
        v: 100,
        duration: COMPLETE_AT - T.endFade,
        ease: "power1.inOut",
        onUpdate: () => {
          if (bar) bar.style.transform = `scaleX(${prog.v / 100})`;
          if (counter) counter.textContent = String(Math.round(prog.v)).padStart(3, "0");
        },
      },
      0
    );


    tl.call(
      () => {
        loopRequestedRef.current = true;
        startLoopRef.current?.();
      },
      undefined,
      T.ringStart
    );


    // 파티클 레이어 등장 + 느린 줌아웃
    tl.to(host, { opacity: 1, duration: 0.8, ease: "power1.out" }, T.ringStart);
    tl.to(host, { scale: 1, duration: FLY_START - T.ringStart, ease: "power2.out" }, T.ringStart);


    // 배경 글로우
    tl.to(glow, { opacity: 1, scale: 1, duration: 2.4, ease: "power2.out" }, T.ringStart);
    tl.to(glow, { opacity: 0, duration: 1.0, ease: "power1.in" }, COMPLETE_AT - 1.2);


    // 스피너 퇴장
    tl.to(
      spinnerWrapRef.current,
      { opacity: 0, scale: 0.9, duration: 0.5, ease: "power2.in" },
      T.spinnerEnd
    );


    // 링 등장 -> 평평해지며 글자로 응축
    tl.to(uniforms.uIntro, { value: 1, duration: T.ringDuration, ease: "power3.out" }, T.ringStart);
    tl.to(uniforms.uTilt, { value: 0, duration: T.tiltDuration, ease: "power2.inOut" }, T.tiltStart);
    tl.to(uniforms.uMorph, { value: 1, duration: T.morphDuration, ease: "power3.inOut" }, T.morphStart);
    tl.to(uniforms.uBlur, { value: 0, duration: T.blurDuration, ease: "power2.out" }, T.blurStart);
    tl.to(uniforms.uDrift, { value: 1, duration: 1.0, ease: "sine.inOut" }, TEXT_VISIBLE_AT - 0.6);


    // 워프 돌진
    tl.to(uniforms.uFly, { value: 1, duration: T.flyDuration, ease: "power2.in" }, FLY_START);
    tl.to(host, { opacity: 0, duration: T.endFade, ease: "power1.in" }, COMPLETE_AT - T.endFade);
    tl.call(finish, undefined, COMPLETE_AT);


    return () => {
      tl.kill();
    };
  }, [uniforms]);


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


    const onPointer = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });


    const prepare = async () => {
      await new Promise<void>((r) => {
        timer = window.setTimeout(r, 200);
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


      const applyResize = () => {
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();


        const halfH = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * CAMERA_Z;
        const halfW = halfH * camera.aspect;
        const portrait = h > w;


        uniforms.uPixelRatio.value = dpr;
        uniforms.uTextWidth.value = Math.min(halfW * 2 * (portrait ? 0.88 : 0.74), 6.5);
        uniforms.uRing.value = Math.min(halfW, halfH) * (portrait ? 1.25 : 1.15);
        uniforms.uBurstScale.value = Math.min(1, Math.min(halfW, halfH) / REF_HALF_H);
        uniforms.uSize.value = portrait || w < 768 ? 2.5 : 3.4;
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


      // 적응형 품질
      let frame = 0;
      let acc = 0;
      let last = 0;
      let degraded = 0;
      const degrade = () => {
        degraded++;
        if (degraded === 1) {
          dpr = Math.min(dpr, 1);
          renderer.setPixelRatio(dpr);
          applyResize();
          geometry.setDrawRange(0, Math.floor(totalCount * 0.6));
        } else if (degraded === 2) {
          geometry.setDrawRange(0, Math.floor(totalCount * 0.4));
        }
      };


      const loop = (now: number) => {
        uniforms.uTime.value = clock.getElapsedTime();


        // 포인터 패럴랙스
        const p = pointerRef.current;
        camera.position.x += (p.x * 0.35 - camera.position.x) * 0.05;
        camera.position.y += (-p.y * 0.22 - camera.position.y) * 0.05;
        camera.lookAt(0, 0, 0);


        renderer.render(scene, camera);


        if (last && degraded < 2) {
          const dt = now - last;
          if (frame > 5 && dt < 200) acc += dt;
          frame++;
          if (frame === 45 || frame === 105) {
            const avg = acc / (frame === 45 ? 40 : 60);
            if (avg > 22) degrade();
            acc = 0;
            if (frame === 45) frame = 46;
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
      if (loopRequestedRef.current) startLoopRef.current();
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
  }, [uniforms]);


  return (
    <div
      className="fixed inset-0 z-[9999] h-[100dvh] w-full overflow-hidden bg-black"
      role="presentation"
      aria-hidden
    >


      {/* 파티클 */}
      <div ref={hostRef} className="absolute inset-0 will-change-[opacity,transform]" />




      {/* 스피너 */}
      <div
        ref={spinnerWrapRef}
        className="absolute inset-0 flex items-center justify-center will-change-transform"
      >
        <WaterRippleSpinner size={96} color="white" />
      </div>
    </div>
  );
}