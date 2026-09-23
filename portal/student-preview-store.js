import { normalizeChapterSections } from './chapter-progress.js';

const STORAGE_KEY = 'only-djs.student-preview.v1';

const emptyState = () => ({
  name: '', email: '', phone: '', instagram: '', social: '',
  current: 0, started: [], completed: [], chapterSections: {}, score: 0, answered: [],
});

function cleanIndexList(value) {
  return Array.isArray(value) ? [...new Set(value.filter(index => Number.isSafeInteger(index) && index >= 0))] : [];
}

function cleanChapterSections(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([index]) => /^\d{1,3}$/.test(index))
    .map(([index, sections]) => [index, normalizeChapterSections(sections)])
    .filter(([, sections]) => sections.length));
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return emptyState();
  return {
    name: typeof value.name === 'string' ? value.name.slice(0, 120) : '',
    email: typeof value.email === 'string' ? value.email.slice(0, 254) : '',
    phone: typeof value.phone === 'string' ? value.phone.slice(0, 40) : '',
    instagram: typeof value.instagram === 'string' ? value.instagram.slice(0, 120) : '',
    social: typeof value.social === 'string' ? value.social.slice(0, 300) : '',
    current: Number.isSafeInteger(value.current) && value.current >= 0 ? value.current : 0,
    started: cleanIndexList(value.started),
    completed: cleanIndexList(value.completed),
    chapterSections: cleanChapterSections(value.chapterSections),
    score: Number.isSafeInteger(value.score) && value.score >= 0 ? value.score : 0,
    answered: Array.isArray(value.answered) ? [...new Set(value.answered.filter(key => typeof key === 'string' && /^\d+-\d+$/.test(key)).slice(0, 500))] : [],
  };
}

export function createStudentPreviewStore(storage) {
  return {
    load() {
      try {
        const serialized = storage?.getItem(STORAGE_KEY);
        return serialized ? normalizeState(JSON.parse(serialized)) : emptyState();
      } catch {
        return emptyState();
      }
    },
    save(state) {
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...normalizeState({ version: 1, ...state }) }));
        return Boolean(storage);
      } catch {
        return false;
      }
    },
    clear() {
      try { storage?.removeItem(STORAGE_KEY); return Boolean(storage); }
      catch { return false; }
    },
  };
}
