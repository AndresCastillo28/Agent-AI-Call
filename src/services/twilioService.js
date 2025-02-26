// services/twilioService.js

/**
 * Genera la cadena TWiML (Twilio Markup Language) para la llamada entrante,
 * conectándola a un WebSocket en /media-stream.
 * @param {string} host - El host (ej: request.headers.host) para la etiqueta <Stream />
 * @returns {string} - Cadena XML con el TWiML.
 */
export function getTwimlResponse(host) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Say>Por favor, espere mientras conectamos su llamada al asistente de voz de IA.</Say>
    <Pause length="1"/>
    <Say>Ahora puede comenzar a hablar.</Say>
    <Connect>
      <Stream url="wss://${host}/media-stream" />
    </Connect>
  </Response>`;
}
export function handleTwilioMessage(data, connection, openAiWs) {
  switch (data.event) {
    case "media":
      if (openAiWs.readyState === WebSocket.OPEN) {
        const audioAppend = {
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        };
        openAiWs.send(JSON.stringify(audioAppend));
      }
      break;
    case "start":
      console.log("Incoming stream has started:", data.start.streamSid);
      break;
    default:
      console.log("Received event:", data.event);
  }
}


export function sendMark(connection, streamSid) {
  if (streamSid) {
    const markEvent = {
      event: 'mark',
      streamSid: streamSid,
      mark: { name: 'responsePart' },
    };
    connection.send(JSON.stringify(markEvent));
  }
}
