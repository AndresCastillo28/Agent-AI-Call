// plugins/formbody.js

import fastifyPlugin from 'fastify-plugin'
import fastifyFormBody from '@fastify/formbody'

/**
 * Plugin que registra y configura @fastify/formbody en la instancia de Fastify.
 */
async function formBodyPlugin(fastify, opts) {
  // Registra el plugin @fastify/formbody con opciones personalizadas, si lo deseas.
  fastify.register(fastifyFormBody, {
    // Por ejemplo, si quisieras un límite en el tamaño del body:
    // bodyLimit: 1048576 // 1 MB
  })
}

// Exportamos el plugin envuelto con fastifyPlugin
// para que Fastify lo maneje adecuadamente.
export default fastifyPlugin(formBodyPlugin)
