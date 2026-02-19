import { create } from 'zustand';
import type { GeneratedProfile } from '@/types';
import { storage } from '@/lib/storage';

const PROFILES_DIR = 'profiles';

interface ProfileState {
  profiles: GeneratedProfile[];
  activeProfile: GeneratedProfile | null;
  loaded: boolean;
  isGenerating: boolean;
  streamContent: string;
  currentPass: number;
  totalPasses: number;
  currentPassKeys: string[];
  loadProfiles: () => Promise<void>;
  addProfile: (profile: GeneratedProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setActiveProfile: (id: string | null) => void;
  updateProfile: (profile: GeneratedProfile) => Promise<void>;
  setGenerating: (generating: boolean) => void;
  setStreamContent: (content: string) => void;
  appendStreamContent: (token: string) => void;
  setPassInfo: (current: number, total: number, keys: string[]) => void;
  resetGenerationState: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  loaded: false,
  isGenerating: false,
  streamContent: '',
  currentPass: 0,
  totalPasses: 1,
  currentPassKeys: [],

  loadProfiles: async () => {
    await storage.ensureDir(PROFILES_DIR);
    const files = await storage.listDir(PROFILES_DIR);
    const profiles: GeneratedProfile[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const profile = await storage.readJson<GeneratedProfile>(`${PROFILES_DIR}/${file}`);
          profiles.push(profile);
        } catch {
          // skip corrupt files
        }
      }
    }

    profiles.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    set({ profiles, loaded: true });
  },

  addProfile: async (profile) => {
    await storage.writeJson(`${PROFILES_DIR}/${profile.id}.json`, profile);
    set((state) => ({
      profiles: [profile, ...state.profiles],
      activeProfile: profile,
    }));
  },

  deleteProfile: async (id) => {
    await storage.deleteFile(`${PROFILES_DIR}/${id}.json`);
    set((state) => ({
      profiles: state.profiles.filter((p) => p.id !== id),
      activeProfile: state.activeProfile?.id === id ? null : state.activeProfile,
    }));
  },

  setActiveProfile: (id) => {
    if (id === null) {
      set({ activeProfile: null });
    } else {
      const profile = get().profiles.find((p) => p.id === id) ?? null;
      set({ activeProfile: profile });
    }
  },

  updateProfile: async (profile) => {
    await storage.writeJson(`${PROFILES_DIR}/${profile.id}.json`, profile);
    set((state) => ({
      profiles: state.profiles.map((p) => (p.id === profile.id ? profile : p)),
      activeProfile: state.activeProfile?.id === profile.id ? profile : state.activeProfile,
    }));
  },

  setGenerating: (generating) => set({ isGenerating: generating }),

  setStreamContent: (content) => set({ streamContent: content }),

  appendStreamContent: (token) =>
    set((state) => ({ streamContent: state.streamContent + token })),

  setPassInfo: (current, total, keys) =>
    set({ currentPass: current, totalPasses: total, currentPassKeys: keys }),

  resetGenerationState: () =>
    set({ isGenerating: false, streamContent: '', currentPass: 0, totalPasses: 1, currentPassKeys: [] }),
}));
