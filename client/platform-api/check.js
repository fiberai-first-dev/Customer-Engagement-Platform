import { Client } from "pg";

async function main() {
  const client = new Client({
    connectionString: "postgresql://cep:cep@localhost:5432/cep_demo",
  });
  await client.connect();
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_templates';");
  console.log("Columns:", res.rows.map(r => r.column_name));
  await client.end();
}
main().catch(console.error);
