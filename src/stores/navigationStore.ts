import { create } from 'zustand';
import type { AppView } from '@/types';

interface NavigationState {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: 'generate',
  setActiveView: (view) => set({ activeView: view }),
}));
