const { PrismaClient } = require('./src/generated/client');
const p = new PrismaClient();

async function check() {
  const c = await p.conversation.findFirst({
    where: { inbox: { channelType: "email" } },
    orderBy: { createdAt: "desc" }
  });
  console.log("Latest email conversation:", c.id);
  const msgs = await p.message.findMany({
    where: { conversationId: c.id }
  });
  console.log("Messages in this conv:", msgs.length);
  console.log(msgs.map(m => ({ id: m.id, dir: m.direction, content: m.content })));
}
check().catch(console.error).finally(() => p.$disconnect());
