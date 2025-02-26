// controllers/callController.js

import { getTwimlResponse } from '../services/twilioService.js'

export async function incomingCallHandler(request, reply) {
  try {
    const host = request.headers.host
    const twimlResponse = getTwimlResponse(host)

    reply.type('text/xml').send(twimlResponse)
  } catch (error) {
    console.error('Error handling incoming call:', error)
    reply.status(500).send('Internal Server Error')
  }
}
