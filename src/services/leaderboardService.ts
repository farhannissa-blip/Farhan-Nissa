import { initializeApp, getApps } from 'firebase/app';
import {
  getDatabase,
  ref,
  push,
  onValue,
  query,
  orderByChild,
  limitToLast,
  Database,
} from 'firebase/database';

export interface LeaderboardEntry {
  device_id: string;
  nama: string;
  sekolah: string;
  kelas: string;
  skor: number;
  waktu: number;
}

const firebaseConfig = {
  apiKey: 'AIzaSyBw05_xEySpFDIt5ZOXoZ82leQWwbNBVNw',
  authDomain: 'program-77646.firebaseapp.com',
  databaseURL:
    'https://program-77646-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'program-77646',
  storageBucket: 'program-77646.firebasestorage.app',
  messagingSenderId: '968369993846',
  appId: '1:968369993846:web:781f564ced2ac358100757',
  measurementId: 'G-LHPNFLMV1L',
};

let dbInstance: Database | null = null;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey.trim() !== '') {
    const app =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    dbInstance = getDatabase(app);
  }
} catch (e) {
  console.warn('Firebase fallback to localStorage:', e);
}

const LOCAL_STORAGE_KEY = 'lb_ikan_3d_sdn66';

const INITIAL_DEMO_SCORES: LeaderboardEntry[] = [
  {
    device_id: 'seed_1',
    nama: 'Cut Meurah Nadira',
    sekolah: 'SDN 66 Banda Aceh',
    kelas: '3A',
    skor: 240,
    waktu: Date.now() - 3600000 * 5,
  },
  {
    device_id: 'seed_2',
    nama: 'Teuku Rizky Pratama',
    sekolah: 'SDN 66 Banda Aceh',
    kelas: '3B',
    skor: 210,
    waktu: Date.now() - 3600000 * 4,
  },
  {
    device_id: 'seed_3',
    nama: 'Siti Sarah Humaira',
    sekolah: 'SDN 66 Banda Aceh',
    kelas: '2A',
    skor: 180,
    waktu: Date.now() - 3600000 * 3,
  },
  {
    device_id: 'seed_4',
    nama: 'Muhammad Al-Fatih',
    sekolah: 'SDN 66 Banda Aceh',
    kelas: '2B',
    skor: 150,
    waktu: Date.now() - 3600000 * 2,
  },
  {
    device_id: 'seed_5',
    nama: 'Nabila Azzahra',
    sekolah: 'SDN 66 Banda Aceh',
    kelas: '3A',
    skor: 120,
    waktu: Date.now() - 3600000,
  },
];

export function getDeviceId(): string {
  let deviceId = localStorage.getItem('game_device_id');
  if (!deviceId) {
    deviceId =
      'dev_' +
      Math.random().toString(36).substring(2, 11) +
      '_' +
      Date.now();
    localStorage.setItem('game_device_id', deviceId);
  }
  return deviceId;
}

export function sanitizeName(name?: string | null): string {
  if (!name) return 'Pemain Bintang';
  const s = String(name).trim();
  if (
    s === '' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'null'
  ) {
    return 'Pemain Bintang';
  }
  return s;
}

export function sanitizeSekolah(sekolah?: string | null): string {
  if (!sekolah) return 'SDN 66 Banda Aceh';
  const s = String(sekolah).trim();
  if (
    s === '' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'null'
  ) {
    return 'SDN 66 Banda Aceh';
  }
  return s;
}

export function sanitizeKelas(kelas?: string | null): string {
  if (!kelas) return '-';
  const s = String(kelas).trim();
  if (
    s === '' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'null'
  ) {
    return '-';
  }
  return s;
}

export function filterUniqueDeviceScores(
  list: LeaderboardEntry[]
): LeaderboardEntry[] {
  if (!Array.isArray(list)) return [];
  const deviceMap = new Map<string, LeaderboardEntry>();

  const validList = list.filter(
    (item) =>
      item &&
      typeof item === 'object' &&
      item.skor !== undefined &&
      item.skor !== null &&
      !isNaN(Number(item.skor))
  );

  const sorted = [...validList].sort(
    (a, b) => Number(b.skor) - Number(a.skor) || (a.waktu || 0) - (b.waktu || 0)
  );

  sorted.forEach((item) => {
    const cleanName = sanitizeName(item.nama);
    const cleanSekolah = sanitizeSekolah(item.sekolah);
    const cleanKelas = sanitizeKelas(item.kelas);

    const normalized: LeaderboardEntry = {
      device_id: item.device_id || `${cleanName}_${cleanSekolah}`,
      nama: cleanName,
      sekolah: cleanSekolah,
      kelas: cleanKelas,
      skor: Number(item.skor),
      waktu: item.waktu || Date.now(),
    };

    if (!deviceMap.has(normalized.device_id)) {
      deviceMap.set(normalized.device_id, normalized);
    }
  });

  return Array.from(deviceMap.values()).sort(
    (a, b) => Number(b.skor) - Number(a.skor)
  );
}

function getLocalScores(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const oldRaw = localStorage.getItem('lb_ikan');
    const parsed: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
    const oldParsed: LeaderboardEntry[] = oldRaw ? JSON.parse(oldRaw) : [];
    return [...INITIAL_DEMO_SCORES, ...oldParsed, ...parsed];
  } catch {
    return [...INITIAL_DEMO_SCORES];
  }
}

export function simpanSkorGlobal(
  nama: string,
  sekolah: string,
  kelas: string,
  skor: number
): void {
  const device_id = getDeviceId();
  const entry: LeaderboardEntry = {
    device_id,
    nama: sanitizeName(nama),
    sekolah: sanitizeSekolah(sekolah),
    kelas: sanitizeKelas(kelas),
    skor: Number(skor),
    waktu: Date.now(),
  };

  // Always save to local storage for instant persistence
  try {
    const existing = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_KEY) || '[]'
    );
    existing.push(entry);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn('Local storage save error:', e);
  }

  if (dbInstance) {
    try {
      push(ref(dbInstance, 'leaderboard'), entry);
    } catch (e) {
      console.warn('Firebase push fallback:', e);
    }
  }
}

export function pantauLeaderboard(
  updateUI: (entries: LeaderboardEntry[]) => void
): () => void {
  // Immediately provide local + demo scores so UI never hangs
  const initialFiltered = filterUniqueDeviceScores(getLocalScores()).slice(
    0,
    100
  );
  updateUI(initialFiltered);

  if (dbInstance) {
    try {
      const q = query(
        ref(dbInstance, 'leaderboard'),
        orderByChild('skor'),
        limitToLast(200)
      );
      const unsubscribe = onValue(
        q,
        (snapshot) => {
          const data: LeaderboardEntry[] = [...getLocalScores()];
          snapshot.forEach((child) => {
            const val = child.val();
            if (val) data.push(val);
          });
          const filtered = filterUniqueDeviceScores(data);
          updateUI(filtered.slice(0, 100));
        },
        () => {
          const fallback = filterUniqueDeviceScores(getLocalScores());
          updateUI(fallback.slice(0, 100));
        }
      );
      return unsubscribe;
    } catch {
      return () => {};
    }
  }

  return () => {};
}
