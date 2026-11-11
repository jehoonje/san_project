// web/src/lib/signatureCard.ts
// 취향 시그니처 카드 이미지 (1080x1920): 궤도 위 별자리 + 취향 이름 + 모은 칸
import type { Collection } from "@/lib/tasteCollection";
import { orbitLayout } from "@/lib/orbitLayout";

const W = 1080;
const H = 1920;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    if (line && ctx.measureText(line + char).width > width) {
      lines.push(line.trimEnd());
      line = char.trimStart();
    } else {
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderSignatureCard(
  collection: Collection,
  title: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  // 배경: 깊은 남색 + 위쪽 은은한 빛
  ctx.fillStyle = "#03070d";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, 620, 0, W * 0.5, 620, 760);
  glow.addColorStop(0, "rgba(0,191,255,0.16)");
  glow.addColorStop(1, "rgba(0,191,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const mono = "ui-monospace, 'SF Mono', Menlo, monospace";
  const sans = "'Pretendard Variable', Pretendard, system-ui, sans-serif";

  ctx.fillStyle = "rgba(143,163,184,0.75)";
  ctx.font = `500 30px ${mono}`;
  ctx.fillText("SAN  ·  TASTE SIGNATURE", 90, 150);

  // 궤도
  const scale = 2.3;
  const cx = W / 2;
  const cy = 640;
  const layout = orbitLayout(collection);

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 2;
  for (const r of [layout.innerRadius, layout.outerRadius]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(0,191,255,0.35)";
  ctx.lineWidth = 2;
  for (const [a, b] of layout.links) {
    ctx.beginPath();
    ctx.moveTo(cx + a.x * scale, cy + a.y * scale);
    ctx.lineTo(cx + b.x * scale, cy + b.y * scale);
    ctx.stroke();
  }

  for (const node of layout.nodes) {
    const x = cx + node.x * scale;
    const y = cy + node.y * scale;
    if (node.entry.unlocked) {
      const r = node.radius * scale;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      halo.addColorStop(0, "rgba(0,191,255,0.45)");
      halo.addColorStop(1, "rgba(0,191,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e9f8ff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(143,163,184,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `200 96px ${sans}`;
  ctx.fillText(String(collection.unlocked), cx, cy + 22);
  ctx.fillStyle = "rgba(143,163,184,0.8)";
  ctx.font = `500 24px ${mono}`;
  ctx.fillText(`/ ${collection.total}  COLLECTED`, cx, cy + 74);
  ctx.textAlign = "left";

  // 취향 이름
  ctx.fillStyle = "#ffffff";
  ctx.font = `300 76px ${sans}`;
  const titleLines = wrap(ctx, title, W - 180).slice(0, 3);
  titleLines.forEach((line, i) => ctx.fillText(line, 90, 1180 + i * 100));

  // 많이 모은 칸
  const top = collection.entries
    .filter((e) => e.unlocked)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  ctx.font = `400 38px ${sans}`;
  let y = 1180 + titleLines.length * 100 + 70;
  for (const entry of top) {
    ctx.fillStyle = "rgba(0,191,255,0.9)";
    ctx.fillText("◆", 90, y);
    ctx.fillStyle = "rgba(233,248,255,0.86)";
    ctx.fillText(entry.label, 150, y);
    y += 62;
  }

  ctx.fillStyle = "rgba(95,115,135,0.9)";
  ctx.font = `500 26px ${mono}`;
  ctx.fillText(new Date().toISOString().slice(0, 10).replace(/-/g, "."), 90, H - 110);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("image_failed"))),
      "image/png",
    ),
  );
}

// 공유 시트가 있으면 공유, 없으면 이미지 저장
export async function shareSignatureCard(collection: Collection, title: string) {
  const blob = await renderSignatureCard(collection, title);
  const file = new File([blob], "san-taste-signature.png", { type: "image/png" });

  if (
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title });
      return "shared" as const;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = "san-taste-signature.png";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return "saved" as const;
}
