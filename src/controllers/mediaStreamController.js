import { initializeSession, handleOpenAiMessage } from '../services/openAiService.js';
import { handleTwilioMessage, sendMark } from '../services/twilioService.js';

export function mediaStreamController(connection) {
  console.log('Client connected');

  let streamSid = null;
  let latestMediaTimestamp = 0;
  let lastAssistantItem = null;
  let markQueue = [];
  let responseStartTimestampTwilio = null;

  const openAiWs = initializeSession();

  // Evento: Abrir conexión OpenAI
  openAiWs.on('open', () => {
    console.log('Connected to the OpenAI Realtime API');
  });

  // Evento: Mensaje desde OpenAI
  openAiWs.on('message', (data) => {
    handleOpenAiMessage(data, connection, {
      streamSid,
      latestMediaTimestamp,
      responseStartTimestampTwilio,
      lastAssistantItem,
      markQueue,
    });
  });

  // Evento: Mensaje desde Twilio
  connection.on('message', (message) => {
    const data = JSON.parse(message);
    handleTwilioMessage(data, connection, openAiWs);
  });

  connection.on('close', () => {
    if (openAiWs.readyState === openAiWs.OPEN) openAiWs.close();
    console.log('Client disconnected.');
  });
}
