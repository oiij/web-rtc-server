/* eslint-disable no-console */
import { DurableObject } from 'cloudflare:workers'
/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { closeHandler, messageHandler, registerHandler } from './web-rtc-server'

export interface Env {
  WEBSOCKET_SERVER: DurableObjectNamespace<WebSocketServer>
}

export class WebSocketServer extends DurableObject {
  private sockets: Map<string, WebSocket> = new Map()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sockets = new Map()
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 })
    }
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)
    server.accept()
    const socketMap = this.sockets

    const secKey = request.headers.get('sec-websocket-key')

    if (secKey) {
      const { selfKey } = registerHandler(secKey, server, socketMap)
      server.addEventListener('message', (ev) => {
        messageHandler(ev, selfKey, server, socketMap)
      })
      server.addEventListener('close', () => {
        console.log('socket close')
        closeHandler(selfKey, socketMap)
      })
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }
}

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname === '/ws') {
        const id = env.WEBSOCKET_SERVER.idFromName('foo')
        const stub = env.WEBSOCKET_SERVER.get(id)
        return stub.fetch(request)
      }
      return new Response('Not found', { status: 404 })
    }
    catch (err: any) {
      return new Response(err.toString())
    }
  },
} satisfies ExportedHandler<Env>
