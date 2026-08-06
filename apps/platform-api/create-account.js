import { PrismaClient } from './src/generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.account.findMany();
  if (accounts.length === 0) {
    const account = await prisma.account.create({
      data: {
        id: 'acc_123',
        name: 'Default Account',
        inboxes: {
          create: [
            { id: 'inbox_wa', name: 'WhatsApp', channelType: 'whatsapp', enabled: true },
            { id: 'inbox_ig', name: 'Instagram', channelType: 'instagram', enabled: true },
            { id: 'inbox_em', name: 'Gmail', channelType: 'email', enabled: true },
          ]
        }
      }
    });
    console.log('Created account:', account);
  } else {
    console.log('Account already exists:', accounts[0]);
    // ensure inboxes exist
    const channels = ['whatsapp', 'instagram', 'email'];
    for (const ch of channels) {
      await prisma.inbox.upsert({
        where: { id: `inbox_${ch}` },
        create: {
          id: `inbox_${ch}`,
          accountId: accounts[0].id,
          name: ch.charAt(0).toUpperCase() + ch.slice(1),
          channelType: ch,
          enabled: true
        },
        update: {}
      });
    }
    console.log('Ensured all inboxes exist.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
