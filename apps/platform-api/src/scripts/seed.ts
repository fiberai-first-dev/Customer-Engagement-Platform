import "../config/load-env.js";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { ensureWorkspace } from "../services/WorkspaceService.js";

async function main() {
  const account = await ensureWorkspace();
  const inboxes = await prisma.inbox.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "asc" },
  });
  const base = env.publicBaseUrl.replace(/\/$/, "");

  console.log(
    JSON.stringify(
      {
        accountId: account.id,
        publicBaseUrl: base,
        note: "Empty channel credentials — configure in Settings",
        inboxes: inboxes.map((inbox) => ({
          id: inbox.id,
          channel: inbox.channelType,
          enabled: inbox.enabled,
          webhook: `${base}/webhooks/${inbox.channelType}`,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
