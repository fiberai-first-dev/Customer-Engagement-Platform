import { describe, expect, it } from "vitest";
import { whatsappAdapter, instagramAdapter, emailAdapter } from "./index.js";

describe("whatsappAdapter", () => {
  it("verifies webhook challenge", () => {
    const challenge = whatsappAdapter.verifyWebhook!(
      { phoneNumberId: "1", accessToken: "t", verifyToken: "secret", mock: true },
      { "hub.mode": "subscribe", "hub.verify_token": "secret", "hub.challenge": "12345" },
    );
    expect(challenge).toBe("12345");
  });

  it("parses inbound text", () => {
    const msgs = whatsappAdapter.parseInbound(
      { phoneNumberId: "1", accessToken: "t", verifyToken: "secret", mock: true },
      {
        entry: [
          {
            changes: [
              {
                value: {
                  contacts: [{ wa_id: "919876543210", profile: { name: "Riya" } }],
                  messages: [
                    {
                      id: "wamid.1",
                      from: "919876543210",
                      timestamp: "1700000000",
                      type: "text",
                      text: { body: "Hello" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.content).toBe("Hello");
    expect(msgs[0]?.senderPhone).toBe("+919876543210");
  });
});

describe("instagramAdapter", () => {
  it("parses inbound DM", () => {
    const msgs = instagramAdapter.parseInbound(
      { pageId: "p", accessToken: "t", verifyToken: "v", mock: true },
      {
        entry: [
          {
            messaging: [
              {
                sender: { id: "ig_user_1" },
                timestamp: 1700000000000,
                message: { mid: "mid.1", text: "Hi from IG" },
              },
            ],
          },
        ],
      },
    );
    expect(msgs[0]?.content).toBe("Hi from IG");
    expect(msgs[0]?.senderId).toBe("ig_user_1");
  });

  it("parses Instagram Login webhook changes format", () => {
    const msgs = instagramAdapter.parseInbound(
      { pageId: "p", accessToken: "IGAA", verifyToken: "v", mock: true },
      {
        object: "instagram",
        entry: [
          {
            id: "0",
            time: 1785809818,
            changes: [
              {
                field: "messages",
                value: {
                  sender: { id: "12334" },
                  recipient: { id: "23245" },
                  timestamp: "1527459824",
                  message: { mid: "random_mid", text: "random_text" },
                },
              },
            ],
          },
        ],
      },
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.content).toBe("random_text");
    expect(msgs[0]?.externalId).toBe("random_mid");
  });
});

describe("emailAdapter", () => {
  it("parses generic inbound", () => {
    const msgs = emailAdapter.parseInbound(
      {
        smtpHost: "localhost",
        smtpPort: 1025,
        smtpUser: "",
        smtpPass: "",
        fromAddress: "support@example.com",
        mock: true,
      },
      {
        id: "m1",
        from: "customer@example.com",
        subject: "Help",
        text: "Need help",
      },
    );
    expect(msgs[0]?.subject).toBe("Help");
    expect(msgs[0]?.content).toBe("Need help");
  });

  it("mock send works", async () => {
    const result = await emailAdapter.sendMessage(
      {
        smtpHost: "localhost",
        smtpPort: 1025,
        smtpUser: "",
        smtpPass: "",
        fromAddress: "support@example.com",
        mock: true,
      },
      { to: "customer@example.com", content: "Thanks", subject: "Re: Help" },
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("mocked");
  });
});
