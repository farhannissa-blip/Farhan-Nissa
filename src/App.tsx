import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  PondCanvas3D,
  PondCanvas3DHandle,
  CameraPreset,
  PerformanceMode,
  FishSpawnItem,
} from './components/PondCanvas3D';
import { KOI_PALETTES } from './three/proceduralModels';
import {
  LeaderboardEntry,
  getDeviceId,
  sanitizeName,
  sanitizeSekolah,
  sanitizeKelas,
  simpanSkorGlobal,
  pantauLeaderboard,
} from './services/leaderboardService';
import { audioEngine } from './services/audioEngine';

type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

interface FloatingFeedback {
  id: number;
  x: number;
  y: number;
  mainText: string;
  subText: string;
  isPositive: boolean;
}

const PRAISE_WORDS = [
  'HEBAT!',
  'PINTAR!',
  'BENAR!',
  'LUAR BIASA!',
  'MANTAP!',
];

function detectDefaultPerformanceMode(): PerformanceMode {
  if (typeof window === 'undefined') return 'lite';
  const isCoarse =
    window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = window.innerWidth < 1024;
  return isCoarse || isSmallScreen ? 'lite' : 'hd';
}

export default function App() {
  // Player Registration State
  const [namaInput, setNamaInput] = useState('');
  const [sekolahInput, setSekolahInput] = useState('SDN 66 Banda Aceh');
  const [kelasInput, setKelasInput] = useState('');
  const [formError, setFormError] = useState(false);

  // Active Player Profile
  const [playerProfile, setPlayerProfile] = useState({
    nama: 'Pemain Bintang',
    sekolah: 'SDN 66 Banda Aceh',
    kelas: '2A',
  });

  // Game State
  const [gameState, setGameState] = useState<GameScreenState>('title');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [fishCaught, setFishCaught] = useState(0);
  const [comboStreak, setComboStreak] = useState(0);
  const [questionText, setQuestionText] = useState('10 × 5');
  const [questionAnimKey, setQuestionAnimKey] = useState(0);
  const [activeChoices, setActiveChoices] = useState<FishSpawnItem[]>([]);

  // 3D Viewport & Multi-Device Controls
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('angled');
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(
    detectDefaultPerformanceMode
  );
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [levelUpBanner, setLevelUpBanner] = useState<number | null>(null);
  const [screenShake, setScreenShake] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FloatingFeedback[]>([]);

  // Leaderboard Modal State
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardList, setLeaderboardList] = useState<LeaderboardEntry[]>(
    []
  );
  const [lastPlayedStats, setLastPlayedStats] = useState<{
    score: number;
    fish: number;
  } | null>(null);

  // Mutable refs for 60fps simulation loop
  const pondRef = useRef<PondCanvas3DHandle | null>(null);
  const timerBarRef = useRef<HTMLDivElement | null>(null);
  const timeRemainingRef = useRef<number>(15);
  const maxTimeRef = useRef<number>(15);
  const currentAnswerRef = useRef<number>(50);
  const isTransitioningRef = useRef<boolean>(false);

  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(3);
  const fishCaughtRef = useRef(0);
  const comboRef = useRef(0);
  const playerProfileRef = useRef(playerProfile);
  playerProfileRef.current = playerProfile;

  const spawnFloatingFeedback = useCallback(
    (
      x: number,
      y: number,
      mainText: string,
      subText: string,
      isPositive: boolean
    ) => {
      const id = Date.now() + Math.random();
      setFeedbacks((prev) => [
        ...prev.slice(-3),
        { id, x, y, mainText, subText, isPositive },
      ]);
      window.setTimeout(() => {
        setFeedbacks((prev) => prev.filter((item) => item.id !== id));
      }, 900);
    },
    []
  );

  // Generate a new Multiplication 1 & 10 Question and spawn 3D Koi Fish
  const generateNextQuestion = useCallback((targetLevel: number) => {
    isTransitioningRef.current = false;

    const fishCount = Math.min(3 + Math.floor(targetLevel / 2), 6);
    const maxTime = Math.max(15 - (targetLevel - 1) * 1.2, 6.0);
    maxTimeRef.current = maxTime;
    timeRemainingRef.current = maxTime;

    if (timerBarRef.current) {
      timerBarRef.current.style.transform = 'scaleX(1)';
    }

    const isTen = Math.random() > 0.45;
    const factor1 = isTen ? 10 : 1;
    const factor2 = Math.floor(Math.random() * 10) + 1;
    const correctAns = factor1 * factor2;
    currentAnswerRef.current = correctAns;

    const swapOrder = Math.random() > 0.5;
    const qStr = swapOrder
      ? `${factor2} × ${factor1}`
      : `${factor1} × ${factor2}`;
    setQuestionText(qStr);
    setQuestionAnimKey((k) => k + 1);

    const answers: number[] = [correctAns];
    let guard = 0;
    while (answers.length < fishCount && guard < 50) {
      guard++;
      const wIsTen = Math.random() > 0.5;
      const wrong = (Math.floor(Math.random() * 10) + 1) * (wIsTen ? 10 : 1);
      if (!answers.includes(wrong) && wrong !== correctAns) {
        answers.push(wrong);
      }
    }
    answers.sort(() => Math.random() - 0.5);

    const spawnItems: FishSpawnItem[] = answers.map((ans, idx) => ({
      id: Date.now() + idx,
      answer: ans,
      paletteIndex: idx,
    }));

    setActiveChoices(spawnItems);
    pondRef.current?.spawnQuestionFish(spawnItems, targetLevel);
  }, []);

  // Finish Game & Save Global Score
  const triggerGameOver = useCallback(() => {
    setGameState('gameover');
    audioEngine.stopBGM();
    audioEngine.playLevelUpSound();

    const finalScore = scoreRef.current;
    const finalFish = fishCaughtRef.current;
    setLastPlayedStats({ score: finalScore, fish: finalFish });

    if (finalScore > 0) {
      const prof = playerProfileRef.current;
      simpanSkorGlobal(prof.nama, prof.sekolah, prof.kelas, finalScore);
    }
  }, []);

  // Handle Mistake (Wrong Fish or Time Expired)
  const handleMistake = useCallback(
    (screenX: number, screenY: number, reasonText: string) => {
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;

      comboRef.current = 0;
      setComboStreak(0);
      audioEngine.playWrongSound();

      const nextLives = livesRef.current - 1;
      livesRef.current = nextLives;
      setLives(nextLives);

      spawnFloatingFeedback(screenX, screenY, '-1 NYAWA', reasonText, false);
      pondRef.current?.triggerMistakeShake();
      setScreenShake(true);
      window.setTimeout(() => setScreenShake(false), 380);

      if (nextLives <= 0) {
        window.setTimeout(() => {
          triggerGameOver();
        }, 420);
      } else {
        window.setTimeout(() => {
          generateNextQuestion(levelRef.current);
        }, 460);
      }
    },
    [generateNextQuestion, spawnFloatingFeedback, triggerGameOver]
  );

  // Handle 3D Koi Fish Clicked / Tapped
  const handleFishClicked = useCallback(
    (
      answer: number,
      screenX: number,
      screenY: number,
      _fishIndex: number
    ): boolean => {
      if (isTransitioningRef.current) return false;

      if (answer === currentAnswerRef.current) {
        isTransitioningRef.current = true;

        const nextCombo = comboRef.current + 1;
        comboRef.current = nextCombo;
        setComboStreak(nextCombo);

        audioEngine.playCatchSound(nextCombo);

        const nextScore = scoreRef.current + 10;
        scoreRef.current = nextScore;
        setScore(nextScore);

        const nextFish = fishCaughtRef.current + 1;
        fishCaughtRef.current = nextFish;
        setFishCaught(nextFish);

        let nextLevel = levelRef.current;
        if (nextFish % 5 === 0) {
          nextLevel = levelRef.current + 1;
          levelRef.current = nextLevel;
          setLevel(nextLevel);
          audioEngine.playLevelUpSound();
          setLevelUpBanner(nextLevel);
          window.setTimeout(() => setLevelUpBanner(null), 1400);
        }

        pondRef.current?.triggerBucketCelebration(nextFish);

        const praise =
          PRAISE_WORDS[Math.floor(Math.random() * PRAISE_WORDS.length)];
        const subText =
          nextCombo >= 2 ? `${praise} Combo x${nextCombo}` : praise;
        spawnFloatingFeedback(screenX, screenY, '+10', subText, true);

        window.setTimeout(() => {
          generateNextQuestion(nextLevel);
        }, 480);

        return true;
      } else {
        handleMistake(screenX, screenY, 'SALAH IKAN!');
        return false;
      }
    },
    [generateNextQuestion, handleMistake, spawnFloatingFeedback]
  );

  // Per-frame Timer Update without React Re-renders
  const handleTimeTick = useCallback(
    (dt: number) => {
      if (isTransitioningRef.current) return;
      timeRemainingRef.current -= dt;
      const ratio = Math.max(0, timeRemainingRef.current / maxTimeRef.current);
      if (timerBarRef.current) {
        timerBarRef.current.style.transform = `scaleX(${ratio.toFixed(4)})`;
      }
      if (timeRemainingRef.current <= 0) {
        handleMistake(
          window.innerWidth / 2,
          window.innerHeight / 2,
          'WAKTU HABIS!'
        );
      }
    },
    [handleMistake]
  );

  // Start Game Validation & Initialization
  const handleStartGame = useCallback(() => {
    if (!namaInput.trim() || !kelasInput.trim()) {
      setFormError(true);
      audioEngine.init();
      audioEngine.playWrongSound();
      return;
    }

    setFormError(false);
    const cleanProfile = {
      nama: sanitizeName(namaInput),
      sekolah: sanitizeSekolah(sekolahInput),
      kelas: sanitizeKelas(kelasInput),
    };
    setPlayerProfile(cleanProfile);
    playerProfileRef.current = cleanProfile;

    scoreRef.current = 0;
    levelRef.current = 1;
    livesRef.current = 3;
    fishCaughtRef.current = 0;
    comboRef.current = 0;

    setScore(0);
    setLevel(1);
    setLives(3);
    setFishCaught(0);
    setComboStreak(0);
    setGameState('playing');

    audioEngine.init();
    audioEngine.startBGM();
    pondRef.current?.triggerBucketCelebration(0);

    window.setTimeout(() => {
      generateNextQuestion(1);
    }, 50);
  }, [generateNextQuestion, kelasInput, namaInput, sekolahInput]);

  // Toggle Pause
  const handleTogglePause = useCallback(() => {
    setGameState((prev) => {
      if (prev === 'playing') {
        audioEngine.stopBGM();
        return 'paused';
      }
      if (prev === 'paused') {
        if (!audioEngine.isMuted) audioEngine.startBGM();
        return 'playing';
      }
      return prev;
    });
  }, []);

  // Toggle Mute
  const handleToggleAudio = useCallback(() => {
    const muted = audioEngine.toggleMute(gameState === 'playing');
    setIsMuted(muted);
  }, [gameState]);

  // Toggle Fullscreen (Great for Classroom PID / Tablet / HP)
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Subscribe to Global Leaderboard when modal opens
  useEffect(() => {
    if (!showLeaderboard) return;
    const unsubscribe = pantauLeaderboard((entries) => {
      setLeaderboardList(entries);
    });
    return () => unsubscribe();
  }, [showLeaderboard]);

  // Keyboard Shortcuts (1-6 to catch fish, Space/Enter to start, Esc to pause, H to toggle dock)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Enter' && gameState === 'title') {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (showLeaderboard) {
          setShowLeaderboard(false);
        } else if (gameState === 'playing' || gameState === 'paused') {
          handleTogglePause();
        }
      } else if (e.key.toLowerCase() === 'h' && gameState === 'playing') {
        setDockCollapsed((prev) => !prev);
      } else if (
        gameState === 'playing' &&
        ['1', '2', '3', '4', '5', '6'].includes(e.key)
      ) {
        const idx = parseInt(e.key, 10) - 1;
        pondRef.current?.triggerCatchByIndex(idx);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, handleStartGame, handleTogglePause, showLeaderboard]);

  const myDeviceId = getDeviceId();

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden select-none ${
        screenShake ? 'animate-shake' : ''
      }`}
    >
      {/* 1. Full-Viewport 3D Three.js Koi Pond Canvas */}
      <PondCanvas3D
        ref={pondRef}
        gameState={gameState}
        cameraPreset={cameraPreset}
        performanceMode={performanceMode}
        onFishClicked={handleFishClicked}
        onTimeTick={handleTimeTick}
      />

      {/* 2. Floating Score / Combo Popups in Screen Space */}
      <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden">
        {feedbacks.map((fb) => (
          <div
            key={fb.id}
            style={{ left: `${fb.x}px`, top: `${fb.y}px` }}
            className="absolute animate-score-float text-center"
          >
            <div
              className={`title-font text-2xl sm:text-3xl md:text-4xl drop-shadow-[0_3px_0_rgba(0,0,0,0.45)] ${
                fb.isPositive ? 'text-amber-300' : 'text-rose-400'
              }`}
            >
              {fb.mainText}
            </div>
            <div className="bg-sky-950/92 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-lg border border-sky-400/50 shadow-md whitespace-nowrap">
              {fb.subText}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Level Up Celebration Banner */}
      {levelUpBanner !== null && (
        <div className="fixed inset-0 pointer-events-none z-35 flex items-center justify-center p-4">
          <div className="bg-amber-400 text-sky-950 px-7 py-3.5 rounded-3xl border-4 border-white shadow-2xl text-center animate-pop-in">
            <p className="text-xs font-extrabold uppercase tracking-widest text-amber-950">
              LUAR BIASA!
            </p>
            <p className="title-font text-2xl sm:text-3xl md:text-4xl mt-0.5">
              NAIK LEVEL {levelUpBanner}!
            </p>
          </div>
        </div>
      )}

      {/* ================= TITLE SCREEN OVERLAY ================= */}
      {gameState === 'title' && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center p-3 sm:p-4 overflow-y-auto pointer-events-auto">
          <div className="bg-sky-950/94 border-2 border-sky-400/70 rounded-3xl p-5 sm:p-6 md:p-7 text-center w-full max-w-md shadow-2xl text-white my-auto animate-pop-in">
            {/* School Identity Line */}
            <div className="text-[11px] sm:text-xs font-bold tracking-widest uppercase text-amber-300 mb-1">
              SDN 66 BANDA ACEH · EDISI 3D INTERAKTIF
            </div>

            {/* Bespoke SVG Title Lockup */}
            <div className="my-1">
              <svg
                viewBox="0 0 420 88"
                className="w-full max-w-[330px] sm:max-w-[360px] mx-auto h-auto overflow-visible"
                role="img"
                aria-label="Pandai Menangkap Ikan Perkalian 1 dan 10"
              >
                <defs>
                  <linearGradient
                    id="goldTitleGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#fde047" />
                    <stop offset="50%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <text
                  x="210"
                  y="36"
                  textAnchor="middle"
                  fill="#ffffff"
                  stroke="#0369a1"
                  strokeWidth="6"
                  paintOrder="stroke"
                  fontFamily="Fredoka, sans-serif"
                  fontWeight="700"
                  fontSize="30"
                >
                  Pandai Menangkap Ikan
                </text>
                <text
                  x="210"
                  y="74"
                  textAnchor="middle"
                  fill="url(#goldTitleGrad)"
                  stroke="#78350f"
                  strokeWidth="5"
                  paintOrder="stroke"
                  fontFamily="Fredoka, sans-serif"
                  fontWeight="700"
                  fontSize="26"
                >
                  Perkalian 1 &amp; 10 (3D)
                </text>
              </svg>
            </div>

            <p className="text-sky-200 text-xs sm:text-sm font-medium mb-3.5">
              Tangkap ikan Koi 3D yang membawa jawaban perkalian yang tepat!
            </p>

            {formError && (
              <div className="mb-3 p-2 bg-rose-900/90 border border-rose-400 rounded-xl text-rose-100 font-bold text-xs">
                Mohon isi Nama Pemain dan Kelas terlebih dahulu!
              </div>
            )}

            <div className="flex flex-col gap-2.5 mb-4 text-left">
              <div>
                <label
                  htmlFor="reg-nama"
                  className="block text-[11px] font-bold text-sky-300 mb-1 ml-1"
                >
                  Nama Siswa
                </label>
                <input
                  id="reg-nama"
                  type="text"
                  value={namaInput}
                  onChange={(e) => {
                    setNamaInput(e.target.value);
                    if (formError) setFormError(false);
                  }}
                  placeholder="Ketik Nama Pemain..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-sky-900/90 text-white border border-sky-500/70 focus:border-amber-400 outline-none font-bold text-sm placeholder-sky-400/70 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="reg-sekolah"
                    className="block text-[11px] font-bold text-sky-300 mb-1 ml-1"
                  >
                    Sekolah
                  </label>
                  <input
                    id="reg-sekolah"
                    type="text"
                    value={sekolahInput}
                    onChange={(e) => setSekolahInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-sky-900/90 text-white border border-sky-500/70 focus:border-amber-400 outline-none font-semibold text-sm transition"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-kelas"
                    className="block text-[11px] font-bold text-sky-300 mb-1 ml-1"
                  >
                    Kelas
                  </label>
                  <input
                    id="reg-kelas"
                    type="text"
                    value={kelasInput}
                    onChange={(e) => {
                      setKelasInput(e.target.value);
                      if (formError) setFormError(false);
                    }}
                    placeholder="Contoh: 2A / 3B"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-sky-900/90 text-white border border-sky-500/70 focus:border-amber-400 outline-none font-bold text-sm placeholder-sky-400/70 transition"
                  />
                </div>
              </div>
            </div>

            {/* Device Graphics Mode Selector on Start Screen */}
            <div className="flex items-center justify-between bg-sky-900/80 border border-sky-700/80 rounded-xl px-3 py-2 mb-3.5 text-xs">
              <span className="text-sky-200 font-semibold">
                Mode Grafis (HP / PID / Laptop):
              </span>
              <div className="flex items-center gap-1 bg-sky-950 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPerformanceMode('lite')}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer whitespace-nowrap ${
                    performanceMode === 'lite'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-sky-300 hover:text-white'
                  }`}
                >
                  Ringan (HP/PID)
                </button>
                <button
                  type="button"
                  onClick={() => setPerformanceMode('hd')}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer whitespace-nowrap ${
                    performanceMode === 'hd'
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-sky-300 hover:text-white'
                  }`}
                >
                  HD
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartGame}
              className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold py-3.5 px-6 rounded-xl text-base shadow-lg transition active:scale-95 mb-2.5 cursor-pointer whitespace-nowrap"
            >
              MULAI BERMAIN 3D
            </button>

            <button
              type="button"
              onClick={() => setShowLeaderboard(true)}
              className="w-full bg-sky-800 hover:bg-sky-700 text-sky-100 font-bold py-2.5 px-5 rounded-xl border border-sky-500/60 text-sm transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Peringkat Global Top 100
            </button>

            {/* Flat Control Hint Line */}
            <p className="mt-3.5 text-[11px] text-sky-300/90 font-medium">
              Sentuh Ikan 3D / Tombol Jawaban · Angka 1–6 · Esc Jeda
            </p>
          </div>
        </div>
      )}

      {/* ================= PLAYING HUD (RESPONSIVE FOR HP, TABLET, PID & LAPTOP) ================= */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2 sm:p-3.5 md:p-5">
          {/* Top Perimeter Status Cluster */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-2 w-full max-w-6xl mx-auto">
            {/* Left Cluster: Level, Score & Combo */}
            <div className="pointer-events-auto bg-sky-950/92 border border-sky-400/60 rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2.5 sm:gap-4 text-white shadow-lg">
              <div>
                <span className="block text-[9px] sm:text-[10px] font-bold text-sky-300 uppercase tracking-wider">
                  Level
                </span>
                <span className="title-font text-lg sm:text-xl md:text-2xl mono-num text-white leading-none">
                  {level}
                </span>
              </div>

              <div className="w-px h-6 bg-sky-700" />

              <div>
                <span className="block text-[9px] sm:text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  Skor
                </span>
                <span className="title-font text-lg sm:text-xl md:text-2xl mono-num text-amber-400 leading-none">
                  {score}
                </span>
              </div>

              {comboStreak >= 2 && (
                <>
                  <div className="w-px h-6 bg-sky-700 hidden sm:block" />
                  <div className="text-[11px] sm:text-xs font-extrabold text-amber-300 mono-num whitespace-nowrap">
                    x{comboStreak}
                  </div>
                </>
              )}
            </div>

            {/* Center Cluster: 3 Hearts Lives */}
            <div
              className="pointer-events-auto bg-sky-950/92 border border-sky-400/60 rounded-2xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 flex items-center gap-1 sm:gap-1.5 shadow-lg"
              aria-label={`Nyawa tersisa: ${lives}`}
            >
              {[0, 1, 2].map((idx) => {
                const alive = idx < lives;
                return (
                  <svg
                    key={idx}
                    className={`w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 transition-transform ${
                      alive
                        ? 'text-rose-500 scale-100'
                        : 'text-slate-600 scale-90'
                    }`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                  </svg>
                );
              })}
            </div>

            {/* Right Cluster: Performance Toggle, Fullscreen (PID/Tablet), Audio & Pause */}
            <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() =>
                  setPerformanceMode((m) => (m === 'lite' ? 'hd' : 'lite'))
                }
                title="Ubah Mode Performa Grafis (Ringan HP/PID vs HD)"
                className={`px-2.5 py-2 rounded-xl border text-[11px] font-extrabold shadow-lg transition active:scale-95 cursor-pointer whitespace-nowrap ${
                  performanceMode === 'lite'
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                    : 'bg-sky-950/90 text-amber-300 border-sky-400/60'
                }`}
              >
                {performanceMode === 'lite' ? 'Mode Ringan' : 'Mode HD'}
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh (PID / Tablet)'}
                className="hidden sm:flex bg-sky-950/92 hover:bg-sky-900 text-sky-100 border border-sky-400/60 p-2 sm:p-2.5 rounded-xl shadow-lg transition active:scale-95 cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>

              <button
                type="button"
                onClick={handleToggleAudio}
                title={isMuted ? 'Nyalakan Suara' : 'Matikan Suara'}
                className="bg-sky-950/92 hover:bg-sky-900 text-sky-100 border border-sky-400/60 p-2 sm:p-2.5 rounded-xl shadow-lg transition active:scale-95 cursor-pointer"
              >
                {isMuted ? (
                  <svg
                    className="w-5 h-5 text-rose-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-sky-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={handleTogglePause}
                title="Jeda Permainan (Esc)"
                className="bg-sky-950/92 hover:bg-sky-900 text-sky-100 border border-sky-400/60 p-2 sm:p-2.5 rounded-xl shadow-lg transition active:scale-95 cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                    d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Unified Collapsible Bottom Control Dock */}
          <div className="pointer-events-auto w-full max-w-4xl mx-auto flex flex-col items-center">
            <button
              type="button"
              onClick={() => setDockCollapsed((c) => !c)}
              className="bg-sky-950/92 hover:bg-sky-900 text-sky-200 border border-b-0 border-sky-400/60 px-4 py-1 rounded-t-xl text-[11px] font-bold transition cursor-pointer whitespace-nowrap"
            >
              {dockCollapsed
                ? '▴ Tampilkan Panel Soal & Tombol Cepat'
                : '▾ Sembunyikan Panel'}
            </button>

            {!dockCollapsed && (
              <div className="w-full bg-sky-950/94 border-2 border-sky-400/70 rounded-2xl p-2.5 sm:p-3.5 shadow-2xl text-white relative overflow-hidden">
                {/* Smooth Timer Progress Bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 sm:h-2 bg-sky-900 overflow-hidden">
                  <div
                    ref={timerBarRef}
                    className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 w-full origin-left"
                  />
                </div>

                <div className="flex flex-col md:flex-row items-center justify-between gap-2.5 pt-1">
                  {/* Left: Active Multiplication Prompt */}
                  <div className="flex items-center justify-between md:justify-start w-full md:w-auto gap-3 px-1">
                    <div>
                      <span className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-300">
                        Tangkap Ikan Hasil Dari:
                      </span>
                      <div
                        key={questionAnimKey}
                        className="title-font text-2xl sm:text-3xl md:text-4xl text-amber-300 mono-num animate-pop-in leading-tight"
                      >
                        {questionText} = ?
                      </div>
                    </div>

                    {/* Caught Fish Counter on Mobile next to Question */}
                    <div className="bg-sky-900/90 border border-sky-600/70 rounded-xl px-3 py-1 text-center shrink-0">
                      <span className="block text-[9px] font-bold text-sky-300 uppercase">
                        Tangkapan
                      </span>
                      <span className="title-font text-sm sm:text-base text-white mono-num">
                        {fishCaught} Ikan
                      </span>
                    </div>
                  </div>

                  {/* Center: Quick-Tap Answer Buttons for Ergonomic HP Thumb & Classroom PID Reach */}
                  <div
                    className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap"
                    role="group"
                    aria-label="Pilihan Jawaban Cepat"
                  >
                    {activeChoices.map((choice, idx) => {
                      const palette =
                        KOI_PALETTES[choice.paletteIndex % KOI_PALETTES.length];
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() =>
                            pondRef.current?.triggerCatchByIndex(idx)
                          }
                          style={{ borderColor: palette.border }}
                          className="min-w-[52px] sm:min-w-[60px] bg-white hover:bg-amber-50 active:scale-90 text-slate-950 border-[3px] rounded-xl px-2.5 py-1.5 shadow-md transition flex flex-col items-center justify-center cursor-pointer"
                        >
                          <span className="title-font text-base sm:text-lg mono-num leading-none">
                            {choice.answer}
                          </span>
                          <span className="text-[9px] font-bold text-slate-500 leading-none mt-0.5">
                            Ikan #{idx + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right: Camera Angle Switcher */}
                  <div
                    className="hidden sm:flex items-center gap-1 bg-sky-900/90 p-1 rounded-xl border border-sky-700 shrink-0"
                    role="group"
                    aria-label="Sudut Kamera 3D"
                  >
                    {(
                      [
                        { id: 'angled', label: '3D' },
                        { id: 'top', label: 'Atas' },
                        { id: 'closeup', label: 'Dekat' },
                      ] as const
                    ).map((cam) => (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => setCameraPreset(cam.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          cameraPreset === cam.id
                            ? 'bg-amber-400 text-slate-950 shadow-sm'
                            : 'text-sky-200 hover:text-white'
                        }`}
                      >
                        {cam.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= PAUSE MODAL ================= */}
      {gameState === 'paused' && (
        <div className="fixed inset-0 z-50 bg-sky-950/82 flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-sky-900 border-2 border-sky-400 rounded-3xl p-6 text-center max-w-xs w-full shadow-2xl text-white animate-pop-in">
            <h3 className="title-font text-2xl text-amber-300 mb-1">
              PERMAINAN DIJEDA
            </h3>
            <p className="text-xs text-sky-200 font-medium mb-5">
              Istirahat sejenak, siap menangkap ikan Koi 3D lagi?
            </p>
            <button
              type="button"
              onClick={handleTogglePause}
              className="w-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold py-3 px-5 rounded-xl shadow-lg mb-2.5 transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              LANJUTKAN PERMAINAN
            </button>
            <button
              type="button"
              onClick={() => {
                audioEngine.stopBGM();
                setGameState('title');
              }}
              className="w-full bg-sky-800 hover:bg-sky-700 text-sky-100 font-bold py-2.5 px-5 rounded-xl text-sm border border-sky-600 transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Kembali ke Menu Utama
            </button>
          </div>
        </div>
      )}

      {/* ================= GAME OVER MODAL ================= */}
      {gameState === 'gameover' && (
        <div className="fixed inset-0 z-50 bg-sky-950/85 flex items-center justify-center p-4 overflow-y-auto pointer-events-auto">
          <div className="bg-sky-900 border-2 border-amber-400 rounded-3xl p-6 md:p-8 w-full max-w-sm text-center shadow-2xl text-white my-auto animate-pop-in">
            <div className="text-xs font-extrabold uppercase tracking-widest text-amber-300 mb-1">
              HASIL TANGKAPAN 3D
            </div>
            <h2 className="title-font text-3xl text-white mb-4">
              PERMAINAN SELESAI
            </h2>

            <div className="bg-sky-950/90 rounded-2xl p-5 mb-4 border border-sky-700">
              <div className="text-xs font-bold text-sky-300 mb-2">
                Mencapai Level {level} · Tangkapan {fishCaught} Ekor Ikan
              </div>
              <div className="text-xs font-bold uppercase tracking-widest text-amber-300 mb-1">
                Skor Akhir
              </div>
              <div className="title-font text-amber-400 text-6xl mono-num leading-none">
                {score}
              </div>
            </div>

            <div className="text-xs text-sky-200 mb-5 bg-sky-950/70 py-2.5 px-3 rounded-xl border border-sky-800 font-semibold truncate">
              {playerProfile.nama} · {playerProfile.sekolah} · Kelas{' '}
              {playerProfile.kelas}
            </div>

            <button
              type="button"
              onClick={handleStartGame}
              className="w-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold py-3.5 px-6 rounded-xl shadow-lg mb-2.5 text-base transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              MAIN LAGI
            </button>

            <button
              type="button"
              onClick={() => setShowLeaderboard(true)}
              className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold py-3 px-6 rounded-xl text-sm shadow-md mb-2 transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Lihat Peringkat Global Top 100
            </button>

            <button
              type="button"
              onClick={() => setGameState('title')}
              className="w-full bg-sky-800 hover:bg-sky-700 text-sky-200 font-bold py-2.5 px-5 rounded-xl text-xs border border-sky-700 transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Ganti Nama Pemain
            </button>
          </div>
        </div>
      )}

      {/* ================= GLOBAL TOP 100 LEADERBOARD MODAL ================= */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-60 bg-sky-950/88 flex items-center justify-center p-3 md:p-5 pointer-events-auto">
          <div className="bg-sky-900 border-2 border-amber-400 rounded-3xl p-5 md:p-6 w-full max-w-lg h-[86vh] max-h-[760px] flex flex-col shadow-2xl text-white relative animate-pop-in">
            <button
              type="button"
              onClick={() => setShowLeaderboard(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-rose-500/20 text-rose-300 rounded-full hover:bg-rose-500/40 transition font-extrabold border border-rose-400/50 cursor-pointer"
              aria-label="Tutup Peringkat"
            >
              ✕
            </button>

            <div className="text-center border-b border-sky-700/80 pb-3 mb-3">
              <h2 className="title-font text-2xl md:text-3xl text-amber-300">
                TOP 100 GLOBAL
              </h2>
              <p className="text-xs text-sky-300 font-semibold mt-0.5">
                SDN 66 Banda Aceh · 1 Perangkat = 1 Skor Terbaik
              </p>
            </div>

            {lastPlayedStats !== null && (
              <div className="mb-3 bg-sky-950/90 border border-amber-400/80 p-3 rounded-2xl flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                    Skor Terakhir Kamu ({lastPlayedStats.fish} Ikan)
                  </span>
                  <p className="text-white font-bold text-sm truncate">
                    {playerProfile.nama} · Kelas {playerProfile.kelas}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="title-font text-2xl text-amber-400 mono-num">
                    {lastPlayedStats.score}
                  </span>
                </div>
              </div>
            )}

            <ul className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              {leaderboardList.length === 0 ? (
                <li className="text-center text-sky-300 py-12 font-semibold text-sm">
                  Belum ada skor tercatat. Jadilah yang pertama!
                </li>
              ) : (
                leaderboardList.map((item, idx) => {
                  const isMe = item.device_id === myDeviceId;
                  return (
                    <li
                      key={`${item.device_id}_${idx}`}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                        isMe
                          ? 'bg-amber-500/20 border-amber-400'
                          : idx === 0
                          ? 'bg-sky-800/90 border-amber-400/60'
                          : 'bg-sky-950/75 border-sky-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-extrabold mono-num shrink-0 ${
                            idx === 0
                              ? 'bg-amber-400 text-slate-950'
                              : idx === 1
                              ? 'bg-slate-300 text-slate-950'
                              : idx === 2
                              ? 'bg-amber-600 text-white'
                              : 'bg-sky-900 text-sky-200 border border-sky-700'
                          }`}
                        >
                          #{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-white truncate">
                              {item.nama}
                            </p>
                            {isMe && (
                              <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider shrink-0">
                                · Kamu
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-sky-300 truncate">
                            {item.sekolah} · Kelas {item.kelas}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        <span className="block text-[10px] uppercase font-bold text-sky-400">
                          Skor
                        </span>
                        <span className="title-font text-xl text-amber-400 mono-num">
                          {item.skor}
                        </span>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>

            <button
              type="button"
              onClick={() => setShowLeaderboard(false)}
              className="mt-3 w-full bg-sky-800 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl border border-sky-600 text-sm transition cursor-pointer shrink-0"
            >
              Tutup Papan Peringkat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
