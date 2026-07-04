import type { ProviderInfo } from '../data/api'
import { Icon } from '../ui/Icon'

export interface Selection {
  provider: string
  model?: string
}

export function ModelSelector({
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
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet ms" role="dialog" aria-label="Choose AI model">
        <div className="sheet__grip" />
        <div className="sheet__title">AI model</div>
        {providers.length === 0 ? (
          <p className="ms__empty">
            No AI provider configured. Add <code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>, or{' '}
            <code>ANTHROPIC_API_KEY</code> to the broker to enable the guide.
          </p>
        ) : (
          providers.map((p) => (
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
          ))
        )}
      </div>
    </>
  )
}
