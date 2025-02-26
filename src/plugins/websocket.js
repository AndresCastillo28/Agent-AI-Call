// plugins/websocket.js

import fastifyPlugin from 'fastify-plugin'
import fastifyWs from '@fastify/websocket'

/**
 * Plugin que registra y configura @fastify/websocket en la instancia de Fastify.
 */
async function websocketPlugin(fastify, opts) {
  // Aquí podrías personalizar las opciones del plugin
  fastify.register(fastifyWs, {
    // any custom options here
  })

  // También puedes añadir lógica adicional si lo necesitas
  // Por ejemplo, hooks, middlewares, etc. que dependan del WebSocket
}

// Exportamos el plugin envuelto con fastifyPlugin para que
// Fastify lo reconozca adecuadamente y respete la encapsulación.
export default fastifyPlugin(websocketPlugin)
