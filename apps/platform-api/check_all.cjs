const { PrismaClient } = require('./src/generated/client');
const p = new PrismaClient();
async function run() {
  const convs = await p.conversation.findMany({
    where: { inbox: { channelType: "email" } },
    include: { messages: true }
  });
  console.log(JSON.stringify(convs.map(c => ({
    id: c.id,
    lastMsgAt: c.lastMessageAt,
    msgs: c.messages.map(m => ({ dir: m.direction, content: m.content.substring(0, 20) }))
  })), null, 2));
}
run().catch(console.error).finally(() => p.$disconnect());
