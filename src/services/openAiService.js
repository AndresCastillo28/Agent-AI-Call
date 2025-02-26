import { WebSocket } from 'ws';
import openAiConfig from '../config/openAi.js';
import { sendMark } from './twilioService.js';

const SYSTEM_MESSAGE = 'Eres un asistente de IA servicial y profesional, especializado en ofrecer servicios de atención telefónica a los usuarios. Tu función es resolver consultas y brindar soluciones de manera clara, empática y eficiente. Aunque tu enfoque es profesional, siempre mantén un tono cercano y cordial, y, cuando la situación lo permita, introduce un toque de humor sutil para hacer la experiencia más amena. Tu objetivo es que cada llamada se convierta en una interacción positiva y resolutiva para el usuario.';

const VOICE = 'alloy'

const LOG_EVENT_TYPES = [
  'error',
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created'
];



export function initializeSession() {
  const openAiWs = new WebSocket(`${openAiConfig.apiUrl}?model=${openAiConfig.model}`, {
    headers: {
      Authorization: `Bearer ${openAiConfig.apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  const sessionUpdate = {
    type: 'session.update',
    session: {
      turn_detection: { type: 'server_vad' },
      input_audio_format: 'g711_ulaw',
      output_audio_format: 'g711_ulaw',
      voice: VOICE,
      instructions: SYSTEM_MESSAGE,
      modalities: ['text', 'audio'],
      temperature: 0.8,
    },
  };

  openAiWs.on('open', () => {
    console.log('Sending session update');
    openAiWs.send(JSON.stringify(sessionUpdate));
  });

  return openAiWs;
}

export function handleOpenAiMessage(data, connection, state) {
  try {
    const response = JSON.parse(data);

    if (LOG_EVENT_TYPES.includes(response.type)) {
      console.log(`Received event: ${response.type}`, response);
    }

    if (response.type === "response.audio.delta" && response.delta) {
      const audioDelta = {
        event: "media",
        streamSid: state.streamSid,
        media: { payload: response.delta },
      };
      connection.send(JSON.stringify(audioDelta));

        // First delta from a new response starts the elapsed time counter
        if (!responseStartTimestampTwilio) {
          responseStartTimestampTwilio = latestMediaTimestamp;
          if (SHOW_TIMING_MATH) console.log(`Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`);
      }

      if (response.item_id) {
          lastAssistantItem = response.item_id;
      }
      
      sendMark(connection, streamSid);
    }

    if (response.type === "input_audio_buffer.speech_started") {
      handleSpeechStartedEvent();
    }
  } catch (error) {
    console.error("Error processing OpenAI message:", error);
  }
}

 // Handle interruption when the caller's speech starts
 const handleSpeechStartedEvent = () => {
  if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
      const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
      if (SHOW_TIMING_MATH) console.log(`Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`);

      if (lastAssistantItem) {
          const truncateEvent = {
              type: 'conversation.item.truncate',
              item_id: lastAssistantItem,
              content_index: 0,
              audio_end_ms: elapsedTime
          };
          if (SHOW_TIMING_MATH) console.log('Sending truncation event:', JSON.stringify(truncateEvent));
          openAiWs.send(JSON.stringify(truncateEvent));
      }

      connection.send(JSON.stringify({
          event: 'clear',
          streamSid: streamSid
      }));

      // Reset
      markQueue = [];
      lastAssistantItem = null;
      responseStartTimestampTwilio = null;
  }
};

