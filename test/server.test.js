import Fastify from 'fastify';
import supertest from 'supertest';

describe('Server tests', () => {
  let fastify;

  // Se ejecuta antes de todas las pruebas para inicializar el servidor
  beforeAll(async () => {
    fastify = Fastify();
    
    // Define la ruta raíz para las pruebas
    fastify.get('/', async (request, reply) => {
      reply.send({ message: 'Twilio Media Stream Server is running!' });
    });

    // Inicia el servidor en el puerto 3000
    await fastify.listen({ port: 3000 });
  });

  // Se ejecuta después de todas las pruebas para cerrar el servidor
  afterAll(async () => {
    await fastify.close();
  });

  // Prueba la ruta GET /
  test('GET / should return server status message', async () => {
    const response = await supertest(fastify.server).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Twilio Media Stream Server is running!' });
  });

  // Prueba la ruta /incoming-call (simula una solicitud desde Twilio)
  test('POST /incoming-call should return TWiML response', async () => {
    fastify.all('/incoming-call', async (request, reply) => {
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                            <Response>
                              <Say>Por favor, espere mientras conectamos su llamada al asistente de voz de IA.</Say>
                              <Pause length="1"/>
                              <Say>Ahora puede comenzar a hablar.</Say>
                              <Connect>
                                <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                            </Response>`;
      reply.type('text/xml').send(twimlResponse);
    });

    const response = await supertest(fastify.server).post('/incoming-call');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<Response>');
    expect(response.text).toContain('<Say>Por favor, espere mientras conectamos su llamada');
  });
});
