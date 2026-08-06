const { PrismaClient } = require('./src/generated/client');
const p = new PrismaClient();
p.inbox.findMany({ where: { channelType: 'email' } })
  .then(inboxes => console.log('Inboxes:', JSON.stringify(inboxes, null, 2)))
  .catch(console.error)
  .finally(() => p.$disconnect());
