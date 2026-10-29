import { buildApp } from "./app.js";

const app = buildApp({ adminToken: process.env.ADMIN_API_TOKEN });
await app.listen({ port: Number(process.env.PORT ?? 3030), host: "0.0.0.0" });
