import "dotenv/config";
import { listCustomFields } from "../src/services/ghlClient.js";

const data = await listCustomFields();
for (const f of data.customFields || []) {
  console.log(`${f.id}  ->  ${f.name}  (model: ${f.model || "contact"})`);
}
console.log(`\n${(data.customFields || []).length} field(s) found. Copy the relevant IDs into src/config/fields.js.`);
