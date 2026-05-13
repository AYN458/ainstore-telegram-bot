const { logInfo, logError } = require("./src/utils/logger");
const { initDb } = require("./src/db/db");
const { startServer } = require("./src/server/server");
const { startBot } = require("./src/bot/bot");
const { OWNER_ID } = require("./config");

(async () => {
  try {

    initDb({ OWNER_ID });

    const bot = await startBot();

    const server = startServer(bot);

    const shutdown = async (signal) => {
      try {

        logInfo(`Received ${signal}. Shutting down...`);

        await bot.stop(signal);

        server.close(() => process.exit(0));

      } catch (e) {

        logError("Shutdown error", e);

        process.exit(1);
      }
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    logInfo("✅ V2 started (Bot + Admin Panel + API + AIN HUB Alerts).");

  } catch (e) {

    logError("❌ Failed to start V2", e);

    process.exit(1);
  }
})();