import { PrismaClient } from "@prisma/client"
import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import { getCloudflareContext } from '@opennextjs/cloudflare'

declare global {
  var prisma: PrismaClient | undefined
}

const requestClients = new WeakMap<object, PrismaClient>()

function normalizeDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
  try {
    const parsed = new URL(rawUrl)
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '25')
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '10')
    }
    return parsed.toString()
  } catch {
    return rawUrl
  }
}

function client(): PrismaClient {
  if (process.env.WPN_RUNTIME === 'cloudflare') {
    // Socket-backed clients must belong to the current Workers request.
    const { ctx } = getCloudflareContext()
    let value = requestClients.get(ctx)
    if (!value) {
      neonConfig.poolQueryViaFetch = true
      const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 1000 })
      value = new PrismaClient({ adapter, log: ['error'] })
      requestClients.set(ctx, value)
    }
    return value
  }
  if (process.env.PRISMA_CLIENT_ENGINE_TYPE === 'client') {
    neonConfig.poolQueryViaFetch = true
    return globalThis.prisma ??= new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL, idleTimeoutMillis: 1000 }), log: ['error'] })
  }
  const normalizedUrl = normalizeDatabaseUrl(process.env.DATABASE_URL)
  return globalThis.prisma ??= new PrismaClient({
    ...(normalizedUrl ? { datasources: { db: { url: normalizedUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const database = client()
    const value = Reflect.get(database, property)
    return typeof value === 'function' ? value.bind(database) : value
  },
})
