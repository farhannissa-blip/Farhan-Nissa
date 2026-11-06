import * as THREE from 'three';

export interface KoiPalette {
  name: string;
  body: string;
  spot1: string;
  spot2: string;
  fin: string;
  tail: string;
  border: string;
}

export const KOI_PALETTES: KoiPalette[] = [
  {
    name: 'Kohaku Merah Putih',
    body: '#ffffff',
    spot1: '#f97316',
    spot2: '#ea580c',
    fin: '#fb923c',
    tail: '#ea580c',
    border: '#f97316',
  },
  {
    name: 'Ogon Emas Kemilau',
    body: '#fef08a',
    spot1: '#f59e0b',
    spot2: '#d97706',
    fin: '#fde047',
    tail: '#f59e0b',
    border: '#d97706',
  },
  {
    name: 'Showa Triwarna',
    body: '#fff7ed',
    spot1: '#ef4444',
    spot2: '#1e293b',
    fin: '#f87171',
    tail: '#dc2626',
    border: '#ef4444',
  },
  {
    name: 'Asagi Biru Langit',
    body: '#e0f2fe',
    spot1: '#0284c7',
    spot2: '#f43f5e',
    fin: '#7dd3fc',
    tail: '#0369a1',
    border: '#0284c7',
  },
  {
    name: 'Sakura Merah Muda',
    body: '#fdf2f8',
    spot1: '#ec4899',
    spot2: '#be185d',
    fin: '#f472b6',
    tail: '#db2777',
    border: '#ec4899',
  },
  {
    name: 'Midori Zamrud',
    body: '#ecfdf5',
    spot1: '#10b981',
    spot2: '#f59e0b',
    fin: '#6ee7b7',
    tail: '#059669',
    border: '#10b981',
  },
];

export const RARE_GOLD_PALETTE: KoiPalette = {
  name: 'Koi Emas Langka 24K',
  body: '#fef08a',
  spot1: '#facc15',
  spot2: '#f59e0b',
  fin: '#fde047',
  tail: '#f59e0b',
  border: '#eab308',
};

// ================= CACHED GEOMETRIES & TEXTURES (ZERO RUNTIME ALLOCATION) =================
let cachedShadowTexture: THREE.CanvasTexture | null = null;
const cachedSkinTextures = new Map<string, THREE.CanvasTexture>();
const cachedBadgeTextures = new Map<string, THREE.CanvasTexture>();
const cachedPaletteMaterials = new Map<
  string,
  {
    bodyMat: THREE.MeshStandardMaterial;
    finMat: THREE.MeshStandardMaterial;
    tailMat: THREE.MeshStandardMaterial;
    barbelMat: THREE.MeshStandardMaterial;
    pedestalMat: THREE.MeshStandardMaterial;
  }
>();

let sharedKoiGeos: {
  bodyGeo: THREE.BufferGeometry;
  dorsalGeo: THREE.BufferGeometry;
  pecGeo: THREE.BufferGeometry;
  tailGeo: THREE.BufferGeometry;
  scleraGeo: THREE.BufferGeometry;
  pupilGeo: THREE.BufferGeometry;
  barbelGeo: THREE.BufferGeometry;
  pedestalGeo: THREE.BufferGeometry;
  shadowGeo: THREE.BufferGeometry;
  hitboxGeo: THREE.BufferGeometry;
  scleraMat: THREE.MeshStandardMaterial;
  pupilMat: THREE.MeshStandardMaterial;
  hitboxMat: THREE.MeshBasicMaterial;
} | null = null;

export function getRadialShadowTexture(): THREE.CanvasTexture {
  if (cachedShadowTexture) return cachedShadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(3, 45, 78, 0.56)');
  grad.addColorStop(0.55, 'rgba(3, 45, 78, 0.24)');
  grad.addColorStop(1, 'rgba(3, 45, 78, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedShadowTexture = tex;
  return tex;
}

function getSharedKoiGeometries() {
  if (sharedKoiGeos) return sharedKoiGeos;

  const profilePoints: THREE.Vector2[] = [
    new THREE.Vector2(0.01, -1.15),
    new THREE.Vector2(0.09, -0.95),
    new THREE.Vector2(0.22, -0.55),
    new THREE.Vector2(0.38, -0.05),
    new THREE.Vector2(0.44, 0.35),
    new THREE.Vector2(0.37, 0.72),
    new THREE.Vector2(0.22, 0.98),
    new THREE.Vector2(0.01, 1.12),
  ];
  const bodyGeo = new THREE.LatheGeometry(profilePoints, 16);
  bodyGeo.rotateZ(-Math.PI / 2);
  bodyGeo.scale(1.0, 0.86, 0.68);
  bodyGeo.computeVertexNormals();

  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.45, 0);
  dorsalShape.quadraticCurveTo(-0.1, 0.42, 0.32, 0.18);
  dorsalShape.quadraticCurveTo(0.1, 0.04, -0.45, 0);
  const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 8,
  });
  dorsalGeo.center();

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0);
  pecShape.quadraticCurveTo(-0.18, 0.48, -0.52, 0.32);
  pecShape.quadraticCurveTo(-0.35, 0.06, 0, 0);
  const pecGeo = new THREE.ExtrudeGeometry(pecShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
    curveSegments: 8,
  });

  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.quadraticCurveTo(-0.38, 0.46, -0.72, 0.52);
  tailShape.quadraticCurveTo(-0.42, 0.08, -0.26, 0);
  tailShape.quadraticCurveTo(-0.42, -0.08, -0.72, -0.52);
  tailShape.quadraticCurveTo(-0.38, -0.46, 0, 0);
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 8,
  });
  tailGeo.center();

  const scleraGeo = new THREE.SphereGeometry(0.085, 8, 8);
  const pupilGeo = new THREE.SphereGeometry(0.052, 8, 8);
  const barbelGeo = new THREE.CylinderGeometry(0.008, 0.022, 0.22, 6);
  const pedestalGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16);
  const shadowGeo = new THREE.PlaneGeometry(2.4, 1.15);
  shadowGeo.rotateX(-Math.PI / 2);

  // Proportional, accurate hitbox matching the fish body & badge
  const hitboxGeo = new THREE.BoxGeometry(2.0, 1.55, 1.0);

  const scleraMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
  });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.1,
  });
  const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });

  sharedKoiGeos = {
    bodyGeo,
    dorsalGeo,
    pecGeo,
    tailGeo,
    scleraGeo,
    pupilGeo,
    barbelGeo,
    pedestalGeo,
    shadowGeo,
    hitboxGeo,
    scleraMat,
    pupilMat,
    hitboxMat,
  };
  return sharedKoiGeos;
}

function getKoiSkinTexture(
  palette: KoiPalette,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const existing = cachedSkinTextures.get(palette.name);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = palette.body;
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = palette.spot1;
  ctx.beginPath();
  ctx.ellipse(90, 64, 39, 26, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(165, 55, 29, 22, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.spot2;
  ctx.beginPath();
  ctx.ellipse(130, 72, 22, 18, 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(198, 66, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.lineWidth = 1;
  for (let x = 12; x < 240; x += 14) {
    for (let y = 8; y < 120; y += 14) {
      ctx.beginPath();
      ctx.arc(x + ((y / 14) % 2) * 7, y, 6, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  cachedSkinTextures.set(palette.name, tex);
  return tex;
}

function getPaletteMaterials(palette: KoiPalette, maxAnisotropy: number) {
  const existing = cachedPaletteMaterials.get(palette.name);
  if (existing) return existing;

  const skinTex = getKoiSkinTexture(palette, maxAnisotropy);
  const isRareGold = palette.name === RARE_GOLD_PALETTE.name;

  const bodyMat = new THREE.MeshStandardMaterial({
    map: skinTex,
    roughness: isRareGold ? 0.14 : 0.24,
    metalness: isRareGold ? 0.65 : 0.08,
    emissive: isRareGold ? new THREE.Color(0xf59e0b) : new THREE.Color(0x000000),
    emissiveIntensity: isRareGold ? 0.38 : 0,
  });

  const finMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.fin),
    roughness: isRareGold ? 0.2 : 0.45,
    metalness: isRareGold ? 0.55 : 0.05,
    emissive: isRareGold ? new THREE.Color(0xfacc15) : new THREE.Color(0x000000),
    emissiveIntensity: isRareGold ? 0.32 : 0,
  });

  const tailMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.tail),
    roughness: isRareGold ? 0.22 : 0.48,
    metalness: isRareGold ? 0.55 : 0.05,
    emissive: isRareGold ? new THREE.Color(0xf59e0b) : new THREE.Color(0x000000),
    emissiveIntensity: isRareGold ? 0.32 : 0,
  });

  const barbelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.spot1),
    roughness: 0.4,
  });

  const pedestalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.border),
    roughness: 0.22,
    metalness: isRareGold ? 0.7 : 0.3,
    emissive: isRareGold ? new THREE.Color(0xfacc15) : new THREE.Color(0x000000),
    emissiveIntensity: isRareGold ? 0.4 : 0,
  });

  const mats = { bodyMat, finMat, tailMat, barbelMat, pedestalMat };
  cachedPaletteMaterials.set(palette.name, mats);
  return mats;
}

export function createNumberBadgeTexture(
  value: number,
  borderColor: string,
  maxAnisotropy: number,
  isRareGold = false
): THREE.CanvasTexture {
  const cacheKey = `${value}_${borderColor}_${isRareGold ? 'gold' : 'std'}`;
  const existing = cachedBadgeTextures.get(cacheKey);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 192, 192);

  // Main circular medallion
  ctx.beginPath();
  ctx.arc(96, 96, 82, 0, Math.PI * 2);
  if (isRareGold) {
    const grad = ctx.createRadialGradient(96, 80, 10, 96, 96, 82);
    grad.addColorStop(0, '#fef9c3');
    grad.addColorStop(0.65, '#fde047');
    grad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.fill();

  // Thick colored rim
  ctx.beginPath();
  ctx.arc(96, 96, 75, 0, Math.PI * 2);
  ctx.lineWidth = isRareGold ? 14 : 12;
  ctx.strokeStyle = isRareGold ? '#b45309' : borderColor;
  ctx.stroke();

  if (isRareGold) {
    ctx.beginPath();
    ctx.arc(96, 96, 67, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#9a3412';
    ctx.font = '900 22px "Fredoka", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ 2X SKOR ★', 96, 44);
  }

  // Bold, super-legible number directly on the fish badge
  const textStr = String(value);
  ctx.fillStyle = '#0f172a';
  ctx.font =
    textStr.length >= 3
      ? '900 68px "Fredoka", "Plus Jakarta Sans", sans-serif'
      : isRareGold
      ? '900 78px "Fredoka", "Plus Jakarta Sans", sans-serif'
      : '900 86px "Fredoka", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(textStr, 96, isRareGold ? 112 : 100);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  cachedBadgeTextures.set(cacheKey, tex);
  return tex;
}

export interface Koi3DComponents {
  root: THREE.Group;
  swimGroup: THREE.Group;
  tailPivot: THREE.Group;
  finLeftPivot: THREE.Group;
  finRightPivot: THREE.Group;
  dorsalFin: THREE.Mesh;
  badgeSprite: THREE.Sprite;
  badgePedestal: THREE.Mesh;
  shadowPlane: THREE.Mesh;
  hitbox: THREE.Mesh;
  rareHaloMesh?: THREE.Mesh;
}

export function create3DKoiFish(
  palette: KoiPalette,
  answerValue: number,
  _shortcutIndex: number,
  maxAnisotropy: number,
  enableShadows = false,
  isRareGold = false
): Koi3DComponents {
  const geos = getSharedKoiGeometries();
  const mats = getPaletteMaterials(palette, maxAnisotropy);

  const root = new THREE.Group();
  const swimGroup = new THREE.Group();
  root.add(swimGroup);

  const bodyMesh = new THREE.Mesh(geos.bodyGeo, mats.bodyMat);
  bodyMesh.castShadow = enableShadows;
  swimGroup.add(bodyMesh);

  const dorsalFin = new THREE.Mesh(geos.dorsalGeo, mats.finMat);
  dorsalFin.position.set(-0.08, 0.38, 0);
  swimGroup.add(dorsalFin);

  const finLeftPivot = new THREE.Group();
  finLeftPivot.position.set(0.32, -0.06, -0.24);
  const leftFinMesh = new THREE.Mesh(geos.pecGeo, mats.finMat);
  leftFinMesh.rotation.x = -Math.PI * 0.38;
  leftFinMesh.rotation.y = 0.25;
  finLeftPivot.add(leftFinMesh);
  swimGroup.add(finLeftPivot);

  const finRightPivot = new THREE.Group();
  finRightPivot.position.set(0.32, -0.06, 0.24);
  const rightFinMesh = new THREE.Mesh(geos.pecGeo, mats.finMat);
  rightFinMesh.rotation.x = Math.PI * 0.38;
  rightFinMesh.rotation.y = -0.25;
  finRightPivot.add(rightFinMesh);
  swimGroup.add(finRightPivot);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.98, 0, 0);
  const tailMesh = new THREE.Mesh(geos.tailGeo, mats.tailMat);
  tailMesh.position.set(-0.28, 0, 0);
  tailPivot.add(tailMesh);
  swimGroup.add(tailPivot);

  [-1, 1].forEach((side) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0.76, 0.14, side * 0.2);
    const sclera = new THREE.Mesh(geos.scleraGeo, geos.scleraMat);
    const pupil = new THREE.Mesh(geos.pupilGeo, geos.pupilMat);
    pupil.position.set(0.03, 0.02, side * 0.045);
    eyeGroup.add(sclera);
    eyeGroup.add(pupil);
    swimGroup.add(eyeGroup);
  });

  [-1, 1].forEach((side) => {
    const barbel = new THREE.Mesh(geos.barbelGeo, mats.barbelMat);
    barbel.position.set(0.98, -0.04, side * 0.14);
    barbel.rotation.z = 0.4;
    barbel.rotation.x = side * 0.55;
    swimGroup.add(barbel);
  });

  const badgePedestal = new THREE.Mesh(geos.pedestalGeo, mats.pedestalMat);
  badgePedestal.position.set(0.08, 0.42, 0);
  swimGroup.add(badgePedestal);

  const badgeTex = createNumberBadgeTexture(
    answerValue,
    palette.border,
    maxAnisotropy,
    isRareGold
  );
  const badgeSpriteMat = new THREE.SpriteMaterial({
    map: badgeTex,
    transparent: true,
    depthTest: false,
  });
  const badgeSprite = new THREE.Sprite(badgeSpriteMat);
  badgeSprite.position.set(0.08, 0.94, 0);
  badgeSprite.scale.set(isRareGold ? 1.45 : 1.32, isRareGold ? 1.45 : 1.32, 1);
  badgeSprite.renderOrder = 25;
  swimGroup.add(badgeSprite);

  let rareHaloMesh: THREE.Mesh | undefined;
  if (isRareGold) {
    const haloGeo = new THREE.TorusGeometry(0.95, 0.05, 8, 28);
    haloGeo.rotateX(Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.85,
    });
    rareHaloMesh = new THREE.Mesh(haloGeo, haloMat);
    rareHaloMesh.position.set(0, 0.12, 0);
    root.add(rareHaloMesh);
  }

  const shadowMat = new THREE.MeshBasicMaterial({
    map: getRadialShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.52,
  });
  const shadowPlane = new THREE.Mesh(geos.shadowGeo, shadowMat);
  shadowPlane.position.set(0, -0.42, 0);
  root.add(shadowPlane);

  const hitbox = new THREE.Mesh(geos.hitboxGeo, geos.hitboxMat);
  hitbox.position.set(0, 0.38, 0);
  hitbox.layers.enable(1);
  swimGroup.add(hitbox);

  return {
    root,
    swimGroup,
    tailPivot,
    finLeftPivot,
    finRightPivot,
    dorsalFin,
    badgeSprite,
    badgePedestal,
    shadowPlane,
    hitbox,
    rareHaloMesh,
  };
}

export function create3DLilyPad(withLotus = true, scale = 1.0): THREE.Group {
  const group = new THREE.Group();

  const padShape = new THREE.Shape();
  const radius = 1.15;
  const notchAngle = 0.28;
  padShape.moveTo(0, 0);
  padShape.absarc(0, 0, radius, notchAngle, Math.PI * 2 - notchAngle, false);
  padShape.lineTo(0, 0);

  const padGeo = new THREE.ExtrudeGeometry(padShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
    curveSegments: 14,
  });
  padGeo.rotateX(Math.PI / 2);

  const padMat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    roughness: 0.65,
    metalness: 0.05,
  });
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.position.y = 0.03;
  group.add(padMesh);

  const shadowGeo = new THREE.PlaneGeometry(2.5, 2.5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMesh = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({
      map: getRadialShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.4,
    })
  );
  shadowMesh.position.y = 0.01;
  group.add(shadowMesh);

  if (withLotus) {
    const lotusGroup = new THREE.Group();
    lotusGroup.position.set(0.15, 0.06, 0.1);

    const petalGeo = new THREE.SphereGeometry(0.24, 8, 6);
    petalGeo.scale(1.6, 0.45, 0.72);

    const outerPetalMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.4,
    });
    const innerPetalMat = new THREE.MeshStandardMaterial({
      color: 0xfda4af,
      roughness: 0.35,
    });

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, outerPetalMat);
      petal.position.set(Math.cos(angle) * 0.25, 0.06, Math.sin(angle) * 0.25);
      petal.rotation.y = -angle;
      petal.rotation.z = 0.35;
      lotusGroup.add(petal);
    }

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3;
      const petal = new THREE.Mesh(petalGeo, innerPetalMat);
      petal.scale.set(0.8, 0.85, 0.8);
      petal.position.set(Math.cos(angle) * 0.16, 0.14, Math.sin(angle) * 0.16);
      petal.rotation.y = -angle;
      petal.rotation.z = 0.72;
      lotusGroup.add(petal);
    }

    const centerGeo = new THREE.SphereGeometry(0.14, 8, 8);
    centerGeo.scale(1, 0.65, 1);
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.3,
    });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    centerMesh.position.y = 0.16;
    lotusGroup.add(centerMesh);

    group.add(lotusGroup);
  }

  group.scale.setScalar(scale);
  return group;
}

export function create3DWoodenBucket(): {
  bucketGroup: THREE.Group;
  caughtTailGroup: THREE.Group;
} {
  const bucketGroup = new THREE.Group();

  // Wooden coaster/platform under the bucket on the grass bank
  const basePadGeo = new THREE.CylinderGeometry(1.05, 1.15, 0.12, 16);
  const basePadMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
  const basePad = new THREE.Mesh(basePadGeo, basePadMat);
  basePad.position.y = -0.04;
  bucketGroup.add(basePad);

  const hullPoints = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.72, 0),
    new THREE.Vector2(0.92, 1.45),
    new THREE.Vector2(0.82, 1.48),
    new THREE.Vector2(0.65, 0.12),
    new THREE.Vector2(0.01, 0.12),
  ];
  const hullGeo = new THREE.LatheGeometry(hullPoints, 16);
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    roughness: 0.65,
    metalness: 0.08,
  });
  const hullMesh = new THREE.Mesh(hullGeo, woodMat);
  bucketGroup.add(hullMesh);

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.35,
    metalness: 0.8,
  });

  const lowerBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.045, 8, 20),
    ironMat
  );
  lowerBand.rotation.x = Math.PI / 2;
  lowerBand.position.y = 0.42;
  bucketGroup.add(lowerBand);

  const upperBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.88, 0.045, 8, 20),
    ironMat
  );
  upperBand.rotation.x = Math.PI / 2;
  upperBand.position.y = 1.15;
  bucketGroup.add(upperBand);

  const handleGeo = new THREE.TorusGeometry(0.88, 0.035, 8, 20, Math.PI);
  const handleMesh = new THREE.Mesh(handleGeo, ironMat);
  handleMesh.position.y = 1.42;
  handleMesh.rotation.z = 0.15;
  bucketGroup.add(handleMesh);

  const waterGeo = new THREE.CircleGeometry(0.82, 16);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.15,
    metalness: 0.1,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = 1.28;
  bucketGroup.add(waterMesh);

  const caughtTailGroup = new THREE.Group();
  caughtTailGroup.position.set(0.15, 1.35, 0);
  caughtTailGroup.visible = false;

  const tailCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35 })
  );
  tailCone.rotation.z = 0.35;
  tailCone.position.y = 0.15;
  caughtTailGroup.add(tailCone);
  bucketGroup.add(caughtTailGroup);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: getRadialShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  shadowPlane.position.y = 0.01;
  bucketGroup.add(shadowPlane);

  return { bucketGroup, caughtTailGroup };
}

export function create3DFishingNet(): THREE.Group {
  const netGroup = new THREE.Group();

  const rimGeo = new THREE.TorusGeometry(0.95, 0.065, 8, 24);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.3,
    metalness: 0.6,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  netGroup.add(rimMesh);

  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = 64;
  gridCanvas.height = 64;
  const gCtx = gridCanvas.getContext('2d')!;
  gCtx.clearRect(0, 0, 64, 64);
  gCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  gCtx.lineWidth = 2;
  for (let i = 0; i <= 64; i += 16) {
    gCtx.beginPath();
    gCtx.moveTo(i, 0);
    gCtx.lineTo(i, 64);
    gCtx.stroke();
    gCtx.beginPath();
    gCtx.moveTo(0, i);
    gCtx.lineTo(64, i);
    gCtx.stroke();
  }
  const gridTex = new THREE.CanvasTexture(gridCanvas);
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.wrapS = THREE.RepeatWrapping;
  gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(3, 2);

  const bagPoints = [
    new THREE.Vector2(0.01, -0.85),
    new THREE.Vector2(0.55, -0.75),
    new THREE.Vector2(0.86, -0.35),
    new THREE.Vector2(0.95, 0),
  ];
  const bagGeo = new THREE.LatheGeometry(bagPoints, 14);
  const bagMat = new THREE.MeshBasicMaterial({
    map: gridTex,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const bagMesh = new THREE.Mesh(bagGeo, bagMat);
  netGroup.add(bagMesh);

  const ferruleGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.35, 8);
  ferruleGeo.rotateX(Math.PI / 2);
  const ferruleMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.3,
    metalness: 0.8,
  });
  const ferruleMesh = new THREE.Mesh(ferruleGeo, ferruleMat);
  ferruleMesh.position.set(0, 0, 1.1);
  netGroup.add(ferruleMesh);

  const handleGeo = new THREE.CylinderGeometry(0.075, 0.09, 2.2, 8);
  handleGeo.rotateX(Math.PI / 2);
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.65,
  });
  const handleMesh = new THREE.Mesh(handleGeo, handleMat);
  handleMesh.position.set(0, 0, 2.25);
  netGroup.add(handleMesh);

  return netGroup;
}

export const POND_RECT = {
  halfW: 6.6,
  zMin: -3.45,
  zMax: 5.35,
  zCenter: 0.95,
  halfD: 4.4,
};

/**
 * Builds the 3D Grassy Land (Sedikit Daratan Hijau Rumput) surrounding the Screen-Filling
 * Rectangular (Kotak) Koi pond, a crisp 3D stone border rim framing the 4 sides inside the screen,
 * compact 3D Rolling Green Hills (Bukit), and decorative 3D Trees along the upper shore.
 */
export function create3DGrassyLandscape(): THREE.Group {
  const landscapeGroup = new THREE.Group();

  // Procedural lush green grass texture
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 256;
  grassCanvas.height = 256;
  const ctx = grassCanvas.getContext('2d')!;
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle grass blade speckles for natural depth
  for (let i = 0; i < 450; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#16a34a' : '#4ade80';
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillRect(x, y, 3, 7);
  }
  const grassTex = new THREE.CanvasTexture(grassCanvas);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.wrapS = THREE.RepeatWrapping;
  grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(8, 8);

  // 1. Daratan Hijau Rumput Sekeliling Kolam Kotak (Outer Meadow with Rectangular Pond Cutout)
  const outerShape = new THREE.Shape();
  outerShape.moveTo(-64, -46);
  outerShape.lineTo(64, -46);
  outerShape.lineTo(64, 46);
  outerShape.lineTo(-64, 46);
  outerShape.closePath();

  // Rectangular pond cutout (Kolam Kotak) with slightly rounded corners
  const hw = POND_RECT.halfW;
  const z0 = POND_RECT.zMin;
  const z1 = POND_RECT.zMax;
  const r = 0.28;

  const pondHole = new THREE.Path();
  pondHole.moveTo(-hw + r, z0);
  pondHole.lineTo(hw - r, z0);
  pondHole.quadraticCurveTo(hw, z0, hw, z0 + r);
  pondHole.lineTo(hw, z1 - r);
  pondHole.quadraticCurveTo(hw, z1, hw - r, z1);
  pondHole.lineTo(-hw + r, z1);
  pondHole.quadraticCurveTo(-hw, z1, -hw, z1 - r);
  pondHole.lineTo(-hw, z0 + r);
  pondHole.quadraticCurveTo(-hw, z0, -hw + r, z0);
  outerShape.holes.push(pondHole);

  const bankGeo = new THREE.ExtrudeGeometry(outerShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.14,
    bevelSegments: 2,
    curveSegments: 16,
  });
  bankGeo.rotateX(Math.PI / 2);

  const grassMat = new THREE.MeshLambertMaterial({
    map: grassTex,
  });
  const grassBankMesh = new THREE.Mesh(bankGeo, grassMat);
  grassBankMesh.position.y = 0.22;
  grassBankMesh.receiveShadow = true;
  landscapeGroup.add(grassBankMesh);

  // 1B. Crisp 3D Rectangular Stone Rim / Coping Frame around the 4 Pond Edges
  const borderWallMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.75,
    metalness: 0.08,
  });
  const cornerPostMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.65,
    metalness: 0.12,
  });

  const rimThickness = 0.34;
  const rimHeight = 0.34;
  const totalW = hw * 2 + rimThickness * 2;
  const totalD = z1 - z0 + rimThickness * 2;

  const horizBeamGeo = new THREE.BoxGeometry(totalW, rimHeight, rimThickness);
  const vertBeamGeo = new THREE.BoxGeometry(rimThickness, rimHeight, totalD);

  // Back (North) & Front (South) stone coping beams
  const northBeam = new THREE.Mesh(horizBeamGeo, borderWallMat);
  northBeam.position.set(0, 0.18, z0 - rimThickness * 0.35);
  landscapeGroup.add(northBeam);

  const southBeam = new THREE.Mesh(horizBeamGeo, borderWallMat);
  southBeam.position.set(0, 0.18, z1 + rimThickness * 0.35);
  landscapeGroup.add(southBeam);

  // Left (West) & Right (East) stone coping beams
  const westBeam = new THREE.Mesh(vertBeamGeo, borderWallMat);
  westBeam.position.set(-hw - rimThickness * 0.35, 0.18, POND_RECT.zCenter);
  landscapeGroup.add(westBeam);

  const eastBeam = new THREE.Mesh(vertBeamGeo, borderWallMat);
  eastBeam.position.set(hw + rimThickness * 0.35, 0.18, POND_RECT.zCenter);
  landscapeGroup.add(eastBeam);

  // 4 Corner Stone Pillars marking the rectangular pond corners clearly inside the screen
  const cornerGeo = new THREE.BoxGeometry(0.5, 0.44, 0.5);
  const corners: [number, number][] = [
    [-hw - 0.12, z0 - 0.12],
    [hw + 0.12, z0 - 0.12],
    [-hw - 0.12, z1 + 0.12],
    [hw + 0.12, z1 + 0.12],
  ];
  corners.forEach(([cx, cz]) => {
    const post = new THREE.Mesh(cornerGeo, cornerPostMat);
    post.position.set(cx, 0.24, cz);
    landscapeGroup.add(post);
  });

  // 2. Rolling Green Hills (Bukit Hijau di Tepi Atas Layar di Belakang Daratan Ember)
  const hillConfigs = [
    { x: -10, y: -0.5, z: -7.5, sx: 8.5, sy: 2.3, sz: 2.8, color: 0x16a34a },
    { x: 0, y: -0.5, z: -8.1, sx: 10.5, sy: 2.6, sz: 3.0, color: 0x15803d },
    { x: 10, y: -0.5, z: -7.5, sx: 8.5, sy: 2.4, sz: 2.8, color: 0x22c55e },
    { x: -18, y: -0.5, z: -7.2, sx: 7.5, sy: 2.1, sz: 2.6, color: 0x15803d },
    { x: 18, y: -0.5, z: -7.2, sx: 7.5, sy: 2.1, sz: 2.6, color: 0x16a34a },
  ];
  const hillSphereGeo = new THREE.SphereGeometry(1, 16, 12);
  hillConfigs.forEach((hc) => {
    const hillMat = new THREE.MeshLambertMaterial({ color: hc.color });
    const hill = new THREE.Mesh(hillSphereGeo, hillMat);
    hill.position.set(hc.x, hc.y, hc.z);
    hill.scale.set(hc.sx, hc.sy, hc.sz);
    landscapeGroup.add(hill);
  });

  // 3. Decorative 3D Trees Along the Compact Upper Grassy Shore (z = -5.6 to -6.1)
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.21, 0.95, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
  const crownGeo = new THREE.ConeGeometry(0.82, 1.65, 8);
  const crownMat1 = new THREE.MeshLambertMaterial({ color: 0x15803d });
  const crownMat2 = new THREE.MeshLambertMaterial({ color: 0x22c55e });

  const treePositions = [
    { x: -5.8, z: -5.6, scale: 0.74 },
    { x: -2.8, z: -5.9, scale: 0.68 },
    { x: 6.0, z: -5.6, scale: 0.74 },
  ];

  treePositions.forEach((tp, idx) => {
    const tree = new THREE.Group();
    tree.position.set(tp.x, 0.22, tp.z);

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.48;
    tree.add(trunk);

    const lowCrown = new THREE.Mesh(crownGeo, crownMat1);
    lowCrown.position.y = 1.25;
    tree.add(lowCrown);

    const topCrown = new THREE.Mesh(crownGeo, crownMat2);
    topCrown.position.y = 1.95;
    topCrown.scale.setScalar(0.76);
    tree.add(topCrown);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: getRadialShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.4,
      })
    );
    shadow.position.y = 0.02;
    tree.add(shadow);

    tree.scale.setScalar(tp.scale);
    tree.rotation.y = idx * 1.1;
    landscapeGroup.add(tree);
  });

  return landscapeGroup;
}

/**
 * Builds Fluffy 3D White Clouds (Awan 3D) framed in the top sky strip of the screen
 */
export function create3DClouds(): THREE.Group[] {
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });

  const cloudConfigs = [
    { x: -8.5, y: 2.8, z: -9.2, scale: 0.72 },
    { x: -1.5, y: 3.1, z: -9.8, scale: 0.82 },
    { x: 6.5, y: 2.8, z: -9.2, scale: 0.72 },
    { x: 13.5, y: 3.0, z: -9.5, scale: 0.76 },
    { x: -14.5, y: 2.9, z: -9.5, scale: 0.74 },
  ];

  return cloudConfigs.map((cfg) => {
    const cloudGroup = new THREE.Group();
    cloudGroup.position.set(cfg.x, cfg.y, cfg.z);

    const p1 = new THREE.Mesh(puffGeo, cloudMat);
    p1.scale.set(1.8, 1.0, 1.1);
    cloudGroup.add(p1);

    const p2 = new THREE.Mesh(puffGeo, cloudMat);
    p2.position.set(-1.2, -0.15, 0.1);
    p2.scale.set(1.2, 0.78, 0.9);
    cloudGroup.add(p2);

    const p3 = new THREE.Mesh(puffGeo, cloudMat);
    p3.position.set(1.25, -0.1, -0.1);
    p3.scale.set(1.3, 0.82, 0.95);
    cloudGroup.add(p3);

    cloudGroup.scale.setScalar(cfg.scale);
    return cloudGroup;
  });
}
