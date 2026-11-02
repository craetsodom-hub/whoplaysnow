export type Assessment = 'official-incident' | 'maintenance' | 'no-known-incident' | 'unknown'
export type Severity = 'none' | 'minor' | 'major' | 'critical' | 'maintenance' | 'unknown'
export type Service = {
  slug: string
  name: string
  mark: string
  color: string
  category: 'Streaming' | 'Live video'
  scope: string
  providerSlug?: string
  helpUrl: string
  help: string
  source: {
    kind: 'statuspage' | 'manual'
    url: string
    summaryUrl?: string
    incidentsUrl?: string
    docsUrl?: string
    verifiedAt: string
  }
}
export type IncidentUpdate = { id: string; status: string; body: string; publishedAt: string }
export type Incident = {
  id: string
  title: string
  status: string
  severity: Severity
  startedAt: string
  updatedAt: string
  retrievedAt: string
  resolvedAt: string | null
  timingNote?: string
  historicalOnly?: boolean
  sourceUrl: string
  components: string[]
  regions: string[]
  updates: IncidentUpdate[]
}
export type Snapshot = {
  serviceSlug: string
  checkedAt: string | null
  lastSuccessAt: string | null
  sourceUpdatedAt: string | null
  assessment: Assessment
  severity: Severity
  refresh: 'ok' | 'unavailable' | 'not-configured'
  error: string | null
  retryAt: string | null
  components: { id: string; name: string; status: string }[]
  // Keep independent summary signals separate from incident-derived severity so a
  // newer resolved record can replace an older active record without erasing a
  // component outage or maintenance that the summary still reports.
  summarySignals?: { indicator: Severity; maintenanceInProgress: boolean }
  incidents: Incident[]
  history: { checkedAt: string | null; available: boolean; error: string | null }
}
export type ServiceView = { service: Service; snapshot: Snapshot; stale: boolean; assessment: Assessment; severity: Severity; confidence: 'official-source' | 'insufficient-evidence' }
