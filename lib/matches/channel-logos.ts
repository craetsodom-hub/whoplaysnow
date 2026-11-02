import registry from '../../data/channel-logos.json'
export function exactChannelLogo(channel: string, country: string): string | null {
  return channelArtwork(channel, country)?.url ?? null
}
export function channelArtwork(channel: string, country: string) {
  const name = channel.trim().toLowerCase()
  return registry.find(row => row.countries.includes(country) && row.names.some(alias => alias.toLowerCase() === name))
}
