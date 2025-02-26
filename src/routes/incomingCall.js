// routes/incomingCall.js

import { incomingCallHandler } from '../controllers/callController.js'

async function incomingCallRoutes(fastify, options) {
  /**
   * Maneja la ruta POST/GET /incoming-call
   * Twilio puede enviar aquí la notificación de llamada entrante.
   */
  fastify.all('/incoming-call', incomingCallHandler)
}

export default incomingCallRoutes
