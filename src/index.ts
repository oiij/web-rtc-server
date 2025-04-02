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
import { nanoid } from 'nanoid'

interface MessageEvent {
  type: 'register' | 'offer' | 'answer' | 'answer-ok' | 'ice-candidate' | 'error'
  payload: {
    key?: string
    desc?: RTCSessionDescription
    candidate?: RTCIceCandidate
    message?: string
  }
}
const socketMap = new Map<string, WebSocket>()
function createDebug(debug: boolean) {
  return function (msg: string, type?: 'info' | 'error') {
    if (!debug)
      return
    switch (type) {
      case 'info':
        // eslint-disable-next-line no-console
        return console.info(msg)
      case 'error':

        return console.error(msg)
      default:
        // eslint-disable-next-line no-console
        return console.log(msg)
    }
  }
}
function getSocket(key?: string) {
  return key ? socketMap.get(key) : undefined
}
function createId(str: string = nanoid(6)) {
  const timeStamp = Date.now().toString()
  return `${nanoid(6)}-${timeStamp.slice(timeStamp.length - 6, timeStamp.length)}-${nanoid(6)}-${str.slice(0, 6)}`
}
async function handleSession(request: Request, socket: WebSocket) {
  socket.accept()

  const debugLog = createDebug(true)
  function sendMessage(data: MessageEvent) {
    socket.send(JSON.stringify(data))
  }
  const secKey = request.headers.get('sec-websocket-key')
  if (!secKey) {
    debugLog('sec-websocket-key not found')
    sendMessage({
      type: 'error',
      payload: { message: 'sec-websocket-key not found' },
    })
    return
  }
  const key = createId(secKey)
  if (!socketMap.has(key)) {
    socketMap.set(key, socket)
  }
  sendMessage({
    type: 'register',
    payload: {
      key,
    },
  })
  socket.addEventListener('message', (dataRaw) => {
    try {
      const { type, payload } = JSON.parse(dataRaw.toString()) as MessageEvent
      const { key: targetKey, desc, candidate } = payload
      switch (type) {
        case 'offer':
          {
            const target = getSocket(targetKey)
            if (!target) {
              return
            }
            sendMessage({
              type: 'offer',
              payload: {
                key,
                desc,
              },
            })
          }

          break
        case 'answer':
          {
            const target = getSocket(targetKey)
            if (!target) {
              debugLog(`answer targetIns not found ${targetKey}`)
              return
            }
            sendMessage({
              type: 'answer',
              payload: {
                key: targetKey,
                desc,
              },
            })
          }

          break
        case 'answer-ok':
          {
            const target = getSocket(targetKey)
            if (!target) {
              debugLog(`answer-ok targetIns not found ${targetKey}`)
              return
            }
            sendMessage({
              type: 'answer-ok',
              payload: {
                key,
              },
            })
          }
          break
        case 'ice-candidate':
          socketMap.entries().forEach(([_key, _socket]) => {
            if (_key === key)
              return
            sendMessage({
              type: 'ice-candidate',
              payload: {
                key,
                candidate,
              },
            })
          })
          break
        default:
          break
      }
    }
    catch (error: any) {
      debugLog(error.toString(), 'error')
    }
  })
  socket.addEventListener('close', () => {
    debugLog('socket close')
  })
}
async function websocketHandler(request: Request) {
  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 400 })
  }

  const [client, server] = Object.values(new WebSocketPair())

  await handleSession(request, server)

  return new Response(null, {
    status: 101,
    webSocket: client,
  })
}
export default {
  async fetch(request, _env, _ctx): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname === '/ws') {
        return websocketHandler(request)
      }
      return new Response('Not found', { status: 404 })
    }
    catch (err: any) {
      return new Response(err.toString())
    }
  },
} satisfies ExportedHandler<Env>
