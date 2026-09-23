const SIDEBAR_KEY = 'only-djs.student-navigation.sidebar.v1';
const CHAPTERS_KEY = 'only-djs.student-navigation.chapters.v2';

export function createNavigationPreferences(storage) {
  return {
    load() {
      const read = (key, fallback = false) => {
        try { return storage?.getItem(key) === 'true'; }
        catch { return fallback; }
      };
      const storedChapters = storage?.getItem?.(CHAPTERS_KEY);
      return {
        sidebarCollapsed: read(SIDEBAR_KEY),
        chapterListCollapsed: storedChapters === null || storedChapters === undefined ? true : read(CHAPTERS_KEY),
      };
    },
    save({ sidebarCollapsed, chapterListCollapsed } = {}) {
      try {
        if (typeof sidebarCollapsed === 'boolean') storage?.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
        if (typeof chapterListCollapsed === 'boolean') storage?.setItem(CHAPTERS_KEY, String(chapterListCollapsed));
      } catch {}
      return this.load();
    },
  };
}

export function selectResumeChapter({ mode, localState = {}, progress = [], chapters = [] }) {
  if (!chapters.length) return { index: 0, hasHistory: false };
  if (mode === 'preview') {
    const index = Number.isInteger(localState.current) ? Math.max(0, Math.min(localState.current, chapters.length - 1)) : 0;
    return { index, hasHistory: Array.isArray(localState.started) && localState.started.includes(index) };
  }
  const order = new Map(chapters.map((chapter, index) => [chapter.id, index]));
  const available = progress.filter(row => order.has(row.chapter_id) && Number.isFinite(Date.parse(row.updated_at)));
  if (!available.length) return { index: 0, hasHistory: false };
  available.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || order.get(a.chapter_id) - order.get(b.chapter_id));
  return { index: order.get(available[0].chapter_id), hasHistory: true };
}
