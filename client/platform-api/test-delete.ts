import { PrismaClient } from './src/generated/client/index.js';

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://cep:cep@localhost:5432/cep_demo' } } });
  const config = await prisma.whatsAppConfig.findFirst();
  
  if (!config) {
    console.log("No WA config");
    return;
  }
  
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${config.businessAccountId}/message_templates?name=test_template_to_delete`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config.accessToken}` },
    }
  );
  
  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Response:", text);
}

main().catch(console.error);
