export const CHAPTER_SECTION_KEYS = Object.freeze([
  'entenda', 'veja', 'pratique', 'evite', 'testeSe', 'duvida', 'fontes',
]);

export function normalizeChapterSections(value) {
  const present = new Set(Array.isArray(value) ? value.filter(key => CHAPTER_SECTION_KEYS.includes(key)) : []);
  return CHAPTER_SECTION_KEYS.filter(key => present.has(key));
}

export function recordChapterSection(value, key, { quizCompleted = false } = {}) {
  const current = normalizeChapterSections(value);
  if (!CHAPTER_SECTION_KEYS.includes(key) || (key === 'testeSe' && !quizCompleted)) return current;
  return normalizeChapterSections([...current, key]);
}

export function chapterProgressPercent(value, chapterComplete = false) {
  if (chapterComplete) return 100;
  return Math.round(normalizeChapterSections(value).length / CHAPTER_SECTION_KEYS.length * 100);
}
