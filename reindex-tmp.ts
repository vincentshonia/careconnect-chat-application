import { reindexOrganization } from "./src/lib/knowledge-index.server";
const orgs = process.argv.slice(2);
for (const o of orgs) console.log(o, await reindexOrganization(o));
