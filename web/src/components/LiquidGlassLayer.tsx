"use client";

import { useEffect, useId, useRef } from "react";
import { motion, type MotionValue } from "motion/react";

export type GlassConfig = {
  glassThickness: number;
  bezelWidth: number;
  ior: number;
  scaleRatio: number;
  blur: number;
  specularOpacity: number;
  specularSat: number;
  balancedSpecular: boolean;
};

export const NAV_GLASS: GlassConfig = {
  glassThickness: 30,
  bezelWidth: 40,
  ior: 1.4,
  scaleRatio: 1,
  blur: 1.5,
  specularOpacity: 0.5,
  specularSat: 0,
  balancedSpecular: true,
};

const SVG_NS = "http://www.w3.org/2000/svg";

function surfaceFn(x: number) {
  return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
}

function calcRefractionProfile(
  glassThickness: number,
  bezelWidth: number,
  ior: number,
  samples = 128,
) {
  const eta = 1 / ior;

  function refract(nx: number, ny: number): [number, number] | null {
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const sq = Math.sqrt(k);
    return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
  }

  const p = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = surfaceFn(x);
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = surfaceFn(x + dx);
    const deriv = (y2 - y) / dx;
    const mag = Math.sqrt(deriv * deriv + 1);
    const ref = refract(-deriv / mag, -1 / mag);
    p[i] = ref ? ref[0] * ((y * bezelWidth + glassThickness) / ref[1]) : 0;
  }
  return p;
}

function generateDisplacementMap(
  w: number,
  h: number,
  radius: number,
  bezelWidth: number,
  profile: Float64Array,
  maxDisp: number,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 128;
    d[i + 1] = 128;
    d[i + 2] = 0;
    d[i + 3] = 255;
  }
  const r = radius;
  const rSq = r * r;
  const r1Sq = (r + 1) ** 2;
  const rBSq = Math.max(r - bezelWidth, 0) ** 2;
  const wB = w - r * 2;
  const hB = h - r * 2;
  const S = profile.length;

  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
      const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
      const dSq = x * x + y * y;
      if (dSq > r1Sq || dSq < rBSq) continue;
      const dist = Math.sqrt(dSq);
      const fromSide = r - dist;
      const op =
        dSq < rSq
          ? 1
          : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;
      const cos = x / dist;
      const sin = y / dist;
      const bi = Math.min(((fromSide / bezelWidth) * S) | 0, S - 1);
      const disp = profile[bi] || 0;
      const dX = (-cos * disp) / maxDisp;
      const dY = (-sin * disp) / maxDisp;
      const idx = (y1 * w + x1) * 4;
      d[idx] = (128 + dX * 127 * op + 0.5) | 0;
      d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function generateSpecularMap(
  w: number,
  h: number,
  radius: number,
  bezelWidth: number,
  balanced: boolean,
) {
  const angle = Math.PI / 3;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const r = radius;
  const rSq = r * r;
  const r1Sq = (r + 1) ** 2;
  const rBSq = Math.max(r - bezelWidth, 0) ** 2;
  const wB = w - r * 2;
  const hB = h - r * 2;
  const sv = [Math.cos(angle), Math.sin(angle)];

  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
      const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
      const dSq = x * x + y * y;
      if (dSq > r1Sq || dSq < rBSq) continue;
      const dist = Math.sqrt(dSq);
      const fromSide = r - dist;
      const op =
        dSq < rSq
          ? 1
          : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;
      const cos = x / dist;
      const sin = -y / dist;
      const dot = balanced ? 1 : Math.abs(cos * sv[0] + sin * sv[1]);
      const edge = Math.sqrt(Math.max(0, 1 - (1 - fromSide) ** 2));
      const coeff = dot * edge;
      const col = (255 * coeff) | 0;
      const alpha = (col * coeff * op) | 0;
      const idx = (y1 * w + x1) * 4;
      d[idx] = col;
      d[idx + 1] = col;
      d[idx + 2] = col;
      d[idx + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function svgEl(tag: string, attrs: Record<string, string | number>) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function buildFilter(
  id: string,
  w: number,
  h: number,
  radius: number,
  cfg: GlassConfig,
) {
  const bezel = Math.max(
    1,
    Math.min(cfg.bezelWidth, radius - 1, Math.min(w, h) / 2 - 1),
  );
  const profile = calcRefractionProfile(
    cfg.glassThickness,
    bezel,
    cfg.ior,
    128,
  );
  const maxDisp = Math.max(...Array.from(profile).map(Math.abs)) || 1;
  const dispUrl = generateDisplacementMap(w, h, radius, bezel, profile, maxDisp);
  const specUrl = generateSpecularMap(
    w,
    h,
    radius,
    bezel * 2.5,
    cfg.balancedSpecular,
  );
  const scale = maxDisp * cfg.scaleRatio;
  const pad = cfg.balancedSpecular ? 0.36 : 0;

  const filter = svgEl("filter", {
    id,
    x: Math.round(-w * pad),
    y: Math.round(-h * pad),
    width: Math.round(w * (1 + pad * 2)),
    height: Math.round(h * (1 + pad * 2)),
    filterUnits: "userSpaceOnUse",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });

  const blur = svgEl("feGaussianBlur", {
    in: "SourceGraphic",
    stdDeviation: cfg.blur,
    result: "blurred",
  });
  const dispImg = svgEl("feImage", {
    href: dispUrl,
    x: 0,
    y: 0,
    width: w,
    height: h,
    result: "disp_map",
  });
  const dispMap = svgEl("feDisplacementMap", {
    in: "blurred",
    in2: "disp_map",
    scale,
    xChannelSelector: "R",
    yChannelSelector: "G",
    result: "displaced",
  });
  const sat = svgEl("feColorMatrix", {
    in: "displaced",
    type: "saturate",
    values: cfg.specularSat,
    result: "displaced_sat",
  });
  const spec = svgEl("feImage", {
    href: specUrl,
    x: 0,
    y: 0,
    width: w,
    height: h,
    result: "spec_layer",
  });
  const comp = svgEl("feComposite", {
    in: "displaced_sat",
    in2: "spec_layer",
    operator: "in",
    result: "spec_masked",
  });
  const tr = svgEl("feComponentTransfer", {
    in: "spec_layer",
    result: "spec_faded",
  });
  tr.appendChild(
    svgEl("feFuncA", { type: "linear", slope: cfg.specularOpacity }),
  );
  const b1 = svgEl("feBlend", {
    in: "spec_masked",
    in2: "displaced",
    mode: "normal",
    result: "with_sat",
  });
  const b2 = svgEl("feBlend", {
    in: "spec_faded",
    in2: "with_sat",
    mode: "normal",
  });

  filter.append(blur, dispImg, dispMap, sat, spec, comp, tr, b1, b2);
  return filter;
}

function getDefs() {
  let defs = document.getElementById("lg-defs") as SVGDefsElement | null;
  if (defs && document.documentElement.contains(defs)) return defs;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:-1;";
  defs = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
  defs.id = "lg-defs";
  svg.appendChild(defs);
  document.documentElement.appendChild(svg);
  return defs;
}

// iOS의 모든 브라우저는 WebKit이라 SVG backdrop-filter를 못 씁니다.
export function supportsSvgBackdrop() {
  const ua = navigator.userAgent;
  const chromium = /Chrome|Chromium|Edg\//.test(ua);
  const iosWebKit = /CriOS|FxiOS|EdgiOS|iPhone|iPad|iPod/.test(ua);
  return chromium && !iosWebKit;
}

const FALLBACK_FILTER = "blur(22px) saturate(190%) brightness(1.06)";

type LiquidGlassLayerProps = {
  config?: GlassConfig;
  radius?: number;
  className?: string;
  fallbackFilter?: string;
  /** 이 레이어 자신의 투명도. 부모가 아니라 요소 자체에 걸어야 굴절이 유지됩니다. */
  opacity?: MotionValue<number>;
};

/**
 * 부모(relative) 안에 absolute로 깔리는 유리 레이어.
 * 부모 크기를 따라가며 굴절 필터를 다시 만들고,
 * 미지원 환경에서는 CSS blur 유리로 대체합니다.
 */
export function LiquidGlassLayer({
  config = NAV_GLASS,
  radius,
  className = "",
  fallbackFilter = FALLBACK_FILTER,
  opacity,
}: LiquidGlassLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const filterId = `lg-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!supportsSvgBackdrop()) {
      el.style.borderRadius = `${radius ?? 999}px`;
      el.style.backdropFilter = fallbackFilter;
      el.style.setProperty("-webkit-backdrop-filter", fallbackFilter);
      return;
    }

    let filterNode: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function rebuild() {
      if (!el) return;
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (w < 4 || h < 4) return;

      const r = Math.max(2, Math.min(radius ?? h / 2, w / 2, h / 2));
      const defs = getDefs();
      filterNode?.remove();
      filterNode = buildFilter(filterId, w, h, r, config);
      defs.appendChild(filterNode);

      el.style.borderRadius = `${r}px`;
      el.style.backdropFilter = `url(#${filterId})`;
      el.style.setProperty("-webkit-backdrop-filter", `url(#${filterId})`);
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 16);
    }

    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    rebuild();

    return () => {
      clearTimeout(timer);
      ro.disconnect();
      filterNode?.remove();
    };
  }, [config, radius, filterId, fallbackFilter]);

  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute -inset-px z-0 rounded-full ${className}`}
      style={opacity ? { opacity } : undefined}
    />
  );
}