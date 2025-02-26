// src/routes/statusRoutes.js
export default async function statusRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        reply.send({ message: 'Twilio Media Stream Server is running!' });
    });
}
