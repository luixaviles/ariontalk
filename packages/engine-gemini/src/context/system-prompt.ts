const LANG_DISPLAY_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', ja: 'Japanese', fr: 'French',
  de: 'German', pt: 'Portuguese', it: 'Italian', zh: 'Chinese',
  ko: 'Korean', hi: 'Hindi', ar: 'Arabic', ru: 'Russian',
};

function langDisplayName(lang: string): string {
  return LANG_DISPLAY_NAMES[lang] ?? lang;
}

export function buildSystemPrompt(
  pageText: string,
  lang: string,
  pageTitle: string,
  pageUrl: string,
): string {
  return `You are a voice assistant embedded on a webpage. Your role is to help the user understand the content of the page they are currently viewing.

Answer questions about the page content below. If the user asks about something not on the page, let them know it's not in the current page content.

Respond in ${langDisplayName(lang)}.
Keep answers concise — 1 to 3 short sentences, suitable for spoken delivery.
Do not use markdown, bullet points, numbered lists, or special formatting.

PAGE TITLE: ${pageTitle}
PAGE URL: ${pageUrl}
PAGE CONTENT:
${pageText}`;
}
