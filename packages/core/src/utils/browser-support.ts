/**
 * Checks whether all required browser APIs are available for the voice chat widget.
 * For 'local': requires SpeechRecognition, speechSynthesis, and the Prompt API (LanguageModel).
 * For 'gemini': requires getUserMedia and AudioContext.
 */
export async function isVoiceChatSupported(
  engine: 'local' | 'gemini' = 'local'
): Promise<boolean> {
  if (engine === 'gemini') {
    return !!(navigator.mediaDevices?.getUserMedia)
        && !!(window.AudioContext || (window as any).webkitAudioContext);
  }

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
