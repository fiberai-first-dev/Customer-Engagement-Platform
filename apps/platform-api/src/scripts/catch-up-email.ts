/**
 * Manually pull recent vendor Gmail INBOX into CEP (recovers missed Pub/Sub mail).
 * Usage: npx tsx src/scripts/catch-up-email.ts
 */
import "../config/load-env.js";
import { prisma } from "../config/db.js";
import { catchUpRecentEmailMessages } from "../services/EmailService.js";

async function main() {
  const inbox = await prisma.channelConfig.findFirst({
    where: { channelType: "email" },
    orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
  });
  if (!inbox) {
    throw new Error("No email channel_config row");
  }
  console.log(`[catch-up-email] inbox=${inbox.id} enabled=${inbox.enabled}`);
  const result = await catchUpRecentEmailMessages(inbox.id, 40);
  console.log(`[catch-up-email] done`, result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
