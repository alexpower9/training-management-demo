import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      subject: string;
      role: 'employee' | 'admin' | 'owner';
      userName?: string;
      employee?: {
        id: string;
        displayName: string;
      };
    };
  }
}
