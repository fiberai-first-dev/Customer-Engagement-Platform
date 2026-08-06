import { PrismaClient } from './src/generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.account.findMany();
  if (accounts.length === 0) {
    const account = await prisma.account.create({
      data: {
        id: 'acc_123',
        name: 'Default Account',
        whatsappEnabled: true,
        instagramEnabled: true,
        emailEnabled: true,
      }
    });
    console.log('Created account:', account);
  } else {
    console.log('Account already exists:', accounts[0]);
    // ensure whatsapp is enabled
    if (!accounts[0].whatsappEnabled) {
      await prisma.account.update({
        where: { id: accounts[0].id },
        data: { whatsappEnabled: true, instagramEnabled: true }
      });
      console.log('Enabled channels on existing account.');
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
