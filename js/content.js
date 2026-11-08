// Loads content.json, or the unpublished draft from the editor when ?preview=1.
export const PREVIEW_KEY = 'anniversary-preview-content';

export function isPreview() {
  return new URLSearchParams(location.search).has('preview');
}

export async function loadContent() {
  if (isPreview()) {
    try {
      const draft = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null');
      if (draft) return draft;
    } catch { /* fall through */ }
  }
  const res = await fetch(`content.json?v=${Date.now()}`, { cache: 'no-store' });
  return res.json();
}
