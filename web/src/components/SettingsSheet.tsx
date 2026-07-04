import { useCallback, useEffect, useState } from 'react'
import { testProvider, type ProbeResult, type ProviderInfo } from '../data/api'
import { Icon } from '../ui/Icon'

export interface Selection {
  provider: string
  model?: string
}

// Turn a raw probe result into a one-line, human explanation of what to do.
function explain(r: ProbeResult): string {
  if (r.ok) return `Connected — answering with ${r.model || 'this model'}.`
  if (r.reason === 'no-key') return 'No API key configured for this provider on the server.'
  switch (r.status) {
    case 404:
      return "This model isn't available for the server's API key. Pick another model or provider."
    case 401:
    case 403:
      return 'The API key was rejected. Check the key set on the broker.'
    case 429:
      return 'Rate-limited by the provider. Wait a moment and test again.'
    case 0:
      return r.error ? `Couldn't reach the provider: ${r.error}` : "Couldn't reach the provider (network)."
    default:
      return `The provider returned an error (${r.status}). Try another model.`
  }
}

export function SettingsSheet({
  providers,
  selection,
  onSelect,
  onClose,
}: {
  providers: ProviderInfo[]
  selection: Selection | null
  onSelect: (s: Selection) => void
  onClose: () => void
}) {
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [testing, setTesting] = useState(false)

  const runTest = useCallback(async () => {
    if (!selection) return
    setTesting(true)
    setProbe(null)
    const r = await testProvider(selection.provider, selection.model)
    setProbe(r)
    setTesting(false)
  }, [selection])

  // Auto-test whenever the chosen provider/model changes, so status is visible immediately.
  useEffect(() => {
    if (selection) runTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.provider, selection?.model])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet ms" role="dialog" aria-label="Settings">
        <div className="sheet__grip" />
        <div className="sheet__head">
          <div className="sheet__title">Settings</div>
          <button className="sheet__close" onClick={onClose} aria-label="Close settings">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="ms__label">AI guide</div>
        {providers.length === 0 ? (
          <p className="ms__empty">
            No AI provider is configured. Add <code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>, or{' '}
            <code>ANTHROPIC_API_KEY</code> to the broker, then reload. Until then the guide runs in demo mode.
          </p>
        ) : (
          <>
            {providers.map((p) => (
              <div key={p.id} className="ms__group">
                <div className="ms__provider">
                  {p.label}
                  {p.live && <span className="ms__live">live audio</span>}
                </div>
                <div className="ms__models">
                  {p.models.map((m) => {
                    const on = selection?.provider === p.id && selection?.model === m
                    return (
                      <button
                        key={m}
                        className={`ms__model ${on ? 'on' : ''}`}
                        onClick={() => onSelect({ provider: p.id, model: m })}
                      >
                        {on && <Icon name="star" size={13} />}
                        {m}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Live connection test — turns a cryptic 404/401 into something actionable. */}
            <div className={`ms__status ${probe ? (probe.ok ? 'ok' : 'bad') : ''}`}>
              <div className="ms__status-ic">
                {testing ? (
                  <Icon name="refresh" size={16} className="spin" />
                ) : probe ? (
                  <Icon name={probe.ok ? 'check' : 'alert'} size={16} />
                ) : (
                  <Icon name="broadcast" size={16} />
                )}
              </div>
              <div className="ms__status-text">
                {testing ? 'Testing connection…' : probe ? explain(probe) : 'Choose a model to test the guide.'}
              </div>
              <button className="ms__retest" onClick={runTest} disabled={testing || !selection}>
                Test
              </button>
            </div>
          </>
        )}

        <p className="ms__foot">
          Only Google Gemini streams live audio and video. OpenAI and Anthropic answer from camera frames with
          on-device captions and speech.
        </p>
      </div>
    </>
  )
}
