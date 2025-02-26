// src/app.js
import fastify from 'fastify'

import env from './config/env.js'
import openAiConfig from './config/openAi.js'
import { formBodyPlugin, websocketPlugin } from './plugins/index.js' 
import incomingCallRoutes from './routes/incomingCall.js'
import mediaStreamRoutes from './routes/mediaStreamRoutes.js'
import statusRoutes from './routes/statusRoutes.js'

// Instancia de Fastify
const app = fastify()

// Registramos nuestro plugin de websockets
app.register(websocketPlugin)
app.register(formBodyPlugin)

// Registra las rutas
app.register(incomingCallRoutes)
app.register(mediaStreamRoutes)
app.register(statusRoutes)


// Ejemplo: mostramos los datos de configuración en consola
console.log('Running on port:', env.PORT)
console.log('OpenAI Key starts with:', openAiConfig.apiKey.slice(0, 5), '...')

// ... el resto de la configuración y registro de rutas/plugins

app.listen({ port: parseInt(env.PORT, 10) }, (err) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Server running on port ${env.PORT}`)
})
