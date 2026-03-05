/**
 * Checks whether all required browser APIs are available for the voice chat widget.
 * Requires: SpeechRecognition, speechSynthesis, and the Prompt API (LanguageModel).
 */
export async function isVoiceChatSupported(): Promise<boolean> {
  // 1. Check SpeechRecognition
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return false;

  // 2. Check speechSynthesis
  if (!window.speechSynthesis) return false;

  // 3. Check LanguageModel (Prompt API)
  if (!(window as any).LanguageModel) return false;

  // 4. Check model availability
  try {
    const availability = await (window as any).LanguageModel.availability();
    if (availability === 'unavailable') return false;
  } catch {
    return false;
  }

  return true;
}
