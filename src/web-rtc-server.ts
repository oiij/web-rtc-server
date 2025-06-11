import { nanoid } from 'nanoid'

interface MessagePayloads {
  'register': { key: string }
  'offer': { key: string, desc: RTCSessionDescription }
  'answer': { key: string, desc: RTCSessionDescription }
  'answer-ok': { key: string }
  'ice-candidate': { key: string, candidate: RTCIceCandidate }
  'error': { message: string }
}
type MessageEventHandler = MutableRecord<MessagePayloads>
type MutableRecord<U> = {
  [SubType in keyof U]: {
    type: SubType
    payload: U[SubType]
  }
}[keyof U]

export async function messageHandler(ev: MessageEvent, selfKey: string, socket: WebSocket, sockets: Map<string, WebSocket>) {
  function getSocket(key?: string) {
    return key ? sockets.get(key) : undefined
  }
  function sendMessage(socket: WebSocket, data: MessageEventHandler) {
    socket.send(JSON.stringify(data))
  }
  if (typeof ev.data === 'string') {
    try {
      const data = JSON.parse(ev.data) as MessageEventHandler | null
      switch (data?.type) {
        case 'offer':
          {
            const { key: targetKey, desc } = data.payload
            const target = getSocket(targetKey)
            if (target) {
              // 给目标用户发送 携带请求者信息
              sendMessage(target, {
                type: 'offer',
                payload: {
                  key: selfKey, // 1#
                  desc,
                },
              })
            }
          }
          break
        case 'answer':
          {
            const { key: targetKey, desc } = data.payload
            const target = getSocket(targetKey)
            if (target) {
              // 给请求者发送 携带目标用户信息
              sendMessage(target, {
                type: 'answer',
                payload: {
                  key: selfKey, // 1#
                  desc,
                },
              })
            }
          }
          break
        case 'answer-ok':
          {
            const { key: targetKey } = data.payload
            const target = getSocket(targetKey)
            if (target) {
              sendMessage(target, {
                type: 'answer-ok',
                payload: {
                  key: selfKey,
                },
              })
            }
          }
          break
        case 'ice-candidate':
          {
            const { candidate } = data.payload
            sockets.entries().forEach(([key, socket]) => {
              if (key !== selfKey) {
                sendMessage(socket, {
                  type: 'ice-candidate',
                  payload: {
                    key,
                    candidate,
                  },
                })
              }
            })
          }
          break
        default:
          break
      }
    }
    catch (err) {
      console.error(err)
    }
  }
}
export function registerHandler(key: string, socket: WebSocket, sockets: Map<string, WebSocket>) {
  function createId(str: string = nanoid(6)) {
    const timeStamp = Date.now().toString()
    return `${nanoid(6)}-${timeStamp.slice(timeStamp.length - 6, timeStamp.length)}-${nanoid(6)}-${str.slice(0, 6)}`
  }
  const selfKey = createId(key)
  sockets.set(selfKey, socket)
  socket.send(JSON.stringify({
    type: 'register',
    payload: {
      key: selfKey,
    },
  }))
  return {
    selfKey,
  }
}
export function closeHandler(selfKey: string, sockets: Map<string, WebSocket>) {
  sockets.delete(selfKey)
}
