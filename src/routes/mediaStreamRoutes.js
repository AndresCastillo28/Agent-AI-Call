import { mediaStreamController } from '../controllers/mediaStreamController.js';

export default async function mediaStreamRoutes(fastify) {
  fastify.get('/media-stream', { websocket: true }, (connection) => {
    mediaStreamController(connection);
  });
}
