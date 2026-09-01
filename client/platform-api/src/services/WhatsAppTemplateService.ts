import { prisma } from "../config/db.js";
import type { Prisma } from "../generated/client/index.js";
import type { WhatsAppChannelConfig } from "../adapters/shared/types.js";

export class WhatsAppTemplateService {
  private static async getWAConfig(): Promise<WhatsAppChannelConfig> {
    const config = await prisma.channelConfig.findFirst({
      where: { channelType: "whatsapp", enabled: true }
    });
    if (!config) throw new Error("WhatsApp channel not configured");
    return config.channelConfig as unknown as WhatsAppChannelConfig;
  }

  static async syncTemplatesFromMeta() {
    const config = await this.getWAConfig();
    if (!config.businessAccountId) throw new Error("WhatsApp Business Account ID not configured");
    if (!config.accessToken) throw new Error("WhatsApp access token not configured");

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.businessAccountId}/message_templates?limit=100`,
      {
        headers: {
          "Authorization": `Bearer ${config.accessToken}`
        }
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Meta API Error:", err);
      throw new Error(`Failed to fetch templates from Meta: ${response.statusText}`);
    }

    const data = await response.json();
    const metaTemplates = data.data || [];

    // Sync to local DB
    for (const tpl of metaTemplates) {
      const existing = await prisma.whatsAppTemplate.findFirst({
        where: { name: tpl.name, language: tpl.language }
      });

      if (existing) {
        await prisma.whatsAppTemplate.update({
          where: { id: existing.id },
          data: {
            status: tpl.status,
            metaCategory: tpl.category,
            components: tpl.components as Prisma.InputJsonValue,
            lastSyncedAt: new Date()
          }
        });
      } else {
        await prisma.whatsAppTemplate.create({
          data: {
            name: tpl.name,
            language: tpl.language,
            internalCategory: tpl.category,
            metaCategory: tpl.category,
            components: tpl.components as Prisma.InputJsonValue,
            status: tpl.status,
            lastSyncedAt: new Date()
          }
        });
      }
    }
    
    return prisma.whatsAppTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  static async listTemplates() {
    return prisma.whatsAppTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  static async getTemplate(id: string) {
    return prisma.whatsAppTemplate.findUnique({
      where: { id }
    });
  }

  static async createTemplate(data: {
    name: string;
    language: string;
    internalCategory: string;
    metaCategory: string;
    components: any[];
  }) {
    if (!data.name || !data.language || !data.components) {
      throw new Error("Missing required template fields");
    }

    const config = await this.getWAConfig();
    if (!config.businessAccountId) throw new Error("WhatsApp Business Account ID not configured");
    if (!config.accessToken) throw new Error("WhatsApp access token not configured");

    const payload = {
      name: data.name,
      language: data.language,
      category: data.metaCategory,
      components: data.components
    };

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.businessAccountId}/message_templates`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Meta API Error on Create:", err);
      throw new Error(`Failed to create template in Meta: ${err}`);
    }

    const metaRes = await response.json();
    const componentsJson = JSON.parse(JSON.stringify(data.components));

    return prisma.whatsAppTemplate.create({
      data: {
        name: data.name,
        language: data.language,
        internalCategory: data.internalCategory,
        metaCategory: data.metaCategory,
        components: componentsJson as Prisma.InputJsonValue,
        status: metaRes.status || "PENDING"
      }
    });
  }

  static async deleteTemplate(id: string) {
    const template = await prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) throw new Error("Template not found");

    const config = await this.getWAConfig();
    if (!config.businessAccountId) throw new Error("WhatsApp Business Account ID not configured");
    if (!config.accessToken) throw new Error("WhatsApp access token not configured");

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.businessAccountId}/message_templates?name=${template.name}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${config.accessToken}`
        }
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Meta API Error on Delete:", err);
      throw new Error(`Failed to delete template in Meta: ${err}`);
    }

    return prisma.whatsAppTemplate.delete({
      where: { id }
    });
  }
}

