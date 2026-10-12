import { create } from 'zustand';
import i18n from '../i18n';

interface SettingsState {
  language: 'en' | 'hi';
  isDarkMode: boolean;
  setLanguage: (lang: 'en' | 'hi') => void;
  toggleDarkMode: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: 'en',
  isDarkMode: true,

  setLanguage: (lang) => {
    i18n.changeLanguage(lang);
    set({ language: lang });
  },

  toggleDarkMode: () =>
    set((state) => ({ isDarkMode: !state.isDarkMode })),
}));
