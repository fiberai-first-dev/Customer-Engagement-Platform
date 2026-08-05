import "../load-env.js";
import { ulid } from "ulid";
import { prisma } from "../db.js";

async function main() {
  const existing = await prisma.account.findFirst();
  if (existing) {
    console.log("Seed skipped — account already exists:", existing.id);
    const inboxes = await prisma.inbox.findMany({ where: { accountId: existing.id } });
    console.log(JSON.stringify({ accountId: existing.id, inboxes }, null, 2));
    return;
  }

  const account = await prisma.account.create({
    data: { id: ulid(), name: "FiberAI" },
  });

  const whatsapp = await prisma.inbox.create({
    data: {
      id: ulid(),
      accountId: account.id,
      name: "WhatsApp",
      channelType: "whatsapp",
      channelConfig: {
        mock: true,
        phoneNumberId: "",
        accessToken: "",
        verifyToken: "cep-wa-verify",
      },
    },
  });

  const instagram = await prisma.inbox.create({
    data: {
      id: ulid(),
      accountId: account.id,
      name: "Instagram",
      channelType: "instagram",
      channelConfig: {
        mock: true,
        pageId: "",
        accessToken: "",
        verifyToken: "cep-ig-verify",
      },
    },
  });

  const email = await prisma.inbox.create({
    data: {
      id: ulid(),
      accountId: account.id,
      name: "Email",
      channelType: "email",
      channelConfig: {
        mock: true,
        smtpHost: "localhost",
        smtpPort: 1025,
        smtpUser: "",
        smtpPass: "",
        fromAddress: "support@example.com",
        fromName: "FiberAI Support",
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        accountId: account.id,
        inboxes: [
          { id: whatsapp.id, channel: "whatsapp", verifyToken: "cep-wa-verify" },
          { id: instagram.id, channel: "instagram", verifyToken: "cep-ig-verify" },
          { id: email.id, channel: "email" },
        ],
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
