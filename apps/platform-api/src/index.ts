import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { registerRoutes } from "./routes.js";

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await registerRoutes(app);

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    app.log.info(`platform-api listening on :${env.port}`);
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
