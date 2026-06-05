import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      subject: string;
      role: 'viewer' | 'admin';
      userName?: string;
    };
  }
}
