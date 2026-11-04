import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  KOI_PALETTES,
  Koi3DComponents,
  KoiPalette,
  create3DKoiFish,
  create3DLilyPad,
  create3DWoodenBucket,
  create3DFishingNet,
} from '../three/proceduralModels';
import { audioEngine } from '../services/audioEngine';

export type CameraPreset = 'angled' | 'top' | 'closeup';
export type PerformanceMode = 'lite' | 'hd';

export interface FishSpawnItem {
  id: number;
  answer: number;
  paletteIndex: number;
}

export interface PondCanvas3DHandle {
  spawnQuestionFish: (items: FishSpawnItem[], level: number) => void;
  triggerCatchByIndex: (index: number) => void;
  triggerBucketCelebration: (totalCaught: number) => void;
  triggerMistakeShake: () => void;
}

interface PondCanvas3DProps {
  gameState: 'title' | 'playing' | 'paused' | 'gameover';
  cameraPreset: CameraPreset;
  performanceMode: PerformanceMode;
  onFishClicked: (
    answer: number,
    screenX: number,
    screenY: number,
    fishIndex: number
  ) => boolean;
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

// Shared geometries & procedural ripple texture (Zero geometry allocation during gameplay)
let sharedRipplePlaneGeo: THREE.BufferGeometry | null = null;
let sharedRippleTexture: THREE.CanvasTexture | null = null;
let sharedDropGeo: THREE.BufferGeometry | null = null;
let sharedDropMat: THREE.MeshBasicMaterial | null = null;

function getSharedEffectAssets() {
  if (!sharedRipplePlaneGeo) {
    sharedRipplePlaneGeo = new THREE.PlaneGeometry(1.0, 1.0);
    sharedRipplePlaneGeo.rotateX(-Math.PI / 2);
  }
  if (!sharedRippleTexture) {
    // Procedural multi-ring concentric water wave texture with soft specular falloff
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);

    // Outer primary crest ring
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
  return {
    ripplePlaneGeo: sharedRipplePlaneGeo,
    rippleTex: sharedRippleTexture,
    dropGeo: sharedDropGeo,
    dropMat: sharedDropMat,
  };
}

const MAX_SHADER_RIPPLES = 8;

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; lookAt: [number, number, number] }
> = {
  angled: { pos: [0, 12.6, 9.8], lookAt: [0, -0.35, 0.5] },
  top: { pos: [0, 16.2, 2.0], lookAt: [0, 0, 0.2] },
  closeup: { pos: [0, 9.6, 11.6], lookAt: [0, -0.45, 0.7] },
};

// Detect software WebGL from GPU renderer string
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
    const activeKoiRef = useRef<ActiveKoiEntity[]>([]);
    const flyingFishRef = useRef<FlyingFishArc[]>([]);
    const waterRingsRef = useRef<WaterRingEffect[]>([]);
    const dropletsRef = useRef<SplashDroplet[]>([]);
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
    const swimBoundsRef = useRef<{ x: number; z: number }>({ x: 5.4, z: 3.2 });

    // Dynamically adjust renderer pixel ratio & shadow maps when performanceMode changes
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

    // Trigger a GPU 3D vertex wave impulse on the water surface mesh
    const triggerSurfaceWaveImpulse = (x: number, z: number, strength = 1.0) => {
      const idx = nextRippleSlotRef.current % MAX_SHADER_RIPPLES;
      nextRippleSlotRef.current++;
      // vec4(x, elapsed, z, strength)
      shaderRipplesRef.current[idx].set(x, 0.001, z, strength);
    };

    // Spawn 3D concentric ripple waves on the water surface (for 'spawn', 'catch', or 'touch')
    const spawn3DWaterRipple = (
      x: number,
      z: number,
      type: RippleType = 'touch'
    ) => {
      const effectsGroup = effectsGroupRef.current;
      if (!effectsGroup) return;

      const { ripplePlaneGeo, rippleTex } = getSharedEffectAssets();
      const isLite = performanceModeRef.current === 'lite';

      // Trigger GPU 3D water surface vertex wave displacement
      const waveStrength =
        type === 'catch' ? 1.85 : type === 'spawn' ? 1.15 : 0.9;
      triggerSurfaceWaveImpulse(x, z, waveStrength);

      if (type === 'catch') {
        // Multi-wave golden + bright cyan celebration ripple cascade when catching a fish
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
        // Crisp expanding emergence ripple rings when each Koi fish appears in the pond
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
        // Standard touch/jump water ripple
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

    // Helper: spawn lightweight 3D water splash droplets
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

    // Helper: trigger 3D Fishing Net scoop animation
    const trigger3DNetScoop = (x: number, z: number) => {
      if (!netObjRef.current) return;
      netObjRef.current.active = true;
      netObjRef.current.elapsed = 0;
      netObjRef.current.x = x;
      netObjRef.current.z = z;
      netObjRef.current.group.visible = true;
    };

    // Helper: launch 3D parabolic jump of caught Koi into the wooden bucket
    const launchKoiIntoBucket = (koi: ActiveKoiEntity) => {
      const effectsGroup = effectsGroupRef.current;
      const bucket = bucketObjRef.current;
      if (!effectsGroup || !bucket) return;

      const flyingClone = create3DKoiFish(
        koi.palette,
        koi.answer,
        koi.index + 1,
        maxAnisotropyRef.current,
        false
      );
      flyingClone.badgeSprite.visible = false;
      flyingClone.badgePedestal.visible = false;
      flyingClone.shadowPlane.visible = false;
      flyingClone.root.position.set(koi.x, 0.2, koi.z);
      effectsGroup.add(flyingClone.root);

      const endPos = new THREE.Vector3(
        bucket.bucketGroup.position.x,
        bucket.bucketGroup.position.y + 1.3,
        bucket.bucketGroup.position.z
      );

      flyingFishRef.current.push({
        group: flyingClone.root,
        startPos: new THREE.Vector3(koi.x, 0.2, koi.z),
        endPos,
        elapsed: 0,
        duration: 0.58,
      });
    };

    const handleKoiInteraction = (koi: ActiveKoiEntity) => {
      if (koi.caught || gameStateRef.current !== 'playing') return;

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

      const isCorrect = onFishClickedRef.current(
        koi.answer,
        screenX,
        screenY,
        koi.index
      );

      if (isCorrect) {
        // Trigger rich 3D catch ripple waves & splash droplets
        spawn3DWaterRipple(koi.x, koi.z, 'catch');
        spawn3DSplashDroplets(koi.x, koi.z, 9);

        koi.caught = true;
        koi.model.root.visible = false;
        activeKoiRef.current.forEach((f) => {
          f.caught = true;
        });
        launchKoiIntoBucket(koi);
      } else {
        spawn3DWaterRipple(koi.x, koi.z, 'touch');
        spawn3DSplashDroplets(koi.x, koi.z, 5);
        koi.caught = true;
        koi.model.swimGroup.position.y = -0.65;
        koi.model.badgeSprite.material.opacity = 0.35;
      }
    };

    useImperativeHandle(ref, () => ({
      spawnQuestionFish: (items: FishSpawnItem[], level: number) => {
        const fishGroup = fishGroupRef.current;
        if (!fishGroup) return;

        while (fishGroup.children.length > 0) {
          const child = fishGroup.children[0];
          fishGroup.remove(child);
        }
        activeKoiRef.current = [];

        const baseSpeed = 1.95 + Math.min(level * 0.24, 2.8);
        const isPortrait = window.innerWidth < window.innerHeight;
        const cols = isPortrait ? 2 : 3;
        const rows = Math.ceil(items.length / cols);

        const bX = swimBoundsRef.current.x * 0.85;
        const bZ = swimBoundsRef.current.z * 0.85;
        const pondWidth = bX * 2;
        const pondDepth = bZ * 2;

        const fishScale = isPortrait ? 1.12 : 1.0;
        const enableShadows =
          performanceModeRef.current === 'hd' && !isSoftwareGl;

        items.forEach((item, idx) => {
          const palette = KOI_PALETTES[item.paletteIndex % KOI_PALETTES.length];
          const model = create3DKoiFish(
            palette,
            item.answer,
            idx + 1,
            maxAnisotropyRef.current,
            enableShadows
          );

          if (isPortrait) {
            model.badgeSprite.scale.set(1.48, 1.48, 1);
          }

          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const cellW = pondWidth / cols;
          const cellD = pondDepth / Math.max(1, rows);

          const startX =
            -pondWidth / 2 +
            col * cellW +
            cellW * 0.5 +
            (Math.random() - 0.5) * 0.8;
          const startZ =
            -pondDepth / 2 +
            row * cellD +
            cellD * 0.5 +
            (Math.random() - 0.5) * 0.7;

          const angle = Math.random() * Math.PI * 2;
          const speed = baseSpeed * (0.92 + Math.random() * 0.16);

          // Start slightly submerged & small so the Koi emerges with a 3D water ripple!
          model.root.position.set(startX, -0.75, startZ);
          model.root.scale.setScalar(fishScale * 0.25);
          model.root.rotation.y = -angle;
          fishGroup.add(model.root);

          // Trigger 3D spawn ripple on the pond surface where each fish emerges
          spawn3DWaterRipple(startX, startZ, 'spawn');

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
            targetScale: fishScale,
            spawnElapsed: -idx * 0.05, // staggered emergence
            wanderPhase: Math.random() * Math.PI * 2,
            swimCycle: Math.random() * 10,
            isJumping: false,
            jumpTime: 0,
            jumpDuration: 0.72,
            jumpCooldown: 2.4 + idx * 1.4 + Math.random() * 2.5,
            caught: false,
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

      triggerBucketCelebration: (totalCaught: number) => {
        if (bucketObjRef.current) {
          bucketObjRef.current.bounceTime = 0.45;
          bucketObjRef.current.caughtTailGroup.visible = totalCaught > 0;
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

      // 1. Initialize Renderer with Mobile-Friendly PixelRatio & Fast Shader Setup
      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl && !isInitialLite,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
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

      // 2. Scene, Fog & Studio RoomEnvironment Reflection
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0369a1);
      scene.fog = new THREE.FogExp2(0x0369a1, 0.022);
      sceneRef.current = scene;

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(
        new RoomEnvironment(),
        0.04
      ).texture;
      pmremGenerator.dispose();

      // 3. Perspective Camera
      const camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        0.5,
        65
      );
      camera.position.set(0, 12.6, 9.8);
      camera.lookAt(0, -0.35, 0.5);
      cameraRef.current = camera;

      // 4. Studio 3-Point Lighting Rig
      const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0c4a6e, 1.25);
      hemiLight.position.set(0, 25, 0);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.1);
      sunLight.position.set(8, 18, 10);
      sunLight.castShadow = !isInitialLite;
      sunLight.shadow.mapSize.width = 512;
      sunLight.shadow.mapSize.height = 512;
      const d = 10;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.camera.near = 1;
      sunLight.shadow.camera.far = 32;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
      scene.add(sunLight);
      sunLightRef.current = sunLight;

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
      rimLight.position.set(-10, 12, -8);
      scene.add(rimLight);

      // 5. Procedural Pond Bed with Caustics Texture
      const bedCanvas = document.createElement('canvas');
      bedCanvas.width = 256;
      bedCanvas.height = 256;
      const bCtx = bedCanvas.getContext('2d')!;
      const bedGrad = bCtx.createRadialGradient(128, 128, 16, 128, 128, 128);
      bedGrad.addColorStop(0, '#0ea5e9');
      bedGrad.addColorStop(0.65, '#0284c7');
      bedGrad.addColorStop(1, '#075985');
      bCtx.fillStyle = bedGrad;
      bCtx.fillRect(0, 0, 256, 256);

      bCtx.strokeStyle = 'rgba(186, 230, 253, 0.25)';
      bCtx.lineWidth = 2;
      for (let i = 0; i < 20; i++) {
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

      const pondBedGeo = new THREE.PlaneGeometry(32, 24);
      pondBedGeo.rotateX(-Math.PI / 2);
      const pondBedMat = new THREE.MeshLambertMaterial({
        map: bedTex,
      });
      const pondBed = new THREE.Mesh(pondBedGeo, pondBedMat);
      pondBed.position.y = -1.15;
      pondBed.receiveShadow = true;
      scene.add(pondBed);

      // 6. Interactive 3D Rippling Water Surface (GPU Vertex & Specular Ripple Shader via onBeforeCompile)
      const waterUniforms = {
        uTime: { value: 0 },
        uRipples: { value: shaderRipplesRef.current },
      };
      const waterGeo = new THREE.PlaneGeometry(24, 18, 28, 20);
      waterGeo.rotateX(-Math.PI / 2);

      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.14,
        metalness: 0.12,
        transparent: true,
        opacity: 0.38,
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
      waterSurface.position.y = 0.0;
      scene.add(waterSurface);

      // 7. InstancedMesh Natural River Stones & Underwater Pebbles (36 stones)
      const rockCount = 36;
      const rockGeo = new THREE.DodecahedronGeometry(0.65, 0);
      const rockMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
      });
      const rockInstanced = new THREE.InstancedMesh(
        rockGeo,
        rockMat,
        rockCount
      );

      for (let i = 0; i < rockCount; i++) {
        if (i < 24) {
          const angle = (i / 24) * Math.PI * 2;
          const rx = 8.2 + (Math.random() - 0.5) * 0.6;
          const rz = 5.3 + (Math.random() - 0.5) * 0.5;
          _dummyPos.set(Math.cos(angle) * rx, -0.15, Math.sin(angle) * rz);
          _dummyScale.set(
            1.15 + Math.random() * 0.65,
            0.65 + Math.random() * 0.4,
            1.05 + Math.random() * 0.6
          );
        } else {
          _dummyPos.set(
            (Math.random() - 0.5) * 11,
            -1.08,
            (Math.random() - 0.5) * 7
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

        const shade = 0.4 + Math.random() * 0.25;
        _dummyColor.setRGB(shade * 0.85, shade * 0.95, shade);
        rockInstanced.setColorAt(i, _dummyColor);
      }
      rockInstanced.instanceMatrix.needsUpdate = true;
      if (rockInstanced.instanceColor)
        rockInstanced.instanceColor.needsUpdate = true;
      rockInstanced.computeBoundingSphere();
      scene.add(rockInstanced);

      // 8. InstancedMesh Rising Underwater Bubbles (18 bubbles)
      const bubbleCount = 18;
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
        x: (Math.random() - 0.5) * 10,
        y: -1.1 + Math.random() * 1.1,
        z: (Math.random() - 0.5) * 6.5,
        speed: 0.35 + Math.random() * 0.4,
        scale: 0.6 + Math.random() * 0.8,
      }));
      scene.add(bubbleInstanced);

      // 9. 3D Blooming Lotus & Lily Pads at the Pond Corners
      const lilyPositions = [
        { x: -5.8, z: -3.2, rot: 0.4, scale: 0.9, lotus: true },
        { x: 5.8, z: -3.1, rot: -0.8, scale: 0.88, lotus: true },
        { x: -5.9, z: 3.0, rot: 1.2, scale: 0.82, lotus: true },
        { x: 5.9, z: 2.5, rot: 3.5, scale: 0.7, lotus: false },
      ];
      const lilyPads: THREE.Group[] = [];
      lilyPositions.forEach((lp) => {
        const pad = create3DLilyPad(lp.lotus, lp.scale);
        pad.position.set(lp.x, 0.01, lp.z);
        pad.rotation.y = lp.rot;
        scene.add(pad);
        lilyPads.push(pad);
      });

      // 10. 3D Wooden Fish Bucket
      const { bucketGroup, caughtTailGroup } = create3DWoodenBucket();
      bucketGroup.position.set(4.8, -0.1, 3.3);
      bucketGroup.scale.setScalar(0.82);
      scene.add(bucketGroup);
      bucketObjRef.current = {
        bucketGroup,
        caughtTailGroup,
        bounceTime: 0,
      };

      // 11. 3D Handled Fishing Net
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

      // 12. Dynamic Containers for Swimming Koi & 3D Splash Effects
      const fishGroup = new THREE.Group();
      scene.add(fishGroup);
      fishGroupRef.current = fishGroup;

      const effectsGroup = new THREE.Group();
      scene.add(effectsGroup);
      effectsGroupRef.current = effectsGroup;

      const updateViewportResponsiveness = () => {
        if (!container) return;
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        const aspect = w / h;

        camera.aspect = aspect;
        camera.fov = aspect < 0.8 ? 52 : aspect < 1.2 ? 48 : 44;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);

        if (aspect < 0.75) {
          swimBoundsRef.current = { x: 3.5, z: 3.6 };
          bucketGroup.position.set(2.9, -0.1, 3.6);
        } else if (aspect < 1.15) {
          swimBoundsRef.current = { x: 4.5, z: 3.4 };
          bucketGroup.position.set(4.0, -0.1, 3.4);
        } else {
          swimBoundsRef.current = { x: 5.5, z: 3.2 };
          bucketGroup.position.set(4.9, -0.1, 3.3);
        }
      };

      updateViewportResponsiveness();

      // Spawn decorative demo Koi for the Title Screen
      const demoItems: FishSpawnItem[] = [
        { id: 1, answer: 10, paletteIndex: 0 },
        { id: 2, answer: 50, paletteIndex: 1 },
        { id: 3, answer: 8, paletteIndex: 2 },
        { id: 4, answer: 90, paletteIndex: 3 },
      ];
      demoItems.forEach((item, idx) => {
        const palette = KOI_PALETTES[item.paletteIndex];
        const model = create3DKoiFish(
          palette,
          item.answer,
          idx + 1,
          maxAniso,
          !isInitialLite
        );
        const angle = (idx / demoItems.length) * Math.PI * 2;
        const x = Math.cos(angle) * 2.8;
        const z = Math.sin(angle) * 2.0;
        model.root.position.set(x, -0.12, z);
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
          targetScale: 1.0,
          spawnElapsed: 1.0,
          wanderPhase: idx * 1.3,
          swimCycle: idx * 2.0,
          isJumping: false,
          jumpTime: 0,
          jumpDuration: 0.72,
          jumpCooldown: 2.2 + idx * 1.5,
          caught: false,
        };
        model.hitbox.userData.koiEntity = entity;
        activeKoiRef.current.push(entity);
      });

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // 13. Multi-Device Pointer Handler
      const handlePointerDown = (e: PointerEvent) => {
        if (gameStateRef.current !== 'playing') return;

        const rect = renderer.domElement.getBoundingClientRect();
        _pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

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

        if (_raycaster.ray.intersectPlane(_waterPlane, _vec3A)) {
          let closestKoi: ActiveKoiEntity | null = null;
          let minDist = 1.95;

          for (const koi of activeKoiRef.current) {
            if (koi.caught) continue;
            const dx = koi.x - _vec3A.x;
            const dz = koi.z - _vec3A.z;
            const dist = Math.hypot(dx, dz);
            if (dist < minDist) {
              minDist = dist;
              closestKoi = koi;
            }
          }

          if (closestKoi) {
            handleKoiInteraction(closestKoi);
          } else {
            const clampedX = THREE.MathUtils.clamp(_vec3A.x, -6.0, 6.0);
            const clampedZ = THREE.MathUtils.clamp(_vec3A.z, -4.0, 4.0);
            spawn3DWaterRipple(clampedX, clampedZ, 'touch');
            spawn3DSplashDroplets(clampedX, clampedZ, 5);
            trigger3DNetScoop(clampedX, clampedZ);
            audioEngine.playWaterRippleSound();
          }
        }
      };

      const domElem = renderer.domElement;
      domElem.addEventListener('pointerdown', handlePointerDown, {
        passive: true,
      });

      window.addEventListener('resize', updateViewportResponsiveness);

      // 14. Animation Loop
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
        let targetX = preset.pos[0];
        let targetY = preset.pos[1];
        let targetZ = preset.pos[2];

        if (gameStateRef.current === 'title') {
          targetX = Math.sin(elapsed * 0.3) * 2.6;
          targetY = 12.2 + Math.cos(elapsed * 0.25) * 0.6;
          targetZ = 10.0 + Math.cos(elapsed * 0.3) * 1.0;
        }

        const aspect = camera.aspect;
        const portraitFactor =
          aspect < 1
            ? THREE.MathUtils.clamp(1.12 / Math.sqrt(aspect), 1.0, 1.38)
            : 1.0;
        targetY *= portraitFactor;
        targetZ *= portraitFactor;

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
        camera.lookAt(preset.lookAt[0], preset.lookAt[1], preset.lookAt[2]);

        lilyPads.forEach((pad, idx) => {
          pad.position.y = 0.01 + Math.sin(elapsed * 1.5 + idx * 1.2) * 0.022;
        });

        // Update rising 3D bubbles
        for (let i = 0; i < bubbleCount; i++) {
          const b = bubbleData[i];
          b.y += b.speed * dt;
          if (b.y > 0.05) {
            b.y = -1.1;
            b.x = (Math.random() - 0.5) * 10;
            b.z = (Math.random() - 0.5) * 6.5;
          }
          _dummyPos.set(b.x, b.y, b.z);
          _dummyQuat.identity();
          _dummyScale.setScalar(b.scale);
          _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
          bubbleInstanced.setMatrixAt(i, _dummyMatrix);
        }
        bubbleInstanced.instanceMatrix.needsUpdate = true;

        // Bucket jiggle & tail animation
        if (bucketObjRef.current) {
          const bObj = bucketObjRef.current;
          if (bObj.bounceTime > 0) {
            bObj.bounceTime = Math.max(0, bObj.bounceTime - dt);
            const s =
              0.82 + Math.sin(bObj.bounceTime * Math.PI * 6) * 0.14;
            bObj.bucketGroup.scale.set(s, 0.82 * 2 - s, s);
          } else {
            bObj.bucketGroup.scale.setScalar(0.82);
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

        // Advance game timer & Koi simulation
        if (gameStateRef.current !== 'paused') {
          if (gameStateRef.current === 'playing') {
            onTimeTickRef.current(dt);
          }

          const boundX = swimBoundsRef.current.x;
          const boundZ = swimBoundsRef.current.z;

          activeKoiRef.current.forEach((koi, idx) => {
            if (koi.caught) return;

            // Smooth 3D Spawn Emergence Animation (rising from water with ripple)
            let spawnDepthOffset = 0;
            if (koi.spawnElapsed < 0.45) {
              koi.spawnElapsed += dt;
              const sp = THREE.MathUtils.clamp(koi.spawnElapsed / 0.45, 0, 1);
              // Elastic pop-out curve
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

            const turnStrength = koi.speed * 4.2;
            if (koi.x < -boundX) koi.vx += turnStrength * dt;
            else if (koi.x > boundX) koi.vx -= turnStrength * dt;

            if (koi.z < -boundZ) koi.vz += turnStrength * dt;
            else if (koi.z > boundZ) koi.vz -= turnStrength * dt;

            for (let j = 0; j < activeKoiRef.current.length; j++) {
              if (idx === j || activeKoiRef.current[j].caught) continue;
              const other = activeKoiRef.current[j];
              const dx = koi.x - other.x;
              const dz = koi.z - other.z;
              const distSq = dx * dx + dz * dz;
              if (distSq < 4.5 && distSq > 0.001) {
                const dist = Math.sqrt(distSq);
                const push = (2.15 - dist) * 3.4;
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
              -boundX - 0.5,
              boundX + 0.5
            );
            koi.z = THREE.MathUtils.clamp(
              koi.z + koi.vz * dt,
              -boundZ - 0.4,
              boundZ + 0.4
            );

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
                koi.jumpCooldown = 4.2 + Math.random() * 5.5;
                spawn3DWaterRipple(koi.x, koi.z, 'touch');
              } else {
                const sinArc = Math.sin(jp * Math.PI);
                jumpHeight = sinArc * 1.25;
                jumpPitch = Math.cos(jp * Math.PI) * 0.5;
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
        }

        // Update 3D Flying Caught Fish Arcs
        for (let i = flyingFishRef.current.length - 1; i >= 0; i--) {
          const arc = flyingFishRef.current[i];
          arc.elapsed += dt;
          const t = Math.min(1, arc.elapsed / arc.duration);

          _vec3A.lerpVectors(arc.startPos, arc.endPos, t);
          const peakY = 4.0 * t * (1 - t) * 3.0;
          _vec3A.y += peakY;

          const nextT = Math.min(1, t + 0.04);
          _vec3B.lerpVectors(arc.startPos, arc.endPos, nextT);
          _vec3B.y += 4.0 * nextT * (1 - nextT) * 3.0;

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
            spawn3DWaterRipple(arc.endPos.x, arc.endPos.z, 'touch');
          }
        }

        // Update 3D Expanding Water Ripple Rings (smooth cubic-out expansion + fade)
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
