import { create } from 'zustand';

interface DemoState {
  isDemoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  isDemoMode: process.env.EXPO_PUBLIC_DEMO_MODE === 'true',
  enterDemoMode: () => set({ isDemoMode: true }),
  exitDemoMode: () => set({ isDemoMode: false }),
}));
