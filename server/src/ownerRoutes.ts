import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireOwner } from './auth.js';
import {
  inviteAdminAccount,
  listAdminAccounts,
} from './cognitoAdministration.js';

const adminInvitationInput = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  displayName: z.string().trim().min(1).max(160).optional(),
});

export async function registerOwnerRoutes(app: FastifyInstance) {
  const owner = { preHandler: [authenticate, requireOwner] };

  app.get('/api/v1/owner/admins', owner, async () => ({
    items: await listAdminAccounts(),
  }));

  app.post('/api/v1/owner/admins', owner, async (request, reply) => {
    const account = await inviteAdminAccount(adminInvitationInput.parse(request.body));
    return reply.status(201).send(account);
  });
}
