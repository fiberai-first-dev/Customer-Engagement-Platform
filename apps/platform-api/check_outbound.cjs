const { PrismaClient } = require('./src/generated/client');
const p = new PrismaClient();
async function main() {
  const msgs = await p.message.findMany({
    where: { direction: 'outgoing' },
    include: { conversation: { include: { inbox: true } } }
  });
  console.log("Outgoing messages count:", msgs.length);
  const emailMsgs = msgs.filter(m => m.conversation.inbox.channelType === 'email');
  console.log("Outgoing email messages:", JSON.stringify(emailMsgs, null, 2));
}
main().catch(console.error).finally(() => p.$disconnect());
