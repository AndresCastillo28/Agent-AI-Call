// src/config/env.js
import dotenv from 'dotenv'
import { z } from 'zod'

// Carga las variables de entorno desde el archivo .env
dotenv.config()

// Definimos un esquema de validación con zod
// (puedes usar joi o cualquier otra herramienta similar).
const envSchema = z.object({
  // TWILIO
//   TWILIO_ACCOUNT_SID: z.string().nonempty('TWILIO_ACCOUNT_SID is required'),
//   TWILIO_AUTH_TOKEN: z.string().nonempty('TWILIO_AUTH_TOKEN is required'),
  
  // OPENAI
  OPENAI_API_KEY: z.string().nonempty('OPENAI_API_KEY is required'),

  // PUERTO
  PORT: z.string().default('3000'), // Permitimos un valor por defecto
})

// Validamos las variables de entorno cargadas; si falta alguna, se lanzará un error.
const env = envSchema.parse(process.env)

export default env
