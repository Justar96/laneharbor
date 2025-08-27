export type Platform =
  | 'windows-x86_64'
  | 'windows-aarch64'
  | 'macos-x86_64'
  | 'macos-aarch64'
  | 'linux-x86_64'
  | 'linux-aarch64'

export interface ReleaseAsset {
  platform: Platform | string
  filename: string
  sha256?: string
  size?: number
  url?: string
  signature?: string
}

export interface ReleaseEntry {
  version: string
  channel: string
  pub_date?: string
  notes?: string
  assets: ReleaseAsset[]
}

export interface AppIndex {
  app: string
  channels: string[]
  releases: ReleaseEntry[]
}
