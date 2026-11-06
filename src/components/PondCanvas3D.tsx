import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  KOI_PALETTES,
  RARE_GOLD_PALETTE,
  POND_RECT,
  Koi3DComponents,
  KoiPalette,
  create3DKoiFish,
  create3DLilyPad,
  create3DWoodenBucket,
  create3DFishingNet,
  create3DGrassyLandscape,
  create3DClouds,
} from '../three/proceduralModels';
import { audioEngine } from '../services/audioEngine';

export type CameraPreset = 'angled' | 'top' | 'closeup';
export type PerformanceMode = 'lite' | 'hd';

export interface FishSpawnItem {
  id: number;
  answer: number;
  paletteIndex: number;
  isRareGold?: boolean;
}

export interface PondCanvas3DHandle {
  spawnTutorialFish: () => void;
  spawnQuestionFish: (items: FishSpawnItem[], level: number) => void;
  triggerCatchByIndex: (index: number) => void;
  triggerBucketCelebration: (
    totalCaught: number,
    comboStreak?: number,
    isRareGold?: boolean
  ) => void;
  triggerMistakeShake: () => void;
}

interface PondCanvas3DProps {
  gameState: 'title' | 'tutorial' | 'playing' | 'paused' | 'gameover';
  cameraPreset: CameraPreset;
  performanceMode: PerformanceMode;
  tutorialPointerRef?: React.RefObject<HTMLDivElement | null>;
  onFishClicked: (
    answer: number,
    screenX: number,
    screenY: number,
    fishIndex: number,
    isRareGold?: boolean
  ) => number | boolean;
  onTimeTick: (dt: number) => void;
}

interface ActiveKoiEntity {
  id: number;
  answer: number;
  index: number;
  palette: KoiPalette;
  model: Koi3DComponents;
  x: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  targetScale: number;
  spawnElapsed: number;
  wanderPhase: number;
  swimCycle: number;
  isJumping: boolean;
  jumpTime: number;
  jumpDuration: number;
  jumpCooldown: number;
  caught: boolean;
  isTutorialTarget?: boolean;
  isRareGold?: boolean;
  sparkleTimer?: number;
}

interface FlyingFishArc {
  group: THREE.Group;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  elapsed: number;
  duration: number;
}

interface WaterRingEffect {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
  startScale: number;
  maxScale: number;
  initialOpacity: number;
}

interface SplashDroplet {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  elapsed: number;
  duration: number;
}

interface CelebrationParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  elapsed: number;
  duration: number;
  baseScale: number;
  isStar: boolean;
}

type RippleType = 'spawn' | 'catch' | 'touch';

// Module-scope reusable scratch objects (Zero GC in requestAnimationFrame)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3Proj = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNDC = new THREE.Vector2();
const _waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3();
const _dummyEuler = new THREE.Euler();
const _dummyColor = new THREE.Color();

let sharedRipplePlaneGeo: THREE.BufferGeometry | null = null;
let sharedRippleTexture: THREE.CanvasTexture | null = null;
let sharedDropGeo: THREE.BufferGeometry | null = null;
let sharedDropMat: THREE.MeshBasicMaterial | null = null;
let sharedStarGeo: THREE.BufferGeometry | null = null;
let sharedConfettiGeo: THREE.BufferGeometry | null = null;
let sharedGoldGemGeo: THREE.BufferGeometry | null = null;
let sharedCelebrationMats: THREE.MeshStandardMaterial[] | null = null;
let sharedRareGoldMats: THREE.MeshStandardMaterial[] | null = null;

function getSharedEffectAssets() {
  if (!sharedRipplePlaneGeo) {
    sharedRipplePlaneGeo = new THREE.PlaneGeometry(1.0, 1.0);
    sharedRipplePlaneGeo.rotateX(-Math.PI / 2);
  }
  if (!sharedRippleTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);

    const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.52, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(0.62, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.76, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.88, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.96, 'rgba(255, 255, 255, 0.3)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    sharedRippleTexture = new THREE.CanvasTexture(canvas);
    sharedRippleTexture.colorSpace = THREE.SRGBColorSpace;
  }
  if (!sharedDropGeo) {
    sharedDropGeo = new THREE.SphereGeometry(0.075, 6, 6);
  }
  if (!sharedDropMat) {
    sharedDropMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
  }
  if (!sharedStarGeo) {
    const starShape = new THREE.Shape();
    const spikes = 5;
    const outerR = 0.24;
    const innerR = 0.1;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();
    sharedStarGeo = new THREE.ExtrudeGeometry(starShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 1,
    });
    sharedStarGeo.center();
  }
  if (!sharedConfettiGeo) {
    sharedConfettiGeo = new THREE.PlaneGeometry(0.24, 0.14);
  }
  if (!sharedGoldGemGeo) {
    sharedGoldGemGeo = new THREE.OctahedronGeometry(0.18, 0);
  }
  if (!sharedCelebrationMats) {
    const colors = [
      0xfacc15, // Gold Star
      0xf43f5e, // Rose Pink
      0x38bdf8, // Sky Cyan
      0x4ade80, // Emerald Green
      0xa855f7, // Vivid Purple
      0xfb923c, // Bright Orange
    ];
    sharedCelebrationMats = colors.map(
      (col, idx) =>
        new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: idx === 0 ? 0.35 : 0.2,
          roughness: 0.25,
          metalness: idx === 0 ? 0.45 : 0.1,
          side: THREE.DoubleSide,
        })
    );
  }
  if (!sharedRareGoldMats) {
    // Ultra-bright radiant 24K gold & white-gold materials for Rare Golden Koi particle burst
    const goldConfigs = [
      { color: 0xfef08a, emissive: 0xfde047, intensity: 0.95 }, // Radiant White-Gold
      { color: 0xfacc15, emissive: 0xfacc15, intensity: 0.85 }, // Pure 24K Gold
      { color: 0xffffff, emissive: 0xfef08a, intensity: 1.05 }, // Sunburst Diamond Gold
      { color: 0xf59e0b, emissive: 0xfbbf24, intensity: 0.8 },  // Warm Royal Gold
    ];
    sharedRareGoldMats = goldConfigs.map(
      (cfg) =>
        new THREE.MeshStandardMaterial({
          color: cfg.color,
          emissive: cfg.emissive,
          emissiveIntensity: cfg.intensity,
          roughness: 0.1,
          metalness: 0.78,
          side: THREE.DoubleSide,
        })
    );
  }
  return {
    ripplePlaneGeo: sharedRipplePlaneGeo,
    rippleTex: sharedRippleTexture,
    dropGeo: sharedDropGeo,
    dropMat: sharedDropMat,
    starGeo: sharedStarGeo,
    confettiGeo: sharedConfettiGeo,
    goldGemGeo: sharedGoldGemGeo,
    celebrationMats: sharedCelebrationMats,
    rareGoldMats: sharedRareGoldMats,
  };
}

const MAX_SHADER_RIPPLES = 8;

// Camera presets framed so the rectangular pond fills the screen without exceeding screen boundaries,
// leaving a compact strip of green grassy land at the top for the wooden bucket and a slim sky/hills horizon
const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; lookAt: [number, number, number] }
> = {
  angled: { pos: [0, 14.8, 7.2], lookAt: [0, -0.1, 0.45] },
  top: { pos: [0, 16.5, 2.0], lookAt: [0, 0, 0.55] },
  closeup: { pos: [0, 13.4, 6.6], lookAt: [0, -0.1, 0.55] },
};

const isSoftwareGl = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

export const PondCanvas3D = forwardRef<PondCanvas3DHandle, PondCanvas3DProps>(
  (
    {
      gameState,
      cameraPreset,
      performanceMode,
      tutorialPointerRef,
      onFishClicked,
      onTimeTick,
    },
    ref
  ) => {
    const mountRef = useRef<HTMLDivElement | null>(null);

    const gameStateRef = useRef(gameState);
    gameStateRef.current = gameState;

    const cameraPresetRef = useRef(cameraPreset);
    cameraPresetRef.current = cameraPreset;

    const performanceModeRef = useRef(performanceMode);
    performanceModeRef.current = performanceMode;

    const tutorialPointerDomRef = useRef(tutorialPointerRef);
    tutorialPointerDomRef.current = tutorialPointerRef;

    const onFishClickedRef = useRef(onFishClicked);
    onFishClickedRef.current = onFishClicked;

    const onTimeTickRef = useRef(onTimeTick);
    onTimeTickRef.current = onTimeTick;

    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
    const fishGroupRef = useRef<THREE.Group | null>(null);
    const effectsGroupRef = useRef<THREE.Group | null>(null);
    const tutorialIndicatorRef = useRef<{
      root: THREE.Group;
      ring: THREE.Mesh;
      arrow: THREE.Group;
    } | null>(null);
    const activeKoiRef = useRef<ActiveKoiEntity[]>([]);
    const flyingFishRef = useRef<FlyingFishArc[]>([]);
    const waterRingsRef = useRef<WaterRingEffect[]>([]);
    const dropletsRef = useRef<SplashDroplet[]>([]);
    const celebrationParticlesRef = useRef<CelebrationParticle[]>([]);
    const shaderRipplesRef = useRef<THREE.Vector4[]>(
      Array.from({ length: MAX_SHADER_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0))
    );
    const nextRippleSlotRef = useRef<number>(0);

    const bucketObjRef = useRef<{
      bucketGroup: THREE.Group;
      caughtTailGroup: THREE.Group;
      bounceTime: number;
    } | null>(null);
    const netObjRef = useRef<{
      group: THREE.Group;
      active: boolean;
      elapsed: number;
      duration: number;
      x: number;
      z: number;
    } | null>(null);
    const shakeTimeRef = useRef<number>(0);
    const maxAnisotropyRef = useRef<number>(1);
    const pondScaleXRef = useRef<number>(1.0);
    const camDistFactorRef = useRef<number>(1.0);
    const swimBoundsRef = useRef<{
      x: number;
      zMin: number;
      zMax: number;
      zCenter: number;
      rx: number;
      rz: number;
    }>({
      x: 5.5,
      zMin: -2.6,
      zMax: 3.3,
      zCenter: POND_RECT.zCenter,
      rx: POND_RECT.halfW,
      rz: POND_RECT.halfD,
    });

    useEffect(() => {
      const renderer = rendererRef.current;
      const sunLight = sunLightRef.current;
      if (!renderer) return;

      const isLite = performanceMode === 'lite' || isSoftwareGl;
      const targetDpr = isLite
        ? Math.min(window.devicePixelRatio || 1, 1.15)
        : Math.min(window.devicePixelRatio || 1, 1.75);

      renderer.setPixelRatio(targetDpr);
      renderer.shadowMap.enabled = !isLite;
      if (sunLight) {
        sunLight.castShadow = !isLite;
      }
    }, [performanceMode]);

    const triggerSurfaceWaveImpulse = (x: number, z: number, strength = 1.0) => {
      const idx = nextRippleSlotRef.current % MAX_SHADER_RIPPLES;
      nextRippleSlotRef.current++;
      shaderRipplesRef.current[idx].set(x, 0.001, z, strength);
    };

    const spawn3DWaterRipple = (
      x: number,
      z: number,
      type: RippleType = 'touch'
    ) => {
      const effectsGroup = effectsGroupRef.current;
      if (!effectsGroup) return;

      const { ripplePlaneGeo, rippleTex } = getSharedEffectAssets();
      const isLite = performanceModeRef.current === 'lite';

      const waveStrength =
        type === 'catch' ? 1.85 : type === 'spawn' ? 1.15 : 0.9;
      triggerSurfaceWaveImpulse(x, z, waveStrength);

      if (type === 'catch') {
        const count = isLite ? 2 : 3;
        const colors = [0xfde047, 0x7dd3fc, 0xffffff];
        for (let i = 0; i < count; i++) {
          const ringMat = new THREE.MeshBasicMaterial({
            map: rippleTex,
            color: colors[i % colors.length],
            transparent: true,
            opacity: 0.95 - i * 0.15,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const ringMesh = new THREE.Mesh(ripplePlaneGeo, ringMat);
          ringMesh.position.set(x, 0.03 + i * 0.004, z);
          effectsGroup.add(ringMesh);

          waterRingsRef.current.push({
            mesh: ringMesh,
            mat: ringMat,
            elapsed: -i * 0.11,
            duration: 0.88 + i * 0.12,
            startScale: 0.65,
            maxScale: 4.8 + i * 1.1,
            initialOpacity: 0.95 - i * 0.15,
          });
        }
      } else if (type === 'spawn') {
        const count = isLite ? 1 : 2;
        for (let i = 0; i < count; i++) {
          const ringMat = new THREE.MeshBasicMaterial({
            map: rippleTex,
            color: i === 0 ? 0xe0f2fe : 0x7dd3fc,
            transparent: true,
            opacity: 0.85 - i * 0.2,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const ringMesh = new THREE.Mesh(ripplePlaneGeo, ringMat);
          ringMesh.position.set(x, 0.028 + i * 0.004, z);
          effectsGroup.add(ringMesh);

          waterRingsRef.current.push({
            mesh: ringMesh,
            mat: ringMat,
            elapsed: -i * 0.12,
            duration: 0.78,
            startScale: 0.5,
            maxScale: 3.6 + i * 0.8,
            initialOpacity: 0.85 - i * 0.2,
          });
        }
      } else {
        const ringMat = new THREE.MeshBasicMaterial({
          map: rippleTex,
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const ringMesh = new THREE.Mesh(ripplePlaneGeo, ringMat);
        ringMesh.position.set(x, 0.025, z);
        effectsGroup.add(ringMesh);

        waterRingsRef.current.push({
          mesh: ringMesh,
          mat: ringMat,
          elapsed: 0,
          duration: 0.65,
          startScale: 0.45,
          maxScale: 3.2,
          initialOpacity: 0.78,
        });
      }
    };

    const spawn3DSplashDroplets = (x: number, z: number, count = 6) => {
      const effectsGroup = effectsGroupRef.current;
      if (!effectsGroup) return;
      const { dropGeo, dropMat } = getSharedEffectAssets();
      const actualCount =
        performanceModeRef.current === 'lite'
          ? Math.min(count, 4)
          : count;

      for (let i = 0; i < actualCount; i++) {
        const mesh = new THREE.Mesh(dropGeo, dropMat);
        mesh.position.set(x, 0.15, z);
        const angle =
          (i / actualCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const speed = 2.0 + Math.random() * 2.2;
        effectsGroup.add(mesh);

        dropletsRef.current.push({
          mesh,
          vx: Math.cos(angle) * speed,
          vy: 4.2 + Math.random() * 2.8,
          vz: Math.sin(angle) * speed,
          elapsed: 0,
          duration: 0.5,
        });
      }
    };

    // Spawns festive 3D spinning gold/rainbow stars & fluttering confetti when comboStreak >= 3
    const spawn3DCelebrationBurst = (
      x: number,
      y: number,
      z: number,
      comboStreak: number
    ) => {
      const effectsGroup = effectsGroupRef.current;
      if (!effectsGroup) return;

      const { starGeo, confettiGeo, celebrationMats } = getSharedEffectAssets();
      const isLite = performanceModeRef.current === 'lite';
      const baseCount = isLite ? 14 : 22;
      const bonusCount = Math.min((comboStreak - 3) * 3, 12);
      const totalCount = baseCount + Math.max(0, bonusCount);

      for (let i = 0; i < totalCount; i++) {
        const isStar = i % 2 === 0;
        const mat = isStar
          ? celebrationMats[i % 2 === 0 ? 0 : i % celebrationMats.length]
          : celebrationMats[(i + 1) % celebrationMats.length];

        const mesh = new THREE.Mesh(isStar ? starGeo : confettiGeo, mat);
        mesh.position.set(
          x + (Math.random() - 0.5) * 0.4,
          y + Math.random() * 0.3,
          z + (Math.random() - 0.5) * 0.4
        );
        mesh.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );

        const angle =
          (i / totalCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = 1.8 + Math.random() * 3.2;
        const baseScale = isStar
          ? 0.95 + Math.random() * 0.55
          : 0.85 + Math.random() * 0.5;
        mesh.scale.setScalar(baseScale);
        effectsGroup.add(mesh);

        celebrationParticlesRef.current.push({
          mesh,
          vx: Math.cos(angle) * speed,
          vy: 4.6 + Math.random() * 3.8,
          vz: Math.sin(angle) * speed,
          rx: (Math.random() - 0.5) * 10,
          ry: (Math.random() - 0.5) * 12,
          rz: (Math.random() - 0.5) * 10,
          elapsed: 0,
          duration: 1.05 + Math.random() * 0.45,
          baseScale,
          isStar,
        });
      }
    };

    // Spawns an ultra-bright, radiant 24K golden particle & sunburst ring explosion when catching a Rare Golden Koi!
    const spawn3DRareGoldBurst = (x: number, y: number, z: number) => {
      const effectsGroup = effectsGroupRef.current;
      if (!effectsGroup) return;

      const {
        starGeo,
        goldGemGeo,
        rareGoldMats,
        ripplePlaneGeo,
        rippleTex,
      } = getSharedEffectAssets();
      const isLite = performanceModeRef.current === 'lite';
      const totalCount = isLite ? 20 : 32;

      triggerSurfaceWaveImpulse(x, z, 2.4);

      // 1. Radiant expanding golden water shockwave rings
      const ringColors = [0xfef08a, 0xfacc15, 0xf59e0b];
      for (let i = 0; i < 3; i++) {
        const ringMat = new THREE.MeshBasicMaterial({
          map: rippleTex,
          color: ringColors[i],
          transparent: true,
          opacity: 1.0 - i * 0.12,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const ringMesh = new THREE.Mesh(ripplePlaneGeo, ringMat);
        ringMesh.position.set(x, 0.04 + i * 0.005, z);
        effectsGroup.add(ringMesh);

        waterRingsRef.current.push({
          mesh: ringMesh,
          mat: ringMat,
          elapsed: -i * 0.09,
          duration: 1.05 + i * 0.15,
          startScale: 0.85,
          maxScale: 6.2 + i * 1.4,
          initialOpacity: 1.0 - i * 0.12,
        });
      }

      // 2. Dazzling 3D Golden Stars & Diamond-Cut Gold Gems fountain
      for (let i = 0; i < totalCount; i++) {
        const isStar = i % 3 !== 2;
        const mat = rareGoldMats[i % rareGoldMats.length];
        const mesh = new THREE.Mesh(isStar ? starGeo : goldGemGeo, mat);

        mesh.position.set(
          x + (Math.random() - 0.5) * 0.5,
          y + Math.random() * 0.4,
          z + (Math.random() - 0.5) * 0.5
        );
        mesh.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );

        const angle =
          (i / totalCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const speed = 2.2 + Math.random() * 4.0;
        const baseScale = isStar
          ? 1.15 + Math.random() * 0.65
          : 1.05 + Math.random() * 0.55;
        mesh.scale.setScalar(baseScale);
        effectsGroup.add(mesh);

        celebrationParticlesRef.current.push({
          mesh,
          vx: Math.cos(angle) * speed,
          vy: 5.5 + Math.random() * 4.5,
          vz: Math.sin(angle) * speed,
          rx: (Math.random() - 0.5) * 12,
          ry: (Math.random() - 0.5) * 14,
          rz: (Math.random() - 0.5) * 12,
          elapsed: 0,
          duration: 1.25 + Math.random() * 0.5,
          baseScale,
          isStar: true,
        });
      }
    };

    // Subtle rising golden shimmer particles while a Rare Golden Koi swims in the pond
    const spawnRareGoldTrailSparkle = (x: number, z: number) => {
      const effectsGroup = effectsGroupRef.current;
      if (!effectsGroup) return;

      const { starGeo, goldGemGeo, rareGoldMats } = getSharedEffectAssets();
      const mat = rareGoldMats[Math.floor(Math.random() * rareGoldMats.length)];
      const isStar = Math.random() > 0.35;
      const mesh = new THREE.Mesh(isStar ? starGeo : goldGemGeo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.7,
        0.18,
        z + (Math.random() - 0.5) * 0.7
      );
      const baseScale = 0.52 + Math.random() * 0.35;
      mesh.scale.setScalar(baseScale);
      effectsGroup.add(mesh);

      celebrationParticlesRef.current.push({
        mesh,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 1.9 + Math.random() * 1.1,
        vz: (Math.random() - 0.5) * 0.6,
        rx: (Math.random() - 0.5) * 6,
        ry: (Math.random() - 0.5) * 8,
        rz: (Math.random() - 0.5) * 6,
        elapsed: 0,
        duration: 0.65,
        baseScale,
        isStar: true,
      });
    };

    const trigger3DNetScoop = (x: number, z: number) => {
      if (!netObjRef.current) return;
      netObjRef.current.active = true;
      netObjRef.current.elapsed = 0;
      netObjRef.current.x = x;
      netObjRef.current.z = z;
      netObjRef.current.group.visible = true;
    };

    const launchKoiIntoBucket = (koi: ActiveKoiEntity) => {
      const effectsGroup = effectsGroupRef.current;
      const bucket = bucketObjRef.current;
      if (!effectsGroup || !bucket) return;

      const flyingClone = create3DKoiFish(
        koi.palette,
        koi.answer,
        koi.index + 1,
        maxAnisotropyRef.current,
        false,
        Boolean(koi.isRareGold)
      );
      flyingClone.badgeSprite.visible = false;
      flyingClone.badgePedestal.visible = false;
      flyingClone.shadowPlane.visible = false;
      if (flyingClone.rareHaloMesh) {
        flyingClone.rareHaloMesh.visible = false;
      }
      flyingClone.root.position.set(koi.x, 0.2, koi.z);
      effectsGroup.add(flyingClone.root);

      const endPos = new THREE.Vector3(
        bucket.bucketGroup.position.x,
        bucket.bucketGroup.position.y + 1.35,
        bucket.bucketGroup.position.z
      );

      flyingFishRef.current.push({
        group: flyingClone.root,
        startPos: new THREE.Vector3(koi.x, 0.2, koi.z),
        endPos,
        elapsed: 0,
        duration: 0.62,
      });
    };

    const handleKoiInteraction = (koi: ActiveKoiEntity) => {
      if (
        koi.caught ||
        (gameStateRef.current !== 'playing' &&
          gameStateRef.current !== 'tutorial')
      )
        return;

      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      let screenX = window.innerWidth / 2;
      let screenY = window.innerHeight / 2;

      if (camera && renderer) {
        _vec3Proj.set(koi.x, 0.6, koi.z);
        _vec3Proj.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        screenX = ((_vec3Proj.x + 1) / 2) * rect.width + rect.left;
        screenY = ((-_vec3Proj.y + 1) / 2) * rect.height + rect.top;
      }

      trigger3DNetScoop(koi.x, koi.z);

      const isTutorial = gameStateRef.current === 'tutorial';
      const clickResult = onFishClickedRef.current(
        koi.answer,
        screenX,
        screenY,
        koi.index,
        Boolean(koi.isRareGold)
      );
      const comboCount =
        typeof clickResult === 'number'
          ? clickResult
          : clickResult
          ? 1
          : 0;
      const isCorrect = comboCount > 0;

      if (isCorrect) {
        spawn3DWaterRipple(koi.x, koi.z, 'catch');
        spawn3DSplashDroplets(koi.x, koi.z, koi.isRareGold ? 14 : 9);

        if (koi.isRareGold) {
          spawn3DRareGoldBurst(koi.x, 0.45, koi.z);
        } else if (comboCount >= 3 || isTutorial) {
          spawn3DCelebrationBurst(koi.x, 0.35, koi.z, Math.max(comboCount, 4));
        }

        if (tutorialIndicatorRef.current) {
          tutorialIndicatorRef.current.root.visible = false;
        }
        const ptrEl = tutorialPointerDomRef.current?.current;
        if (ptrEl) {
          ptrEl.style.opacity = '0';
        }

        koi.caught = true;
        koi.model.root.visible = false;
        activeKoiRef.current.forEach((f) => {
          f.caught = true;
        });
        launchKoiIntoBucket(koi);
      } else if (isTutorial) {
        // In tutorial mode, wrong fish does not sink or cost a life so student can try again immediately
        spawn3DWaterRipple(koi.x, koi.z, 'touch');
        spawn3DSplashDroplets(koi.x, koi.z, 4);
      } else {
        spawn3DWaterRipple(koi.x, koi.z, 'touch');
        spawn3DSplashDroplets(koi.x, koi.z, 5);
        koi.caught = true;
        koi.model.swimGroup.position.y = -0.65;
        koi.model.badgeSprite.material.opacity = 0.35;
      }
    };

    useImperativeHandle(ref, () => ({
      spawnTutorialFish: () => {
        const fishGroup = fishGroupRef.current;
        if (!fishGroup) return;

        while (fishGroup.children.length > 0) {
          const child = fishGroup.children[0];
          fishGroup.remove(child);
        }
        activeKoiRef.current = [];

        const isPortrait = window.innerWidth < window.innerHeight;
        const isTablet =
          window.innerWidth >= 600 && window.innerWidth < 1100;
        const fishScale = isPortrait ? 1.12 : isTablet ? 1.06 : 1.04;
        const enableShadows =
          performanceModeRef.current === 'hd' && !isSoftwareGl;

        // 1. Special Golden Tutorial Koi (Target Answer = 10) in front-center of the pond
        const targetPalette = KOI_PALETTES[1]; // Ogon Emas Kemilau
        const targetModel = create3DKoiFish(
          targetPalette,
          10,
          1,
          maxAnisotropyRef.current,
          enableShadows
        );
        if (isPortrait) {
          targetModel.badgeSprite.scale.set(1.42, 1.42, 1);
        }
        const targetX = -0.5;
        const targetZ = 1.4;
        targetModel.root.position.set(targetX, -0.75, targetZ);
        targetModel.root.scale.setScalar(fishScale * 0.25);
        fishGroup.add(targetModel.root);
        spawn3DWaterRipple(targetX, targetZ, 'spawn');

        const targetEntity: ActiveKoiEntity = {
          id: 9001,
          answer: 10,
          index: 0,
          palette: targetPalette,
          model: targetModel,
          x: targetX,
          z: targetZ,
          vx: 0.95,
          vz: 0.25,
          speed: 1.0,
          targetScale: fishScale,
          spawnElapsed: 0,
          wanderPhase: 0,
          swimCycle: 0,
          isJumping: false,
          jumpTime: 0,
          jumpDuration: 0.72,
          jumpCooldown: 99,
          caught: false,
          isTutorialTarget: true,
        };
        targetModel.hitbox.userData.koiEntity = targetEntity;
        activeKoiRef.current.push(targetEntity);

        // 2. Secondary Non-Target Koi (Answer = 40) swimming further back so student sees how to pick the right fish
        const otherPalette = KOI_PALETTES[3]; // Asagi Biru Langit
        const otherModel = create3DKoiFish(
          otherPalette,
          40,
          2,
          maxAnisotropyRef.current,
          enableShadows
        );
        const otherX = 2.2 * pondScaleXRef.current;
        const otherZ = -1.6;
        otherModel.root.position.set(otherX, -0.75, otherZ);
        otherModel.root.scale.setScalar(fishScale * 0.22);
        fishGroup.add(otherModel.root);
        spawn3DWaterRipple(otherX, otherZ, 'spawn');

        const otherEntity: ActiveKoiEntity = {
          id: 9002,
          answer: 40,
          index: 1,
          palette: otherPalette,
          model: otherModel,
          x: otherX,
          z: otherZ,
          vx: -0.85,
          vz: -0.2,
          speed: 0.9,
          targetScale: fishScale * 0.92,
          spawnElapsed: -0.08,
          wanderPhase: 1.5,
          swimCycle: 2.0,
          isJumping: false,
          jumpTime: 0,
          jumpDuration: 0.72,
          jumpCooldown: 99,
          caught: false,
          isTutorialTarget: false,
        };
        otherModel.hitbox.userData.koiEntity = otherEntity;
        activeKoiRef.current.push(otherEntity);

        if (tutorialIndicatorRef.current) {
          tutorialIndicatorRef.current.root.visible = true;
          tutorialIndicatorRef.current.root.position.set(targetX, 0.04, targetZ);
        }
      },

      spawnQuestionFish: (items: FishSpawnItem[], level: number) => {
        const fishGroup = fishGroupRef.current;
        if (!fishGroup) return;

        if (tutorialIndicatorRef.current) {
          tutorialIndicatorRef.current.root.visible = false;
        }
        const ptrEl = tutorialPointerDomRef.current?.current;
        if (ptrEl) {
          ptrEl.style.opacity = '0';
        }

        while (fishGroup.children.length > 0) {
          const child = fishGroup.children[0];
          fishGroup.remove(child);
        }
        activeKoiRef.current = [];

        const baseSpeed = 1.9 + Math.min(level * 0.2, 2.5);
        const isPortrait = window.innerWidth < window.innerHeight;
        const cols = isPortrait ? 2 : 3;
        const rows = Math.ceil(items.length / cols);

        const bounds = swimBoundsRef.current;
        const bX = bounds.x * 0.85;
        const zSpan = (bounds.zMax - bounds.zMin) * 0.84;
        const zMid = (bounds.zMax + bounds.zMin) * 0.5;
        const pondWidth = bX * 2;
        const pondDepth = zSpan;

        const isTablet =
          window.innerWidth >= 600 && window.innerWidth < 1100;
        const fishScale = isPortrait ? 1.06 : isTablet ? 1.02 : 1.02;
        const enableShadows =
          performanceModeRef.current === 'hd' && !isSoftwareGl;

        items.forEach((item, idx) => {
          const isRare = Boolean(item.isRareGold);
          const palette = isRare
            ? RARE_GOLD_PALETTE
            : KOI_PALETTES[item.paletteIndex % KOI_PALETTES.length];
          const itemScale = isRare ? fishScale * 1.14 : fishScale;

          const model = create3DKoiFish(
            palette,
            item.answer,
            idx + 1,
            maxAnisotropyRef.current,
            enableShadows,
            isRare
          );

          if (isPortrait) {
            model.badgeSprite.scale.set(
              isRare ? 1.52 : 1.38,
              isRare ? 1.52 : 1.38,
              1
            );
          }

          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const cellW = pondWidth / cols;
          const cellD = pondDepth / Math.max(1, rows);

          const startX =
            -pondWidth / 2 +
            col * cellW +
            cellW * 0.5 +
            (Math.random() - 0.5) * 0.45;
          const startZ =
            zMid -
            pondDepth / 2 +
            row * cellD +
            cellD * 0.5 +
            (Math.random() - 0.5) * 0.45;

          const angle = Math.random() * Math.PI * 2;
          const speed =
            baseSpeed * (isRare ? 1.12 : 0.92 + Math.random() * 0.16);

          model.root.position.set(startX, -0.75, startZ);
          model.root.scale.setScalar(itemScale * 0.25);
          model.root.rotation.y = -angle;
          fishGroup.add(model.root);

          spawn3DWaterRipple(startX, startZ, 'spawn');
          if (isRare) {
            spawn3DRareGoldBurst(startX, 0.25, startZ);
          }

          const entity: ActiveKoiEntity = {
            id: item.id,
            answer: item.answer,
            index: idx,
            palette,
            model,
            x: startX,
            z: startZ,
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            speed,
            targetScale: itemScale,
            spawnElapsed: -idx * 0.05,
            wanderPhase: Math.random() * Math.PI * 2,
            swimCycle: Math.random() * 10,
            isJumping: false,
            jumpTime: 0,
            jumpDuration: 0.72,
            jumpCooldown: isRare
              ? 1.5 + Math.random() * 1.5
              : 2.4 + idx * 1.4 + Math.random() * 2.5,
            caught: false,
            isRareGold: isRare,
            sparkleTimer: 0,
          };

          model.hitbox.userData.koiEntity = entity;
          activeKoiRef.current.push(entity);
        });
      },

      triggerCatchByIndex: (index: number) => {
        const koi = activeKoiRef.current[index];
        if (koi && !koi.caught) {
          handleKoiInteraction(koi);
        }
      },

      triggerBucketCelebration: (
        totalCaught: number,
        comboStreak = 0,
        isRareGold = false
      ) => {
        if (bucketObjRef.current) {
          bucketObjRef.current.bounceTime = isRareGold ? 0.65 : 0.45;
          bucketObjRef.current.caughtTailGroup.visible = totalCaught > 0;
          const bPos = bucketObjRef.current.bucketGroup.position;
          if (isRareGold) {
            spawn3DRareGoldBurst(bPos.x, bPos.y + 1.4, bPos.z);
          } else if (comboStreak >= 3) {
            spawn3DCelebrationBurst(bPos.x, bPos.y + 1.4, bPos.z, comboStreak);
          }
        }
      },

      triggerMistakeShake: () => {
        shakeTimeRef.current = 0.38;
      },
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isInitialLite =
        performanceModeRef.current === 'lite' || isSoftwareGl;

      // 1. Initialize Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl && !isInitialLite,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(
        isInitialLite
          ? Math.min(window.devicePixelRatio || 1, 1.15)
          : Math.min(window.devicePixelRatio || 1, 1.75)
      );
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = !isInitialLite;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const maxAniso = Math.min(
        renderer.capabilities.getMaxAnisotropy() || 1,
        4
      );
      maxAnisotropyRef.current = maxAniso;

      // 2. Scene with Bright Blue Sky Gradient Texture & Horizon Fog
      const scene = new THREE.Scene();
      const skyCanvas = document.createElement('canvas');
      skyCanvas.width = 64;
      skyCanvas.height = 256;
      const sCtx = skyCanvas.getContext('2d')!;
      const skyGrad = sCtx.createLinearGradient(0, 0, 0, 256);
      skyGrad.addColorStop(0.0, '#38bdf8');
      skyGrad.addColorStop(0.45, '#7dd3fc');
      skyGrad.addColorStop(0.75, '#bae6fd');
      skyGrad.addColorStop(1.0, '#dcfce7');
      sCtx.fillStyle = skyGrad;
      sCtx.fillRect(0, 0, 64, 256);
      const skyTex = new THREE.CanvasTexture(skyCanvas);
      skyTex.colorSpace = THREE.SRGBColorSpace;

      scene.background = skyTex;
      scene.fog = new THREE.FogExp2(0xbae6fd, 0.014);
      sceneRef.current = scene;

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(
        new RoomEnvironment(),
        0.04
      ).texture;
      pmremGenerator.dispose();

      // 3. Perspective Camera
      const camera = new THREE.PerspectiveCamera(
        40,
        container.clientWidth / container.clientHeight,
        0.5,
        95
      );
      camera.position.set(0, 14.8, 7.2);
      camera.lookAt(0, -0.1, 0.45);
      cameraRef.current = camera;

      // 4. Studio 3-Point Outdoor Sunlight Rig
      const hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0x15803d, 1.25);
      hemiLight.position.set(0, 25, 0);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.0);
      sunLight.position.set(8, 18, 10);
      sunLight.castShadow = !isInitialLite;
      sunLight.shadow.mapSize.width = 512;
      sunLight.shadow.mapSize.height = 512;
      const d = 14;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.camera.near = 1;
      sunLight.shadow.camera.far = 42;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
      scene.add(sunLight);
      sunLightRef.current = sunLight;

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
      rimLight.position.set(-10, 12, -8);
      scene.add(rimLight);

      // 5. 3D Grassy Land (Sedikit Daratan Tempat Ember) & Distant Hills (Bukit di Bagian Atas Layar)
      const grassyLandscape = create3DGrassyLandscape();
      scene.add(grassyLandscape);

      // 6. Fluffy 3D Drifting Clouds (Awan di Langit Bagian Atas Layar)
      const clouds = create3DClouds();
      clouds.forEach((c) => scene.add(c));

      // 7. Procedural Pond Bed with Caustics Texture inside the Screen-Filling Basin
      const bedCanvas = document.createElement('canvas');
      bedCanvas.width = 256;
      bedCanvas.height = 256;
      const bCtx = bedCanvas.getContext('2d')!;
      const bedGrad = bCtx.createRadialGradient(128, 128, 16, 128, 128, 128);
      bedGrad.addColorStop(0, '#0ea5e9');
      bedGrad.addColorStop(0.65, '#0284c7');
      bedGrad.addColorStop(1, '#0369a1');
      bCtx.fillStyle = bedGrad;
      bCtx.fillRect(0, 0, 256, 256);

      bCtx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
      bCtx.lineWidth = 2;
      for (let i = 0; i < 24; i++) {
        bCtx.beginPath();
        bCtx.arc(
          Math.random() * 256,
          Math.random() * 256,
          14 + Math.random() * 28,
          0,
          Math.PI * 2
        );
        bCtx.stroke();
      }
      const bedTex = new THREE.CanvasTexture(bedCanvas);
      bedTex.colorSpace = THREE.SRGBColorSpace;

      const pondBedGeo = new THREE.PlaneGeometry(28, 22);
      pondBedGeo.rotateX(-Math.PI / 2);
      const pondBedMat = new THREE.MeshLambertMaterial({
        map: bedTex,
      });
      const pondBed = new THREE.Mesh(pondBedGeo, pondBedMat);
      pondBed.position.set(0, -1.15, 0);
      pondBed.receiveShadow = true;
      scene.add(pondBed);

      // 8. Interactive 3D Rippling Water Surface inside the Expanded Pond Basin
      const waterUniforms = {
        uTime: { value: 0 },
        uRipples: { value: shaderRipplesRef.current },
      };
      const waterGeo = new THREE.PlaneGeometry(26, 20, 32, 24);
      waterGeo.rotateX(-Math.PI / 2);

      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.14,
        metalness: 0.12,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });

      waterMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = waterUniforms.uTime;
        shader.uniforms.uRipples = waterUniforms.uRipples;

        shader.vertexShader =
          `
          uniform float uTime;
          uniform vec4 uRipples[${MAX_SHADER_RIPPLES}];
          varying float vRippleCrest;
          ` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            float baseWave1 = sin(transformed.x * 0.8 + uTime * 2.0) * 0.035;
            float baseWave2 = cos(transformed.z * 1.0 + uTime * 1.6) * 0.035;
            float rippleSum = 0.0;
            for (int i = 0; i < ${MAX_SHADER_RIPPLES}; i++) {
              vec4 rp = uRipples[i];
              if (rp.w > 0.01) {
                float dist = length(transformed.xz - rp.xz);
                float radius = rp.y * 5.2;
                float band = abs(dist - radius);
                if (band < 1.8) {
                  float env = (1.0 - band / 1.8) * exp(-rp.y * 2.1) * rp.w;
                  rippleSum += sin((dist - radius) * 9.5) * 0.14 * env;
                }
              }
            }
            transformed.y += baseWave1 + baseWave2 + rippleSum;
            vRippleCrest = clamp(rippleSum * 4.5, 0.0, 1.0);
            `
          );

        shader.fragmentShader =
          `varying float vRippleCrest;\n` +
          shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.98, 1.0), vRippleCrest * 0.75);
            diffuseColor.a = clamp(diffuseColor.a + vRippleCrest * 0.32, 0.0, 0.85);
            `
          );
      };

      const waterSurface = new THREE.Mesh(waterGeo, waterMat);
      waterSurface.position.set(0, 0.0, 0);
      scene.add(waterSurface);

      // 9. InstancedMesh Natural River Stones Lining the 4 Straight Sides of the Rectangular Pond & Underwater Pebbles
      const rockCount = 56;
      const rockGeo = new THREE.DodecahedronGeometry(0.46, 0);
      const rockMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
      });
      const rockInstanced = new THREE.InstancedMesh(
        rockGeo,
        rockMat,
        rockCount
      );

      const hw = POND_RECT.halfW;
      const z0 = POND_RECT.zMin;
      const z1 = POND_RECT.zMax;

      for (let i = 0; i < rockCount; i++) {
        if (i < 40) {
          // 40 border stones distributed evenly along the 4 straight sides of the rectangular pond
          let rxPos = 0;
          let rzPos = 0;
          if (i < 12) {
            // Top / North edge (z = z0)
            const t = (i + 0.5) / 12;
            rxPos = -hw + t * (hw * 2);
            rzPos = z0 - 0.08 + (Math.random() - 0.5) * 0.14;
          } else if (i < 24) {
            // Bottom / South edge (z = z1)
            const t = (i - 12 + 0.5) / 12;
            rxPos = -hw + t * (hw * 2);
            rzPos = z1 + 0.08 + (Math.random() - 0.5) * 0.14;
          } else if (i < 32) {
            // Left / West edge (x = -hw)
            const t = (i - 24 + 0.5) / 8;
            rxPos = -hw - 0.08 + (Math.random() - 0.5) * 0.14;
            rzPos = z0 + t * (z1 - z0);
          } else {
            // Right / East edge (x = +hw)
            const t = (i - 32 + 0.5) / 8;
            rxPos = hw + 0.08 + (Math.random() - 0.5) * 0.14;
            rzPos = z0 + t * (z1 - z0);
          }
          _dummyPos.set(rxPos, 0.12, rzPos);
          _dummyScale.set(
            0.85 + Math.random() * 0.35,
            0.48 + Math.random() * 0.25,
            0.82 + Math.random() * 0.35
          );
        } else {
          // Underwater pebbles inside the rectangular pond bed
          _dummyPos.set(
            (Math.random() - 0.5) * (hw * 1.7),
            -1.08,
            POND_RECT.zCenter + (Math.random() - 0.5) * (POND_RECT.halfD * 1.7)
          );
          _dummyScale.set(
            0.35 + Math.random() * 0.35,
            0.2 + Math.random() * 0.12,
            0.35 + Math.random() * 0.35
          );
        }
        _dummyEuler.set(
          Math.random() * 0.4,
          Math.random() * Math.PI * 2,
          Math.random() * 0.4
        );
        _dummyQuat.setFromEuler(_dummyEuler);
        _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
        rockInstanced.setMatrixAt(i, _dummyMatrix);

        const shade = 0.48 + Math.random() * 0.24;
        _dummyColor.setRGB(shade * 0.88, shade * 0.94, shade);
        rockInstanced.setColorAt(i, _dummyColor);
      }
      rockInstanced.instanceMatrix.needsUpdate = true;
      if (rockInstanced.instanceColor)
        rockInstanced.instanceColor.needsUpdate = true;
      rockInstanced.computeBoundingSphere();
      scene.add(rockInstanced);

      // 10. InstancedMesh Rising Underwater Bubbles (20 bubbles inside the rectangular pond)
      const bubbleCount = 20;
      const bubbleGeo = new THREE.SphereGeometry(0.075, 6, 6);
      const bubbleMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.55,
      });
      const bubbleInstanced = new THREE.InstancedMesh(
        bubbleGeo,
        bubbleMat,
        bubbleCount
      );
      bubbleInstanced.frustumCulled = false;
      const bubbleData = Array.from({ length: bubbleCount }, () => ({
        x: (Math.random() - 0.5) * 10.0,
        y: -1.1 + Math.random() * 1.1,
        z: POND_RECT.zCenter + (Math.random() - 0.5) * 6.0,
        speed: 0.35 + Math.random() * 0.4,
        scale: 0.6 + Math.random() * 0.8,
      }));
      scene.add(bubbleInstanced);

      // 11. 3D Blooming Lotus & Lily Pads Near the 4 Corners Inside the Rectangular Pond
      const lilyPositions = [
        { baseX: -5.1, z: -2.3, rot: 0.4, scale: 0.76, lotus: true },
        { baseX: 5.1, z: -2.2, rot: -0.8, scale: 0.74, lotus: true },
        { baseX: -5.0, z: 3.9, rot: 1.2, scale: 0.72, lotus: true },
        { baseX: 4.9, z: 3.8, rot: 3.5, scale: 0.68, lotus: false },
      ];
      const lilyPads: THREE.Group[] = [];
      lilyPositions.forEach((lp) => {
        const pad = create3DLilyPad(lp.lotus, lp.scale);
        pad.position.set(lp.baseX, 0.01, lp.z);
        pad.rotation.y = lp.rot;
        scene.add(pad);
        lilyPads.push(pad);
      });

      // 12. 3D Wooden Fish Bucket Placed on the Compact Upper Grassy Land (Sedikit Daratan di Tepi Atas Kolam)
      const { bucketGroup, caughtTailGroup } = create3DWoodenBucket();
      bucketGroup.position.set(4.2, 0.25, -4.48);
      bucketGroup.scale.setScalar(0.76);
      scene.add(bucketGroup);
      bucketObjRef.current = {
        bucketGroup,
        caughtTailGroup,
        bounceTime: 0,
      };

      // 13. 3D Handled Fishing Net
      const netGroup = create3DFishingNet();
      netGroup.visible = false;
      scene.add(netGroup);
      netObjRef.current = {
        group: netGroup,
        active: false,
        elapsed: 0,
        duration: 0.48,
        x: 0,
        z: 0,
      };

      // 14. Dynamic Containers for Swimming Koi, 3D Tutorial Indicator & 3D Splash Effects
      const fishGroup = new THREE.Group();
      scene.add(fishGroup);
      fishGroupRef.current = fishGroup;

      const effectsGroup = new THREE.Group();
      scene.add(effectsGroup);
      effectsGroupRef.current = effectsGroup;

      // 3D Tutorial Target Ring & Bouncing Golden Arrow above the Special Tutorial Koi
      const tutRoot = new THREE.Group();
      tutRoot.visible = false;

      const tutRingGeo = new THREE.TorusGeometry(0.95, 0.055, 8, 32);
      tutRingGeo.rotateX(Math.PI / 2);
      const tutGoldMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.5,
      });
      const tutRing = new THREE.Mesh(tutRingGeo, tutGoldMat);
      tutRoot.add(tutRing);

      const tutArrowGroup = new THREE.Group();
      tutArrowGroup.position.set(0.08, 1.95, 0);
      const coneHead = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.45, 12).rotateX(Math.PI),
        tutGoldMat
      );
      coneHead.position.y = 0;
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.42, 12),
        tutGoldMat
      );
      shaft.position.y = 0.36;
      tutArrowGroup.add(coneHead);
      tutArrowGroup.add(shaft);
      tutRoot.add(tutArrowGroup);

      scene.add(tutRoot);
      tutorialIndicatorRef.current = {
        root: tutRoot,
        ring: tutRing,
        arrow: tutArrowGroup,
      };

      const updateViewportResponsiveness = () => {
        if (!container) return;
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        const aspect = w / h;

        camera.aspect = aspect;
        camera.fov = 40;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);

        // Keep vertical camera framing consistent across all screens so the pond always fills the screen
        // vertically from the compact upper grassy land down to the bottom screen boundary
        camDistFactorRef.current = 1.0;

        // Temporarily evaluate projection from the reference angled camera pose to compute exact horizontal pondScaleX
        const savedPos = _vec3A.copy(camera.position);
        const basePreset = CAMERA_PRESETS.angled;
        camera.position.set(
          basePreset.pos[0],
          basePreset.pos[1],
          basePreset.pos[2]
        );
        camera.lookAt(
          basePreset.lookAt[0],
          basePreset.lookAt[1],
          basePreset.lookAt[2]
        );
        camera.updateMatrixWorld();

        // Project a 1-unit X point at the widest front-most outer corner of the pond stone border (z = POND_RECT.zMax + 0.36)
        _vec3Proj.set(1.0, 0.22, POND_RECT.zMax + 0.36).project(camera);
        const ndcPerWorldXFront = Math.max(Math.abs(_vec3Proj.x), 0.01);

        // Restore camera position
        camera.position.copy(savedPos);
        camera.lookAt(
          basePreset.lookAt[0],
          basePreset.lookAt[1],
          basePreset.lookAt[2]
        );
        camera.updateMatrixWorld();

        // Fit the outer stone border (POND_RECT.halfW + 0.36 = 6.96) to 93% of the screen width (NDC x = ±0.93)
        // so the pond fills the screen from left to right without EVER exceeding the screen boundaries!
        const outerHalfW = POND_RECT.halfW + 0.36;
        const pondScaleX = THREE.MathUtils.clamp(
          0.93 / (ndcPerWorldXFront * outerHalfW),
          0.32,
          1.65
        );
        pondScaleXRef.current = pondScaleX;

        grassyLandscape.scale.set(pondScaleX, 1, 1);
        rockInstanced.scale.set(pondScaleX, 1, 1);
        pondBed.scale.set(pondScaleX, 1, 1);

        lilyPads.forEach((pad, idx) => {
          pad.position.x = lilyPositions[idx].baseX * pondScaleX;
        });

        // Rectangular swimming bounds strictly inside the 4 stone walls of the screen-filling pond
        const maxSwimX = Math.max(1.4, (POND_RECT.halfW - 0.95) * pondScaleX);
        swimBoundsRef.current = {
          x: maxSwimX,
          zMin: POND_RECT.zMin + 0.88,
          zMax: POND_RECT.zMax - 0.95,
          zCenter: POND_RECT.zCenter,
          rx: POND_RECT.halfW * pondScaleX,
          rz: POND_RECT.halfD,
        };

        // Clamp any already-active Koi immediately when the screen resizes
        activeKoiRef.current.forEach((k) => {
          k.x = THREE.MathUtils.clamp(k.x, -maxSwimX, maxSwimX);
          k.z = THREE.MathUtils.clamp(
            k.z,
            POND_RECT.zMin + 0.88,
            POND_RECT.zMax - 0.95
          );
        });

        // Place the wooden bucket on the compact green grassy shore right above the upper-right pond border
        bucketGroup.position.set(4.2 * pondScaleX, 0.25, -4.48);
      };

      updateViewportResponsiveness();

      // Spawn decorative demo Koi for the Title Screen (including 1 Rare Golden Koi!)
      const demoItems: FishSpawnItem[] = [
        { id: 1, answer: 10, paletteIndex: 0, isRareGold: true },
        { id: 2, answer: 50, paletteIndex: 1 },
        { id: 3, answer: 8, paletteIndex: 2 },
        { id: 4, answer: 90, paletteIndex: 3 },
      ];
      demoItems.forEach((item, idx) => {
        const isRare = Boolean(item.isRareGold);
        const palette = isRare
          ? RARE_GOLD_PALETTE
          : KOI_PALETTES[item.paletteIndex];
        const model = create3DKoiFish(
          palette,
          item.answer,
          idx + 1,
          maxAniso,
          !isInitialLite,
          isRare
        );
        const angle = (idx / demoItems.length) * Math.PI * 2;
        const x = Math.cos(angle) * 3.0 * pondScaleXRef.current;
        const z = POND_RECT.zCenter + Math.sin(angle) * 1.9;
        model.root.position.set(x, -0.12, z);
        model.root.scale.setScalar(isRare ? 1.12 : 1.0);
        fishGroup.add(model.root);

        const entity: ActiveKoiEntity = {
          id: item.id,
          answer: item.answer,
          index: idx,
          palette,
          model,
          x,
          z,
          vx: Math.cos(angle + 1.2) * 2.0,
          vz: Math.sin(angle + 1.2) * 2.0,
          speed: 2.0,
          targetScale: isRare ? 1.12 : 1.0,
          spawnElapsed: 1.0,
          wanderPhase: idx * 1.3,
          swimCycle: idx * 2.0,
          isJumping: false,
          jumpTime: 0,
          jumpDuration: 0.72,
          jumpCooldown: 2.2 + idx * 1.5,
          caught: false,
          isRareGold: isRare,
          sparkleTimer: 0,
        };
        model.hitbox.userData.koiEntity = entity;
        activeKoiRef.current.push(entity);
      });

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // 15. Multi-Device Pointer Handler (Precision Screen-Space Proximity + 3D Raycast)
      const handlePointerDown = (e: PointerEvent) => {
        if (
          gameStateRef.current !== 'playing' &&
          gameStateRef.current !== 'tutorial'
        )
          return;

        const rect = renderer.domElement.getBoundingClientRect();
        const tapX = e.clientX - rect.left;
        const tapY = e.clientY - rect.top;

        // 1. Primary Check: Find the exact fish whose visible body or number badge on screen is closest to the user's finger tap
        let bestScreenKoi: ActiveKoiEntity | null = null;
        const maxTouchRadiusPx = Math.max(
          54,
          Math.min(rect.width, rect.height) * 0.115
        );
        let bestDistPx = maxTouchRadiusPx;

        for (const koi of activeKoiRef.current) {
          if (koi.caught) continue;

          // Project fish body center to screen pixels
          _vec3Proj.set(koi.x, 0.15, koi.z).project(camera);
          const bodyScreenX = ((_vec3Proj.x + 1) * 0.5) * rect.width;
          const bodyScreenY = ((-_vec3Proj.y + 1) * 0.5) * rect.height;
          const distBody = Math.hypot(tapX - bodyScreenX, tapY - bodyScreenY);

          // Project fish number badge center to screen pixels
          _vec3Proj.set(koi.x, 1.05 * koi.targetScale, koi.z).project(camera);
          const badgeScreenX = ((_vec3Proj.x + 1) * 0.5) * rect.width;
          const badgeScreenY = ((-_vec3Proj.y + 1) * 0.5) * rect.height;
          const distBadge = Math.hypot(
            tapX - badgeScreenX,
            tapY - badgeScreenY
          );

          const minPx = Math.min(distBody, distBadge);
          if (minPx < bestDistPx) {
            bestDistPx = minPx;
            bestScreenKoi = koi;
          }
        }

        if (bestScreenKoi) {
          handleKoiInteraction(bestScreenKoi);
          return;
        }

        // 2. Secondary Check: Tight 3D hitbox raycast
        _pointerNDC.x = (tapX / rect.width) * 2 - 1;
        _pointerNDC.y = -(tapY / rect.height) * 2 + 1;

        _raycaster.setFromCamera(_pointerNDC, camera);
        _raycaster.layers.set(1);

        const hitboxes = activeKoiRef.current
          .filter((k) => !k.caught)
          .map((k) => k.model.hitbox);

        const intersects = _raycaster.intersectObjects(hitboxes, false);
        if (intersects.length > 0) {
          const hitKoi = intersects[0].object.userData
            .koiEntity as ActiveKoiEntity;
          if (hitKoi) {
            handleKoiInteraction(hitKoi);
            return;
          }
        }

        // 3. Water Surface Touch (Missed all fish -> trigger water ripple at tap point inside rectangular pond)
        if (_raycaster.ray.intersectPlane(_waterPlane, _vec3A)) {
          const b = swimBoundsRef.current;
          const clampedX = THREE.MathUtils.clamp(_vec3A.x, -b.rx, b.rx);
          const clampedZ = THREE.MathUtils.clamp(
            _vec3A.z,
            POND_RECT.zMin + 0.2,
            POND_RECT.zMax - 0.2
          );
          spawn3DWaterRipple(clampedX, clampedZ, 'touch');
          spawn3DSplashDroplets(clampedX, clampedZ, 5);
          trigger3DNetScoop(clampedX, clampedZ);
          audioEngine.playWaterRippleSound();
        }
      };

      const domElem = renderer.domElement;
      domElem.addEventListener('pointerdown', handlePointerDown, {
        passive: true,
      });

      window.addEventListener('resize', updateViewportResponsiveness);

      // 16. Animation Loop
      let frameId = 0;
      let isDisposed = false;
      const clock = new THREE.Clock();

      function afterDraw(cb: () => void) {
        if (isDisposed) return;
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || !gl.fenceSync) {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (isDisposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      function tick() {
        if (isDisposed) return;

        const rawDt = clock.getDelta();
        const dt = Math.min(rawDt, 0.05);
        const elapsed = clock.getElapsedTime();

        waterUniforms.uTime.value = elapsed;

        // Drift 3D Clouds gently across the top sky strip
        clouds.forEach((cloud, idx) => {
          cloud.position.x += (0.25 + (idx % 3) * 0.08) * dt;
          if (cloud.position.x > 26) {
            cloud.position.x = -26;
          }
          cloud.position.y += Math.sin(elapsed * 0.7 + idx) * 0.002;
        });

        // Advance GPU 3D water surface ripple waves
        for (let i = 0; i < MAX_SHADER_RIPPLES; i++) {
          const rp = shaderRipplesRef.current[i];
          if (rp.w > 0.01) {
            rp.y += dt;
            if (rp.y > 1.8) {
              rp.w = 0;
            }
          }
        }

        const preset = CAMERA_PRESETS[cameraPresetRef.current];
        const lookX = preset.lookAt[0];
        const lookY = preset.lookAt[1];
        const lookZ = preset.lookAt[2];
        const distFactor = camDistFactorRef.current;

        let targetX = lookX + (preset.pos[0] - lookX) * distFactor;
        let targetY = lookY + (preset.pos[1] - lookY) * distFactor;
        let targetZ = lookZ + (preset.pos[2] - lookZ) * distFactor;

        if (gameStateRef.current === 'title') {
          targetX = Math.sin(elapsed * 0.25) * 0.35;
          targetY = lookY + (14.8 - lookY) * distFactor + Math.cos(elapsed * 0.2) * 0.15;
          targetZ = lookZ + (7.2 - lookZ) * distFactor + Math.cos(elapsed * 0.25) * 0.2;
        }

        if (shakeTimeRef.current > 0) {
          shakeTimeRef.current = Math.max(0, shakeTimeRef.current - dt);
          const intensity = shakeTimeRef.current * 1.1;
          targetX += Math.sin(elapsed * 55) * intensity;
          targetZ += Math.cos(elapsed * 48) * intensity;
        }

        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          targetX,
          4.5,
          dt
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          targetY,
          4.5,
          dt
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          targetZ,
          4.5,
          dt
        );
        camera.lookAt(lookX, lookY, lookZ);

        lilyPads.forEach((pad, idx) => {
          pad.position.y = 0.01 + Math.sin(elapsed * 1.5 + idx * 1.2) * 0.022;
        });

        // Update rising 3D bubbles inside the rectangular pond
        for (let i = 0; i < bubbleCount; i++) {
          const b = bubbleData[i];
          b.y += b.speed * dt;
          if (b.y > 0.05) {
            b.y = -1.1;
            b.x = (Math.random() - 0.5) * 10.0 * pondScaleXRef.current;
            b.z = POND_RECT.zCenter + (Math.random() - 0.5) * 6.0;
          }
          _dummyPos.set(b.x, b.y, b.z);
          _dummyQuat.identity();
          _dummyScale.setScalar(b.scale);
          _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
          bubbleInstanced.setMatrixAt(i, _dummyMatrix);
        }
        bubbleInstanced.instanceMatrix.needsUpdate = true;

        // Bucket jiggle & tail animation on the upper grassy shore
        if (bucketObjRef.current) {
          const bObj = bucketObjRef.current;
          if (bObj.bounceTime > 0) {
            bObj.bounceTime = Math.max(0, bObj.bounceTime - dt);
            const s =
              0.76 + Math.sin(bObj.bounceTime * Math.PI * 6) * 0.13;
            bObj.bucketGroup.scale.set(s, 0.76 * 2 - s, s);
          } else {
            bObj.bucketGroup.scale.setScalar(0.76);
          }
          if (bObj.caughtTailGroup.visible) {
            bObj.caughtTailGroup.rotation.z =
              Math.sin(elapsed * 14) * 0.35;
          }
        }

        // Net scoop animation
        if (netObjRef.current && netObjRef.current.active) {
          const net = netObjRef.current;
          net.elapsed += dt;
          const p = Math.min(1, net.elapsed / net.duration);
          if (p >= 1) {
            net.active = false;
            net.group.visible = false;
          } else {
            const dip = Math.sin(p * Math.PI);
            net.group.position.set(
              net.x + (1 - p) * 0.5,
              0.8 - dip * 0.9,
              net.z + (1 - p) * 0.7
            );
            net.group.rotation.x = -0.5 + p * 0.9;
            net.group.rotation.z = (0.5 - p) * 0.35;
          }
        }

        // Advance game timer & Koi simulation strictly inside the rectangular pond
        if (gameStateRef.current !== 'paused') {
          if (gameStateRef.current === 'playing') {
            onTimeTickRef.current(dt);
          }

          const bounds = swimBoundsRef.current;
          const boundX = bounds.x;
          const zMin = bounds.zMin;
          const zMax = bounds.zMax;

          activeKoiRef.current.forEach((koi, idx) => {
            if (koi.caught) return;

            let spawnDepthOffset = 0;
            if (koi.spawnElapsed < 0.45) {
              koi.spawnElapsed += dt;
              const sp = THREE.MathUtils.clamp(koi.spawnElapsed / 0.45, 0, 1);
              const easeOut = 1 - Math.pow(1 - sp, 3);
              spawnDepthOffset = (1 - easeOut) * -0.65;
              koi.model.root.scale.setScalar(
                koi.targetScale * (0.25 + 0.75 * easeOut)
              );
            } else {
              koi.model.root.scale.setScalar(koi.targetScale);
            }

            koi.wanderPhase += dt * 2.0;
            const wanderForce = Math.sin(koi.wanderPhase) * 1.6;
            const perpX = -koi.vz / (koi.speed || 1);
            const perpZ = koi.vx / (koi.speed || 1);
            koi.vx += perpX * wanderForce * dt;
            koi.vz += perpZ * wanderForce * dt;

            // Smoothly steer fish away from the 4 straight rectangular pond walls
            const turnStrength = koi.speed * 4.6;
            if (koi.x < -boundX + 0.6) koi.vx += turnStrength * dt;
            else if (koi.x > boundX - 0.6) koi.vx -= turnStrength * dt;

            if (koi.z < zMin + 0.5) koi.vz += turnStrength * dt;
            else if (koi.z > zMax - 0.5) koi.vz -= turnStrength * dt;

            // Proportional fish-to-fish separation so Koi spread across the rectangular pond without overlapping
            for (let j = 0; j < activeKoiRef.current.length; j++) {
              if (idx === j || activeKoiRef.current[j].caught) continue;
              const other = activeKoiRef.current[j];
              const dx = koi.x - other.x;
              const dz = koi.z - other.z;
              const distSq = dx * dx + dz * dz;
              if (distSq < 6.25 && distSq > 0.001) {
                const dist = Math.sqrt(distSq);
                const push = (2.5 - dist) * 5.2;
                koi.vx += (dx / dist) * push * dt;
                koi.vz += (dz / dist) * push * dt;
              }
            }

            const curSpd = Math.hypot(koi.vx, koi.vz);
            if (curSpd > 0.001) {
              koi.vx = (koi.vx / curSpd) * koi.speed;
              koi.vz = (koi.vz / curSpd) * koi.speed;
            }

            koi.x = THREE.MathUtils.clamp(
              koi.x + koi.vx * dt,
              -boundX,
              boundX
            );
            koi.z = THREE.MathUtils.clamp(
              koi.z + koi.vz * dt,
              zMin,
              zMax
            );

            // Direct Screen-Space NDC Boundary Guard: guarantee swimming fish NEVER exceed the screen edges
            _vec3Proj.set(koi.x, 0.25, koi.z).project(camera);
            if (_vec3Proj.x < -0.84) {
              koi.vx = Math.abs(koi.vx);
              koi.x += 0.15;
            } else if (_vec3Proj.x > 0.84) {
              koi.vx = -Math.abs(koi.vx);
              koi.x -= 0.15;
            }
            if (_vec3Proj.y < -0.84) {
              koi.vz = -Math.abs(koi.vz);
              koi.z -= 0.15;
            } else if (_vec3Proj.y > 0.52) {
              koi.vz = Math.abs(koi.vz);
              koi.z += 0.15;
            }
            koi.x = THREE.MathUtils.clamp(koi.x, -boundX, boundX);
            koi.z = THREE.MathUtils.clamp(koi.z, zMin, zMax);

            // Periodic 3D Leaping out of the water
            koi.jumpCooldown -= dt;
            if (koi.jumpCooldown <= 0 && !koi.isJumping) {
              koi.isJumping = true;
              koi.jumpTime = 0;
              spawn3DWaterRipple(koi.x, koi.z, 'touch');
              if (gameStateRef.current === 'playing') {
                audioEngine.playFishJumpSound();
              }
            }

            let jumpHeight = 0;
            let jumpPitch = 0;
            if (koi.isJumping) {
              koi.jumpTime += dt;
              const jp = koi.jumpTime / koi.jumpDuration;
              if (jp >= 1) {
                koi.isJumping = false;
                koi.jumpCooldown = koi.isRareGold
                  ? 2.8 + Math.random() * 3.0
                  : 4.2 + Math.random() * 5.5;
                spawn3DWaterRipple(koi.x, koi.z, 'touch');
              } else {
                const sinArc = Math.sin(jp * Math.PI);
                jumpHeight = sinArc * 1.25;
                jumpPitch = Math.cos(jp * Math.PI) * 0.5;
              }
            }

            // Animate Rare Golden Koi Halo & Golden Shimmer Trail
            if (koi.isRareGold) {
              if (koi.model.rareHaloMesh) {
                const haloPulse = 1 + Math.sin(elapsed * 6.0) * 0.12;
                koi.model.rareHaloMesh.scale.set(haloPulse, 1, haloPulse);
              }
              koi.sparkleTimer = (koi.sparkleTimer || 0) + dt;
              const sparkleInterval =
                performanceModeRef.current === 'lite' ? 0.24 : 0.14;
              if (koi.sparkleTimer >= sparkleInterval) {
                koi.sparkleTimer = 0;
                spawnRareGoldTrailSparkle(koi.x, koi.z);
              }
            }

            koi.swimCycle += dt * (koi.isJumping ? 20 : 11);
            const heading = Math.atan2(-koi.vz, koi.vx);

            koi.model.root.position.set(
              koi.x,
              -0.12 + spawnDepthOffset,
              koi.z
            );
            koi.model.root.rotation.y = heading;

            koi.model.swimGroup.position.y = jumpHeight;
            koi.model.swimGroup.rotation.z = jumpPitch;
            koi.model.swimGroup.rotation.y =
              Math.sin(koi.swimCycle) * 0.075;

            koi.model.tailPivot.rotation.y =
              Math.sin(koi.swimCycle * 1.4) * 0.4;
            koi.model.finLeftPivot.rotation.z =
              Math.sin(koi.swimCycle * 0.9) * 0.25;
            koi.model.finRightPivot.rotation.z =
              -Math.sin(koi.swimCycle * 0.9) * 0.25;

            const shadowScale = Math.max(0.45, 1 - jumpHeight * 0.35);
            koi.model.shadowPlane.scale.setScalar(shadowScale);
          });

          // Update 3D Tutorial Indicator & Real-Time Screen-Space Callout Badge
          if (gameStateRef.current === 'tutorial') {
            const tutKoi = activeKoiRef.current.find(
              (k) => k.isTutorialTarget && !k.caught
            );
            if (tutKoi && tutorialIndicatorRef.current) {
              const ind = tutorialIndicatorRef.current;
              ind.root.visible = true;
              ind.root.position.set(tutKoi.x, 0.04, tutKoi.z);
              const pulse = 1 + Math.sin(elapsed * 5) * 0.1;
              ind.ring.scale.set(pulse, 1, pulse);
              ind.arrow.position.y = 1.95 + Math.sin(elapsed * 6.5) * 0.18;
              ind.arrow.rotation.y = elapsed * 2.2;

              const ptrEl = tutorialPointerDomRef.current?.current;
              if (ptrEl) {
                const rect = renderer.domElement.getBoundingClientRect();
                _vec3Proj
                  .set(tutKoi.x, 1.35 * tutKoi.targetScale, tutKoi.z)
                  .project(camera);
                const sx = ((_vec3Proj.x + 1) * 0.5) * rect.width;
                const sy = ((-_vec3Proj.y + 1) * 0.5) * rect.height;
                ptrEl.style.opacity = '1';
                ptrEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
              }
            }
          } else {
            if (
              tutorialIndicatorRef.current &&
              tutorialIndicatorRef.current.root.visible
            ) {
              tutorialIndicatorRef.current.root.visible = false;
            }
          }
        }

        // Update 3D Flying Caught Fish Arcs from Pond onto the Bucket on the Upper Grassy Shore
        for (let i = flyingFishRef.current.length - 1; i >= 0; i--) {
          const arc = flyingFishRef.current[i];
          arc.elapsed += dt;
          const t = Math.min(1, arc.elapsed / arc.duration);

          _vec3A.lerpVectors(arc.startPos, arc.endPos, t);
          const peakY = 4.0 * t * (1 - t) * 3.4;
          _vec3A.y += peakY;

          const nextT = Math.min(1, t + 0.04);
          _vec3B.lerpVectors(arc.startPos, arc.endPos, nextT);
          _vec3B.y += 4.0 * nextT * (1 - nextT) * 3.4;

          arc.group.position.copy(_vec3A);
          const dx = _vec3B.x - _vec3A.x;
          const dz = _vec3B.z - _vec3A.z;
          arc.group.rotation.y = Math.atan2(-dz, dx);
          arc.group.rotation.z = (0.5 - t) * 1.3;

          const scale = t < 0.5 ? 1 + t * 0.35 : 1.18 - (t - 0.5) * 1.35;
          arc.group.scale.setScalar(Math.max(0.25, scale));

          if (t >= 1) {
            effectsGroup.remove(arc.group);
            flyingFishRef.current.splice(i, 1);
            spawn3DSplashDroplets(arc.endPos.x, arc.endPos.z, 6);
          }
        }

        // Update 3D Expanding Water Ripple Rings
        for (let i = waterRingsRef.current.length - 1; i >= 0; i--) {
          const ring = waterRingsRef.current[i];
          ring.elapsed += dt;
          if (ring.elapsed < 0) {
            ring.mesh.visible = false;
            continue;
          }
          ring.mesh.visible = true;
          const p = ring.elapsed / ring.duration;
          if (p >= 1) {
            effectsGroup.remove(ring.mesh);
            ring.mat.dispose();
            waterRingsRef.current.splice(i, 1);
          } else {
            const easeOut = 1 - Math.pow(1 - p, 2.4);
            const s =
              ring.startScale + (ring.maxScale - ring.startScale) * easeOut;
            ring.mesh.scale.setScalar(s);
            ring.mat.opacity = (1 - p) * ring.initialOpacity;
          }
        }

        // Update 3D Splash Droplets
        for (let i = dropletsRef.current.length - 1; i >= 0; i--) {
          const drop = dropletsRef.current[i];
          drop.elapsed += dt;
          if (drop.elapsed >= drop.duration) {
            effectsGroup.remove(drop.mesh);
            dropletsRef.current.splice(i, 1);
          } else {
            drop.vy -= 14.5 * dt;
            drop.mesh.position.x += drop.vx * dt;
            drop.mesh.position.y += drop.vy * dt;
            drop.mesh.position.z += drop.vz * dt;
          }
        }

        // Update Festive 3D Star, Gem & Confetti Celebration Particles
        for (let i = celebrationParticlesRef.current.length - 1; i >= 0; i--) {
          const cp = celebrationParticlesRef.current[i];
          cp.elapsed += dt;
          if (cp.elapsed >= cp.duration) {
            effectsGroup.remove(cp.mesh);
            celebrationParticlesRef.current.splice(i, 1);
          } else {
            const p = cp.elapsed / cp.duration;
            cp.vy -= (cp.isStar ? 9.2 : 6.8) * dt;
            cp.vx *= 1 - 0.8 * dt;
            cp.vz *= 1 - 0.8 * dt;
            cp.mesh.position.x +=
              cp.vx * dt +
              (cp.isStar ? 0 : Math.sin(cp.elapsed * 12 + i) * 0.015);
            cp.mesh.position.y += cp.vy * dt;
            cp.mesh.position.z += cp.vz * dt;

            cp.mesh.rotation.x += cp.rx * dt;
            cp.mesh.rotation.y += cp.ry * dt;
            cp.mesh.rotation.z += cp.rz * dt;

            const scaleFade = p > 0.65 ? (1 - p) / 0.35 : 1.0;
            cp.mesh.scale.setScalar(cp.baseScale * Math.max(0.05, scaleFade));
          }
        }

        renderer.render(scene, camera);

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }

      return () => {
        isDisposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        window.removeEventListener('resize', updateViewportResponsiveness);
        domElem.removeEventListener('pointerdown', handlePointerDown);
        renderer.dispose();
        if (container.contains(domElem)) {
          container.removeChild(domElem);
        }
      };
    }, []);

    return (
      <div
        ref={mountRef}
        className="fixed inset-0 w-screen h-screen overflow-hidden cursor-pointer touch-none"
        aria-label="3D Koi Pond Game Viewport"
      />
    );
  }
);
