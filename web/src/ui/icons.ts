// One line-icon set (24×24, stroke = currentColor) shared by React components and the
// map markers built as raw DOM in the provider. No emoji anywhere.

export type IconName =
  | 'search'
  | 'x'
  | 'coffee'
  | 'food'
  | 'hotel'
  | 'museum'
  | 'park'
  | 'bar'
  | 'camera'
  | 'layers'
  | 'satellite'
  | 'plus'
  | 'minus'
  | 'locate'
  | 'navigation'
  | 'lock'
  | 'route'
  | 'walk'
  | 'clock'
  | 'pin'
  | 'star'
  | 'chevron'
  | 'trail'
  | 'trash'
  | 'mic'
  | 'volume'
  | 'mute'
  | 'broadcast'
  | 'settings'
  | 'check'
  | 'alert'
  | 'refresh'

const P: Record<IconName, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  coffee:
    '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
  food:
    '<path d="M4 2v7a2 2 0 0 0 4 0V2"/><path d="M6 9v13"/><path d="M18 2c-1.7 0-3 2.2-3 5.5 0 2.5 1 4 3 4.5"/><path d="M18 2v20"/>',
  hotel:
    '<path d="M2 20V5"/><path d="M2 11h16a4 4 0 0 1 4 4v5"/><path d="M2 16h20"/><path d="M6 11V9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/>',
  museum:
    '<path d="m12 3 9 5H3l9-5Z"/><path d="M6 11v7M10 11v7M14 11v7M18 11v7"/><path d="M3 21h18"/>',
  park: '<path d="M12 3 6.5 11H10l-4 7h12l-4-7h3.5L12 3Z"/><path d="M12 22v-4"/>',
  bar: '<path d="M4 4h16l-8 8-8-8Z"/><path d="M12 12v8"/><path d="M8 20h8"/>',
  camera:
    '<path d="M14.5 4h-5L8 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-4L14.5 4Z"/><circle cx="12" cy="13" r="3.2"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  satellite:
    '<path d="M4 20a9 9 0 0 1 9-9"/><circle cx="12" cy="12" r="2"/><path d="m15 9 4-4"/><path d="M15 5a4 4 0 0 1 4 4"/><path d="M4 20h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  locate:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22"/>',
  navigation: '<path d="M3 11 22 2l-9 19-2.2-7.8L3 11Z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  route:
    '<circle cx="6" cy="19" r="2.6"/><circle cx="18" cy="5" r="2.6"/><path d="M8.6 19H15a3 3 0 0 0 3-3V7.6"/>',
  walk:
    '<circle cx="13" cy="4" r="1.8"/><path d="m10 22 2.4-6.5L15 18l1 4"/><path d="m8 11 3-3 2.5 1.2 2-1.7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  star: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3Z"/>',
  chevron: '<path d="m15 18-6-6 6-6"/>',
  trail: '<circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="5" r="2.2"/><path d="M6.5 17.5C6.5 10 17 14 17.5 6.5"/>',
  trash:
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/><path d="M10 11v6M14 11v6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  volume:
    '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M19.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6M16 9l6 6"/>',
  broadcast:
    '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
}

export interface IconOpts {
  size?: number
  stroke?: number
  className?: string
}

/** Raw <svg> string — for DOM markers built in the map provider. */
export function iconSvg(name: IconName, opts: IconOpts = {}): string {
  const { size = 24, stroke = 2, className = '' } = opts
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"` +
    (className ? ` class="${className}"` : '') +
    `>${P[name]}</svg>`
  )
}

export function iconPaths(name: IconName): string {
  return P[name]
}
