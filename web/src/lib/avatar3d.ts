import * as THREE from "three";
import * as maplibregl from "maplibre-gl";

/**
 * three.js 미니멀 화이트 아바타 (MapLibre 커스텀 레이어).
 * - 둥근 머리 + 목 없는 통통한 몸 + 짧은 팔다리의 도자기 인형 스타일
 * - 팔다리는 스키닝(SkinnedMesh)으로 하나의 매끈한 형태가 휘어져 관절 이음새가 없습니다.
 * - 이동 속도에 따라 idle → 걷기 → 달리기 모션이 부드럽게 섞입니다.
 * - 건물 뒤에 가려져도 흰 실루엣이 비쳐 보입니다.
 */

export type AvatarPose = {
  lngLat: [number, number];
  /** 북쪽 기준 시계방향 각도 (0=북, 90=동) */
  headingDeg: number;
  /** 지면 속도(m/s) */
  speedMps: number;
};

const CHAR_HEIGHT = 1.78; // 모델 단위 키
const SCREEN_HEIGHT_PX = 124; // 화면에서 보이는 캐릭터 높이(px)

const WHITE = new THREE.Color(0xffffff);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

type LimbSpec = {
  upper: number;
  lower: number;
  top: number; // 윗부분 반지름
  joint: number; // 관절(무릎/팔꿈치) 부근 반지름
  end: number; // 끝 반지름
  bulge?: number; // 종아리/아래팔의 은은한 볼륨
  blend?: number; // 휘어지는 구간의 부드러움
};

/** 윗부분~끝까지 하나로 이어진 테이퍼형 팔다리. 두 개의 뼈 사이에서 부드럽게 휘어짐 */
function buildLimbGeometry(spec: LimbSpec) {
  const { upper, lower, top, joint, end } = spec;
  const bulge = spec.bulge ?? 0;
  const blend = spec.blend ?? 0.1;
  const total = upper + lower;
  const uj = upper / total;

  const radiusAt = (y: number) => {
    const u = clamp(-y / total, 0, 1);
    if (u <= uj) return lerp(top, joint, smooth(u / uj));
    const s = (u - uj) / (1 - uj);
    return lerp(joint, end, smooth(s)) * (1 + bulge * Math.sin(Math.PI * s));
  };

  const pts: THREE.Vector2[] = [];
  const CAP = 10;
  for (let k = 0; k <= CAP; k += 1) {
    const th = -Math.PI / 2 + (k * (Math.PI / 2)) / CAP;
    pts.push(new THREE.Vector2(Math.max(0.0001, end * Math.cos(th)), -total + end * Math.sin(th)));
  }
  const N = 40;
  for (let i = 1; i <= N; i += 1) {
    const y = -total + (total * i) / N;
    pts.push(new THREE.Vector2(radiusAt(y), y));
  }
  for (let k = 1; k <= CAP; k += 1) {
    const th = (k * (Math.PI / 2)) / CAP;
    pts.push(new THREE.Vector2(Math.max(0.0001, top * Math.cos(th)), top * Math.sin(th)));
  }

  const geo = new THREE.LatheGeometry(pts, 32);

  const pos = geo.getAttribute("position");
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    // y가 관절보다 아래일수록 아래 뼈(1)의 영향이 커짐
    const w = smooth(clamp((y - (-upper + blend)) / (-2 * blend), 0, 1));
    skinIndex.push(0, 1, 0, 0);
    skinWeight.push(1 - w, w, 0, 0);
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  return geo;
}

/** 몸통: 통통한 서양배 모양. 목 없이 머리 밑에 바로 이어짐 */
function buildTorsoGeometry() {
  const control = [
    [0.0, -0.12],
    [0.11, -0.105],
    [0.185, -0.02],
    [0.23, 0.12],
    [0.24, 0.25],
    [0.22, 0.37],
    [0.17, 0.455],
    [0.11, 0.515],
    [0.06, 0.56],
    [0.0, 0.58],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const curve = new THREE.SplineCurve(control);
  const pts = curve.getPoints(70).map((p) => new THREE.Vector2(Math.max(0.0001, p.x), p.y));
  return new THREE.LatheGeometry(pts, 40);
}

type Rig = {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  elbowL: THREE.Object3D;
  elbowR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  kneeL: THREE.Object3D;
  kneeR: THREE.Object3D;
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>;
};

function buildRig(): Rig {
  const disposables: Rig["disposables"] = [];

  // 순백색 도자기: 자체 발광을 높여 음영이 져도 회색으로 죽지 않게 하고, 광택은 코팅으로 표현
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: WHITE,
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    emissive: WHITE,
    emissiveIntensity: 0.5,
  });

  const xrayMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.36,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  disposables.push(bodyMat, xrayMat);

  // 스키닝 없는 부품(몸통/머리/손/발)
  const rigid = (geometry: THREE.BufferGeometry) => {
    disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, bodyMat);
    const ghost = new THREE.Mesh(geometry, xrayMat);
    ghost.renderOrder = 10;
    mesh.add(ghost);
    return mesh;
  };

  // 두 뼈 사이를 매끄럽게 잇는 팔다리
  const limb = (spec: LimbSpec) => {
    const geo = buildLimbGeometry(spec);
    disposables.push(geo);

    const root = new THREE.Group();
    const b0 = new THREE.Bone();
    const b1 = new THREE.Bone();
    b1.position.y = -spec.upper;
    b0.add(b1);
    root.add(b0);

    const mesh = new THREE.SkinnedMesh(geo, bodyMat);
    const ghost = new THREE.SkinnedMesh(geo, xrayMat);
    ghost.renderOrder = 10;
    mesh.frustumCulled = false;
    ghost.frustumCulled = false;
    root.add(mesh);
    root.add(ghost);

    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([b0, b1]);
    mesh.bind(skeleton);
    ghost.bind(skeleton);

    return { root, b0, b1 };
  };

  const HIP_Y = 0.5;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  body.add(hips);

  // 짧고 통통한 다리
  const makeLeg = (side: 1 | -1) => {
    const l = limb({
      upper: 0.16,
      lower: 0.16,
      top: 0.098,
      joint: 0.082,
      end: 0.068,
      bulge: 0.06,
      blend: 0.99,
    });
    l.root.position.set(side * 0.1, 0, 0);

    // 둥글고 납작한 발
    const foot = rigid(new THREE.SphereGeometry(1, 24, 18));
    foot.scale.set(0.088, 0.052, 0.15);
    foot.position.set(0, -0.24, 0.045);
    l.b1.add(foot);

    hips.add(l.root);
    return l;
  };

  const L = makeLeg(1);
  const R = makeLeg(-1);

  const torso = new THREE.Group();
  hips.add(torso);

  // 상체를 더 통통하게
  const torsoMesh = rigid(buildTorsoGeometry());
  torsoMesh.scale.set(1.12, 1, 0.95);
  torso.add(torsoMesh);

  // 몸에 붙어 늘어진 팔: 손목 쪽을 굵게 하고 손을 겹쳐 팔과 손 사이의 간격을 없앰
  const makeArm = (side: 1 | -1) => {
    const a = limb({
      upper: 0.14,
      lower: 0.13,
      top: 0.042,
      joint: 0.058,
      end: 0.042,
      bulge: 0.04,
      blend: 0.07,
    });
    a.root.position.set(side * 0.23, 0.38, 0);

    const hand = rigid(new THREE.SphereGeometry(0.043, 20, 16));
    hand.scale.set(0.95, 1.1, 0.9);
    hand.position.set(0, -0.19, 0);
    a.b1.add(hand);

    torso.add(a.root);
    return a;
  };

  const AL = makeArm(1);
  const AR = makeArm(-1);

  // 목 없이 몸통 위에 바로 얹힌 구형 머리 (조금 작게)
  const head = new THREE.Group();
  head.position.y = 0.34;
  torso.add(head);

  const skull = rigid(new THREE.SphereGeometry(0.4, 48, 36));
  skull.scale.set(0.8, 0.76, 0.78);
  skull.position.y = 0.37;
  head.add(skull);

  return {
    root,
    body,
    hips,
    torso,
    head,
    armL: AL.b0,
    armR: AR.b0,
    elbowL: AL.b1,
    elbowR: AR.b1,
    legL: L.b0,
    legR: R.b0,
    kneeL: L.b1,
    kneeR: R.b1,
    disposables,
  };
}

export type AvatarLayerHandle = {
  layer: maplibregl.CustomLayerInterface;
  update: (pose: AvatarPose) => void;
};

export function createAvatarLayer(id = "san-avatar-3d"): AvatarLayerHandle {
  let pose: AvatarPose | null = null;

  let map: maplibregl.Map | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let rig: Rig | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);

  let phase = 0;
  let walkBlend = 0;
  let runBlend = 0;
  let lastTime = performance.now();
  let clock = 0;

  function animate(dt: number, speed: number) {
    if (!rig) return;
    clock += dt;

    const targetWalk = clamp((speed - 0.12) / 0.8, 0, 1);
    const targetRun = clamp((speed - 2.3) / 1.8, 0, 1);
    walkBlend += (targetWalk - walkBlend) * Math.min(1, dt * 6);
    runBlend += (targetRun - runBlend) * Math.min(1, dt * 4.5);

    const w = walkBlend;
    const r = runBlend;

    if (w > 0.03) {
      const eff = Math.max(speed, 0.8);
      const stepLen = clamp(0.4 + 0.16 * eff, 0.45, 1.1);
      const cyclesPerSec = eff / (2 * stepLen);
      phase += Math.PI * 2 * cyclesPerSec * dt;
    }

    const s = Math.sin(phase);
    const sR = Math.sin(phase + Math.PI);
    const c = Math.cos(phase);
    const cR = Math.cos(phase + Math.PI);
    const c2 = Math.cos(phase * 2);

    const legAmp = lerp(0.5, 0.9, r) * w;
    const kneeAmp = lerp(0.35, 1.45, r) * w;
    // 통통한 몸통에 팔이 끼지 않도록 흔드는 폭을 약간 줄임
    const armAmp = lerp(0.4, 0.8, r) * w;

    rig.legL.rotation.x = -legAmp * s;
    rig.legR.rotation.x = -legAmp * sR;
    rig.kneeL.rotation.x = 0.05 * w + kneeAmp * Math.max(0, c);
    rig.kneeR.rotation.x = 0.05 * w + kneeAmp * Math.max(0, cR);

    rig.armL.rotation.x = armAmp * s;
    rig.armR.rotation.x = armAmp * sR;

    // 통통한 배를 피해 팔이 살짝 벌어져 내려옴
    const idleSway = (1 - w) * 0.03 * Math.sin(clock * 1.6);
    rig.armL.rotation.z = 0.22 + idleSway;
    rig.armR.rotation.z = -0.22 - idleSway;

    const elbow = 0.1 + w * 0.2 + r * w * 1.05;
    rig.elbowL.rotation.x = -elbow;
    rig.elbowR.rotation.x = -elbow;

    rig.hips.rotation.y = -0.1 * w * s;
    rig.torso.rotation.y = 0.14 * w * s * (1 + r * 0.5);
    rig.torso.rotation.x = 0.03 * w + 0.22 * r * w;

    const bounce = lerp(0.03, -0.05, r) * w * c2;
    rig.body.position.y = bounce - 0.035 * r * w;

    const breathe = (1 - w) * 0.016 * Math.sin(clock * 2.1);
    rig.torso.scale.set(1 + breathe * 0.5, 1 + breathe, 1);
    rig.head.rotation.y = (1 - w) * 0.3 * Math.sin(clock * 0.55);
    rig.head.rotation.z = (1 - w) * 0.07 * Math.sin(clock * 0.8) + 0.05 * w * s;
    rig.head.rotation.x =
      (1 - w) * 0.04 * Math.sin(clock * 0.9) + 0.04 * r * w - 0.04 * w * c2;
  }

  const layer: maplibregl.CustomLayerInterface = {
    id,
    type: "custom",
    renderingMode: "3d",

    onAdd(m, gl) {
      map = m;

      renderer = new THREE.WebGLRenderer({
        canvas: m.getCanvas(),
        context: gl as WebGL2RenderingContext,
        antialias: true,
      });
      renderer.autoClear = false;

      rig = buildRig();
      scene.add(rig.root);

      // 모두 흰색 조명 (색 조명은 흰색을 탁하게 만들기 때문)
      scene.add(new THREE.HemisphereLight(0xffffff, 0xeef2fb, 2.0));

      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(2.5, 6, 5);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xffffff, 1.0);
      fill.position.set(-4, 3, 2);
      scene.add(fill);

      const back = new THREE.DirectionalLight(0xffffff, 0.8);
      back.position.set(0, 4, -5);
      scene.add(back);
    },

    render(gl, args: unknown) {
      if (!map || !renderer || !rig) return;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!pose) {
        rig.root.visible = false;
        return;
      }
      rig.root.visible = true;

      // MapLibre 5: { defaultProjectionData: { mainMatrix } }, 4.x: 행렬 배열
      const a = args as
        | { defaultProjectionData?: { mainMatrix?: ArrayLike<number> } }
        | ArrayLike<number>;
      const matrix: ArrayLike<number> | undefined =
        "defaultProjectionData" in (a as object)
          ? (a as { defaultProjectionData: { mainMatrix: ArrayLike<number> } })
              .defaultProjectionData.mainMatrix
          : (a as ArrayLike<number>);
      if (!matrix) return;

      animate(dt, pose.speedMps);

      const [lng, lat] = pose.lngLat;
      const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, 0);
      const meterUnit = mc.meterInMercatorCoordinateUnits();

      const zoom = map.getZoom();
      const metersPerPixel =
        (78271.516964 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
      const unit = (SCREEN_HEIGHT_PX * metersPerPixel) / CHAR_HEIGHT;

      // 모델 앞(+Z)이 남쪽을 향하는 기준 → 북쪽 기준 방위로 환산
      rig.root.rotation.y = Math.PI - (pose.headingDeg * Math.PI) / 180;
      rig.root.scale.setScalar(unit);

      const l = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(meterUnit, -meterUnit, meterUnit))
        .multiply(rotX);

      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(Array.from(matrix))
        .multiply(l);

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },

    onRemove() {
      rig?.disposables.forEach((d) => d.dispose());
      renderer?.dispose();
      rig = null;
      renderer = null;
      map = null;
    },
  };

  return {
    layer,
    update(next) {
      pose = next;
      map?.triggerRepaint();
    },
  };
}