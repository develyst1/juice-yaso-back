import { app } from "./app";

const port = Number(process.env.PORT ?? 4013);

console.log(`juice-yaso-back listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
