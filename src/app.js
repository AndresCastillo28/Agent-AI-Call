/**
 * index.js
 *
 * EJEMPLO COMPLETO
 */
import Fastify from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import mongoose from "mongoose";
import fs from "fs";

// Carga variables de entorno (OPENAI_API_KEY, MONGO_URI, etc.)
dotenv.config();

// Crea el directorio de logs si no existe
if (!fs.existsSync("./logs")) {
  fs.mkdirSync("./logs");
}

// Redirige la salida de la consola a un archivo
const logStream = fs.createWriteStream("./logs/app.log", { flags: "a" });

// Redirige stdout (console.log) y stderr (console.error)
console.log = (...args) => {
  logStream.write(`[INFO] ${new Date().toISOString()} - ${args.join(" ")}\n`);
  process.stdout.write(`${args.join(" ")}\n`);
};

console.error = (...args) => {
  logStream.write(`[ERROR] ${new Date().toISOString()} - ${args.join(" ")}\n`);
  process.stderr.write(`${args.join(" ")}\n`);
};

// -----------------------------------------------------------------------------
// 1. CONFIGURACIÓN DE MONGODB (mongoose) + DEFINICIÓN DE MODELO
// -----------------------------------------------------------------------------

const { OPENAI_API_KEY, MONGO_URI } = process.env;

if (!OPENAI_API_KEY) {
  console.error("No OPENAI_API_KEY en .env o entorno");
  process.exit(1);
}

if (!MONGO_URI) {
  console.error("No MONGO_URI en .env o entorno");
  process.exit(1);
}

// Conecta a MongoDB
(async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB");
  } catch (err) {
    console.error("Error conectando a MongoDB:", err);
    process.exit(1);
  }
})();

// Definimos un esquema para la transcripción (quién habla, qué dice y cuándo)
const transcriptSchema = new mongoose.Schema({
  role: String, // 'user' o 'assistant'
  text: String,
  timestamp: Date,
});

// Definimos un esquema genérico para eventos, permitiendo almacenar cualquier estructura
const callEventSchema = new mongoose.Schema({}, { strict: false });

// Definimos el esquema principal de la llamada
const callLogSchema = new mongoose.Schema({
  streamSid: { type: String, required: true },
  transcript: [transcriptSchema],
  events: [callEventSchema],
  callStartTime: Date,
  callEndTime: Date,
  createdAt: { type: Date, default: Date.now },
});

const CallLog = mongoose.model("CallLog", callLogSchema);

// -----------------------------------------------------------------------------
// 2. CONFIGURACIÓN DE FASTIFY (FORMBODY, WEBSOCKET) Y LÓGICA DE TWILIO + OPENAI
// -----------------------------------------------------------------------------

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

const SYSTEM_MESSAGE =
  "Eres un asistente de IA especializado en atención al cliente para seguros de vida y salud corporativa. Tu función es proporcionar respuestas claras y rápidas sobre la cobertura de seguros médicos para empleados, el proceso de reclamación de gastos médicos y la solicitud de documentos como certificados de seguro. Mantén un tono profesional, empático y resolutivo";
const VOICE = "alloy";
const PORT = process.env.PORT || 3000;

// Opcional: filtra eventos de OpenAI que quieras ver en consola
const LOG_EVENT_TYPES = [
  "error",
  "response.content.done",
  "rate_limits.updated",
  "response.done",
  "input_audio_buffer.committed",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.speech_started",
  "session.created",
];

const SHOW_TIMING_MATH = true;

/**
 * Objeto en memoria donde guardamos datos temporales de cada llamada.
 * Formato:
 * callLogs[streamSid] = {
 *   transcript: [],
 *   events: [],
 *   callStartTime: Date,
 *   callEndTime: Date
 * }
 */
let callLogs = {};

// -----------------------------------------------------------------------------
// 3. RUTAS DE FASTIFY
// -----------------------------------------------------------------------------

// Endpoint básico de prueba
fastify.get("/", async (request, reply) => {
  reply.send({ message: "Twilio Media Stream Server is running!" });
});

fastify.get("/call-logs", async (request, reply) => {
  const { streamSid, startDate, endDate, page = 1, limit = 10 } = request.query;

  const query = {};
  if (streamSid) query.streamSid = streamSid;
  if (startDate && endDate) {
    query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  try {
    const callLogs = await CallLog.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await CallLog.countDocuments(query);

    reply.send({
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      data: callLogs,
    });
  } catch (err) {
    console.error("Error obteniendo registros filtrados:", err);
    reply.status(500).send({ error: "Error interno del servidor" });
  }
});

// Endpoint que Twilio llamará cuando entra una llamada a tu número
// => Devuelve la <Response> con <Connect> y <Stream url="wss://..."/>
fastify.all("/incoming-call", async (request, reply) => {
  const host = request.headers.host;
  // Revisa si estás en ngrok o similar para una URL pública

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Por favor, espere mientras conectamos su llamada al asistente de voz de IA.</Say>
  <Pause length="1"/>
  <Say>Ahora puede comenzar a hablar.</Say>
  <Connect>
    <Stream url="wss://${host}/media-stream" />
  </Connect>
</Response>`;

  reply.type("text/xml").send(twimlResponse);
});

// Aquí definimos la ruta WebSocket que Twilio usará para enviar/recibir audio
fastify.register(async (fastify) => {
  fastify.get("/media-stream", { websocket: true }, (connection, req) => {
    console.log("Client connected to /media-stream");

    // Variables de estado para esta llamada
    let streamSid = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;

    // Creamos WebSocket con OpenAI Realtime
    const openAiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    // Envía configuración inicial a OpenAI
    const initializeSession = () => {
      const sessionUpdate = {
        type: "session.update",
        session: {
          turn_detection: { type: "server_vad" },
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: VOICE,
          instructions: SYSTEM_MESSAGE,
          modalities: ["text", "audio"],
          temperature: 0.7,
          max_response_output_tokens: 700,
        },
      };
      console.log("Sending session update:", JSON.stringify(sessionUpdate));
      openAiWs.send(JSON.stringify(sessionUpdate));
    };

    // Función que maneja si el usuario empieza a hablar (para truncar respuesta)
    const handleSpeechStartedEvent = () => {
      if (markQueue.length > 0 && responseStartTimestampTwilio !== null) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        if (SHOW_TIMING_MATH) {
          console.log(
            `Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`
          );
        }

        if (lastAssistantItem) {
          const truncateEvent = {
            type: "conversation.item.truncate",
            item_id: lastAssistantItem,
            content_index: 0,
            audio_end_ms: elapsedTime,
          };
          if (SHOW_TIMING_MATH)
            console.log(
              "Sending truncation event:",
              JSON.stringify(truncateEvent)
            );
          openAiWs.send(JSON.stringify(truncateEvent));
        }

        // Enviamos 'clear' a Twilio para que deje de reproducir audio actual
        connection.send(
          JSON.stringify({
            event: "clear",
            streamSid: streamSid,
          })
        );

        markQueue = [];
        lastAssistantItem = null;
        responseStartTimestampTwilio = null;
      }
    };

    // Envía un "mark" a Twilio para saber cuándo terminó un bloque de audio
    const sendMark = (conn, sid) => {
      if (sid) {
        const markEvent = {
          event: "mark",
          streamSid: sid,
          mark: { name: "responsePart" },
        };
        conn.send(JSON.stringify(markEvent));
        markQueue.push("responsePart");
      }
    };

    // Cuando se abre el WebSocket con OpenAI
    openAiWs.on("open", () => {
      console.log("Connected to the OpenAI Realtime API");
      // Esperamos un poco y enviamos la configuración
      setTimeout(initializeSession, 100);
    });

    // Escuchamos mensajes que llegan desde OpenAI
    openAiWs.on("message", (rawData) => {
      try {
        const response = JSON.parse(rawData);

        // Loguear ciertos eventos de OpenAI si queremos
        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log(
            `OpenAI event: ${response.type} - ${JSON.stringify(
              response,
              null,
              2
            )}`
          );
        }

        // Guardar el evento en callLogs (openai->server)
        if (streamSid && callLogs[streamSid]) {
          callLogs[streamSid].events.push({
            direction: "openai->server",
            timestamp: new Date(),
            data: response,
          });
        }

        // 1) Audio del asistente
        if (response.type === "response.audio.delta" && response.delta) {
          // Enviamos a Twilio para que se reproduzca al llamante
          const audioDelta = {
            event: "media",
            streamSid: streamSid,
            media: { payload: response.delta },
          };
          connection.send(JSON.stringify(audioDelta));

          // Si es la primera delta de esta respuesta, marcamos el inicio
          if (!responseStartTimestampTwilio) {
            responseStartTimestampTwilio = latestMediaTimestamp;
            if (SHOW_TIMING_MATH) {
              console.log(
                `responseStartTimestampTwilio = ${responseStartTimestampTwilio}ms`
              );
            }
          }

          // Guardamos item_id (por si necesitamos truncar)
          if (response.item_id) {
            lastAssistantItem = response.item_id;
          }

          // Enviamos 'mark' para el final de este delta
          sendMark(connection, streamSid);
        }

        // 2) Si el usuario empieza a hablar (detectado por OpenAI)
        if (response.type === "input_audio_buffer.speech_started") {
          handleSpeechStartedEvent();
        }

        // 3) Si OpenAI envía texto transcrito (opcional), podríamos guardarlo.
        // Ejemplo hipotético:
        if (response.type === "response.text.delta") {
          if (streamSid && callLogs[streamSid]) {
            callLogs[streamSid].transcript.push({
              role: "assistant",
              text: response.delta,
              timestamp: new Date(),
            });

            // Imprime la transcripción en la consola.
            console.log(
              `[Transcripción] (${transcript.timestamp}): ${transcript.text}`
            );
          }
        }
      } catch (error) {
        console.error(
          "Error processing OpenAI message:",
          error,
          "Raw message:",
          rawData
        );
      }
    });

    // Maneja mensajes que vienen desde Twilio
    connection.on("message", (rawMessage) => {
      try {
        const data = JSON.parse(rawMessage);

        // Guardamos el evento en callLogs (twilio->server)
        if (streamSid && callLogs[streamSid]) {
          callLogs[streamSid].events.push({
            direction: "twilio->server",
            timestamp: new Date(),
            data,
          });
        }

        switch (data.event) {
          case "media": {
            // Audio del usuario
            latestMediaTimestamp = data.media.timestamp;
            // if (SHOW_TIMING_MATH) {
            //   console.log(
            //     `Received media timestamp: ${latestMediaTimestamp}ms`
            //   );
            // }
            // Se lo enviamos a OpenAI
            if (openAiWs.readyState === WebSocket.OPEN) {
              const audioAppend = {
                type: "input_audio_buffer.append",
                audio: data.media.payload,
              };
              openAiWs.send(JSON.stringify(audioAppend));
            }
            break;
          }
          case "start": {
            // Inicia un nuevo stream
            streamSid = data.start.streamSid;
            console.log("Incoming stream started, SID:", streamSid);

            callLogs[streamSid] = {
              transcript: [],
              events: [],
              callStartTime: new Date(),
              callEndTime: null,
            };

            // Guardamos este primer evento
            callLogs[streamSid].events.push({
              direction: "twilio->server",
              timestamp: new Date(),
              data,
            });

            responseStartTimestampTwilio = null;
            latestMediaTimestamp = 0;
            break;
          }
          case "mark": {
            // Twilio nos confirma la recepción de la marca
            if (markQueue.length > 0) {
              markQueue.shift();
            }
            break;
          }
          default:
            console.log("Received non-media event:", data.event);
            break;
        }
      } catch (error) {
        console.error("Error parsing message:", error, "Message:", rawMessage);
      }
    });

    // Cuando Twilio cierra la conexión
    connection.on("close", async () => {
      console.log(
        `Llamada finalizada. Transcripción de streamSid: ${streamSid}`
      );

      if (streamSid && callLogs[streamSid]) {
        // Establecer la hora de finalización de la llamada
        callLogs[streamSid].callEndTime = new Date();

        const transcript = callLogs[streamSid].transcript;
        transcript.forEach((entry) => {
          console.log(`[${entry.role}] ${entry.timestamp}: ${entry.text}`);
        });

        // Guardar en MongoDB
        try {
          const doc = new CallLog({
            streamSid,
            transcript,
            events: callLogs[streamSid].events,
            callStartTime: callLogs[streamSid].callStartTime,
            callEndTime: callLogs[streamSid].callEndTime, // Ahora se guarda correctamente
          });

          await doc.save();
          console.log(
            `Call log guardado en MongoDB para streamSid: ${streamSid}`
          );
        } catch (err) {
          console.error("Error guardando en MongoDB:", err);
        }
      }
    });

    // Cuando OpenAI cierra su WebSocket
    openAiWs.on("close", () => {
      console.log("Disconnected from the OpenAI Realtime API");
    });

    // Maneja errores en el WebSocket con OpenAI
    openAiWs.on("error", (error) => {
      console.error("Error in the OpenAI WebSocket:", error);
    });
  });
});

// -----------------------------------------------------------------------------
// 4. ARRANCA EL SERVIDOR
// -----------------------------------------------------------------------------

fastify.listen({ port: PORT }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
});
