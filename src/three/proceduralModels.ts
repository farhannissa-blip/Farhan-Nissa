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

  // 1. Koi Body Lathe (16 segments instead of 28 -> 45% fewer vertices, looks identical)
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

  // 2. Dorsal Fin
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

  // 3. Pectoral Fin
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

  // 4. Tail Fin
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

  // 5. Eyes, Barbels, Pedestal, Shadow, Hitbox
  const scleraGeo = new THREE.SphereGeometry(0.085, 8, 8);
  const pupilGeo = new THREE.SphereGeometry(0.052, 8, 8);
  const barbelGeo = new THREE.CylinderGeometry(0.008, 0.022, 0.22, 6);
  const pedestalGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16);
  const shadowGeo = new THREE.PlaneGeometry(2.4, 1.15);
  shadowGeo.rotateX(-Math.PI / 2);

  // Extra generous hitbox for mobile touch & classroom PID smartboards
  const hitboxGeo = new THREE.BoxGeometry(2.85, 2.0, 1.85);

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

  // 256x128 is crisp on mobile & desktop while using 4x less VRAM than 512x256
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

  // Subtle scale shimmer
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

  const bodyMat = new THREE.MeshStandardMaterial({
    map: skinTex,
    roughness: 0.24,
    metalness: 0.08,
  });

  const finMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.fin),
    roughness: 0.45,
    metalness: 0.05,
  });

  const tailMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.tail),
    roughness: 0.48,
    metalness: 0.05,
  });

  const barbelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.spot1),
    roughness: 0.4,
  });

  const pedestalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.border),
    roughness: 0.28,
    metalness: 0.3,
  });

  const mats = { bodyMat, finMat, tailMat, barbelMat, pedestalMat };
  cachedPaletteMaterials.set(palette.name, mats);
  return mats;
}

export function createNumberBadgeTexture(
  value: number,
  borderColor: string,
  indexKey: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const cacheKey = `${value}_${borderColor}_${indexKey}`;
  const existing = cachedBadgeTextures.get(cacheKey);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 192, 192);

  // Main circular medallion
  ctx.beginPath();
  ctx.arc(96, 96, 74, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Thick colored rim
  ctx.beginPath();
  ctx.arc(96, 96, 70, 0, Math.PI * 2);
  ctx.lineWidth = 11;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  // Number text
  const textStr = String(value);
  ctx.fillStyle = '#0f172a';
  ctx.font =
    textStr.length >= 3
      ? '900 64px "Fredoka", "Plus Jakarta Sans", sans-serif'
      : '900 76px "Fredoka", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(textStr, 96, 100);

  // Small shortcut number badge (1-6)
  ctx.beginPath();
  ctx.arc(148, 42, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#0284c7';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 18px "JetBrains Mono", monospace';
  ctx.fillText(String(indexKey), 148, 43);

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
}

/**
 * Builds a composite 11-part 3D Koi Fish model (`THREE.Group`)
 * reusing shared geometries & cached textures so spawning has zero GPU stutter on mobile/PID.
 */
export function create3DKoiFish(
  palette: KoiPalette,
  answerValue: number,
  shortcutIndex: number,
  maxAnisotropy: number,
  enableShadows = false
): Koi3DComponents {
  const geos = getSharedKoiGeometries();
  const mats = getPaletteMaterials(palette, maxAnisotropy);

  const root = new THREE.Group();
  const swimGroup = new THREE.Group();
  root.add(swimGroup);

  // 1. Primary Silhouette: Organic Koi Body
  const bodyMesh = new THREE.Mesh(geos.bodyGeo, mats.bodyMat);
  bodyMesh.castShadow = enableShadows;
  swimGroup.add(bodyMesh);

  // 2. Dorsal Fin
  const dorsalFin = new THREE.Mesh(geos.dorsalGeo, mats.finMat);
  dorsalFin.position.set(-0.08, 0.38, 0);
  swimGroup.add(dorsalFin);

  // 3 & 4. Articulated Left & Right Pectoral Fins
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

  // 5. Articulated Caudal (Tail) Fin
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.98, 0, 0);
  const tailMesh = new THREE.Mesh(geos.tailGeo, mats.tailMat);
  tailMesh.position.set(-0.28, 0, 0);
  tailPivot.add(tailMesh);
  swimGroup.add(tailPivot);

  // 6 & 7. 3D Eyes
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

  // 8 & 9. Koi Barbels
  [-1, 1].forEach((side) => {
    const barbel = new THREE.Mesh(geos.barbelGeo, mats.barbelMat);
    barbel.position.set(0.98, -0.04, side * 0.14);
    barbel.rotation.z = 0.4;
    barbel.rotation.x = side * 0.55;
    swimGroup.add(barbel);
  });

  // 10. Floating 3D Number Medallion Ring & Upright Billboard Sprite
  const badgePedestal = new THREE.Mesh(geos.pedestalGeo, mats.pedestalMat);
  badgePedestal.position.set(0.08, 0.42, 0);
  swimGroup.add(badgePedestal);

  const badgeTex = createNumberBadgeTexture(
    answerValue,
    palette.border,
    shortcutIndex,
    maxAnisotropy
  );
  const badgeSpriteMat = new THREE.SpriteMaterial({
    map: badgeTex,
    transparent: true,
    depthTest: false,
  });
  const badgeSprite = new THREE.Sprite(badgeSpriteMat);
  badgeSprite.position.set(0.08, 0.94, 0);
  badgeSprite.scale.set(1.32, 1.32, 1);
  badgeSprite.renderOrder = 25;
  swimGroup.add(badgeSprite);

  // 11. Underwater Contact Shadow Plane
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getRadialShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.52,
  });
  const shadowPlane = new THREE.Mesh(geos.shadowGeo, shadowMat);
  shadowPlane.position.set(0, -0.42, 0);
  root.add(shadowPlane);

  // 12. Generous Hitbox
  const hitbox = new THREE.Mesh(geos.hitboxGeo, geos.hitboxMat);
  hitbox.position.set(0, 0.35, 0);
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
  };
}

/**
 * Builds a lightweight composite 6-part 3D Blooming Lotus & Lily Pad (`THREE.Group`)
 */
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

/**
 * Builds a composite 6-part 3D Wooden Fish Bucket (`THREE.Group`)
 */
export function create3DWoodenBucket(): {
  bucketGroup: THREE.Group;
  caughtTailGroup: THREE.Group;
} {
  const bucketGroup = new THREE.Group();

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
    roughness: 0.7,
    metalness: 0.08,
  });
  const hullMesh = new THREE.Mesh(hullGeo, woodMat);
  bucketGroup.add(hullMesh);

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
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
    new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: getRadialShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    })
  );
  shadowPlane.position.y = 0.02;
  bucketGroup.add(shadowPlane);

  return { bucketGroup, caughtTailGroup };
}

/**
 * Builds a composite 4-part 3D Fishing Net Scoop (`THREE.Group`)
 */
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
