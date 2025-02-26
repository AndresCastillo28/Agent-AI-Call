// src/config/openAi.js
import env from './env.js'


// Si solo necesitas la clave para un WebSocket o request personalizado, la exportas:
const openAiConfig = {
  apiKey: env.OPENAI_API_KEY,
  model: 'gpt-4o-realtime-preview-2024-10-01',
  apiUrl: 'wss://api.openai.com/v1/realtime',
  // Añade otros parámetros de configuración si los requieres,
  // por ejemplo, un endpoint personalizado, tiempo de espera, etc.
}

export default openAiConfig
