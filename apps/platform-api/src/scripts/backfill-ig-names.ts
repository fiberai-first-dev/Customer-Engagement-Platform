/**
 * One-shot: replace numeric Instagram IGSID contact names with @username.
 * Usage: npx tsx src/scripts/backfill-ig-names.ts
 */
import "../config/load-env.js";
import { prisma } from "../config/db.js";
import { resolveChannelConfig } from "../adapters/shared/index.js";
import {
  formatInstagramDisplayName,
  resolveInstagramSenderProfile,
} from "../adapters/instagram/index.js";
import type { InstagramChannelConfig } from "../adapters/shared/types.js";

async function main() {
  const inbox = await prisma.inbox.findFirst({
    where: { channelType: "instagram", enabled: true },
  });
  if (!inbox) throw new Error("No Instagram inbox");
  const config = resolveChannelConfig("instagram", inbox.channelConfig) as InstagramChannelConfig;

  const contacts = await prisma.contact.findMany({
    where: { instagramEnabled: true, instagramId: { not: null } },
  });

  let updated = 0;
  for (const contact of contacts) {
    const igsid = contact.instagramId!;
    const looksNumeric = !contact.name || /^\d{10,}$/.test(contact.name.trim());
    if (!looksNumeric) {
      console.log("skip", contact.id, contact.name);
      continue;
    }
    const profile = await resolveInstagramSenderProfile(config, igsid);
    const display = profile ? formatInstagramDisplayName(profile) : undefined;
    if (!display) {
      console.log("no profile", igsid);
      continue;
    }
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        name: display,
        instagramDetails: {
          ...((contact.instagramDetails as object) ?? {}),
          ...profile,
        },
      },
    });
    console.log("updated", igsid, "→", display);
    updated++;
  }
  console.log({ updated, total: contacts.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
