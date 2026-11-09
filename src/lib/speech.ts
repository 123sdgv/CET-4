// 浏览器自带朗读（Web Speech API），不用任何收费接口。
const VOICE_LANG: Record<string, string> = {
  en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', ru: 'ru-RU', pt: 'pt-BR',
}

let voices: SpeechSynthesisVoice[] = []
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
if (synth) {
  voices = synth.getVoices()
  synth.addEventListener?.('voiceschanged', () => { voices = synth.getVoices() })
}

export function canSpeak(): boolean {
  return !!synth
}

export function speechText(text: string): string {
  return text
    .replace(/\bsth\b/g, 'something')
    .replace(/\bsb's\b/g, "somebody's")
    .replace(/\bsb\b/g, 'somebody')
    .replace(/\.{3}|…/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickVoice(tag: string): SpeechSynthesisVoice | undefined {
  const exact = voices.filter((v) => v.lang.replace('_', '-') === tag)
  return exact.find((v) => v.localService) ?? exact[0] ?? voices.find((v) => v.lang.startsWith(tag.slice(0, 2)))
}

export function speak(text: string, lang: string, rate: number): void {
  if (!synth) return
  const tag = VOICE_LANG[lang] ?? lang
  const u = new SpeechSynthesisUtterance(speechText(text))
  u.lang = tag
  u.rate = rate
  const v = pickVoice(tag)
  if (v) u.voice = v
  synth.cancel()
  synth.speak(u)
}
