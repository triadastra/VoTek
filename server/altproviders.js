// OpenAI and Anthropic vision providers for the guide. Same contract as the Gemini path:
// given a system prompt, an instruction, and an optional JPEG frame, return { ok, text, status }.
// (These providers do single-shot vision only — live audio streaming stays Gemini-only.)

export const PROVIDER_MODELS = {
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  anthropic: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5'],
}
export const PROVIDER_LABELS = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
}
// Only Gemini can do the live audio/video stream; the others use frames + captions + TTS.
export const PROVIDER_LIVE = { gemini: true, openai: false, anthropic: false }

export async function openaiVision({ apiKey, model, system, instruction, jpegBase64 }) {
  const content = [{ type: 'text', text: instruction }]
  if (jpegBase64) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } })
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        max_tokens: 500,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const data = await res.json()
    return { ok: true, text: data?.choices?.[0]?.message?.content || '', status: 200, model: model }
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  }
}

export async function anthropicVision({ apiKey, model, system, instruction, jpegBase64 }) {
  const content = []
  // Anthropic wants the image block before the text block.
  if (jpegBase64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } })
  content.push({ type: 'text', text: instruction })
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5',
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const data = await res.json()
    const text = (data?.content || []).map((b) => b.text).filter(Boolean).join('')
    return { ok: true, text, status: 200, model }
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  }
}

/** Which providers have a key configured, with their model lists — for the client selector. */
export function availableProviders(keys) {
  return ['gemini', 'openai', 'anthropic']
    .filter((id) => keys?.[id])
    .map((id) => ({ id, label: PROVIDER_LABELS[id], models: PROVIDER_MODELS[id], live: PROVIDER_LIVE[id] }))
}
