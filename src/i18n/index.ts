import { idPack } from './id';
import { enPack } from './en';
import { jpPack } from './jp';

export interface LanguagePack {
  code: string;
  name: string;
  translations: Record<string, string>;
}

const languageRegistry: Record<string, LanguagePack> = {
  id: idPack,
  en: enPack,
  jp: jpPack
};

/**
 * Register a new language pack dynamically (e.g. jp, es, fr)
 */
export function registerLanguagePack(pack: LanguagePack) {
  languageRegistry[pack.code] = pack;
}

/**
 * Get list of all registered language packs
 */
export function getRegisteredLanguages(): Array<{ code: string; name: string }> {
  return Object.values(languageRegistry).map(p => ({ code: p.code, name: p.name }));
}

/**
 * Creates a translation helper function t(key, fallback?)
 */
export function useTranslation(langCode: string = 'id') {
  const code = (langCode || 'id').toLowerCase();
  const pack = languageRegistry[code] || languageRegistry['id'];
  const fallbackPack = languageRegistry['en'];

  return function t(key: string, fallback?: string): string {
    if (pack.translations[key]) {
      return pack.translations[key];
    }
    if (fallbackPack.translations[key]) {
      return fallbackPack.translations[key];
    }
    return fallback || key;
  };
}
