const { Telegraf } = require("telegraf");
const { BOT_TOKEN } = require("../../config");
const { logInfo, logError } = require("../utils/logger");
const { ensureUser, requireRole } = require("./middleware");
const cmds = require("./commands");
const { readDb, writeDb, audit } = require("../db/db");

function daysLeft(endsAt) {
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const diff = end - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function startSubscriptionWatcher(bot) {
  setInterval(async () => {
    try {
      const db = readDb();
      const now = Date.now();
      let changed = false;

      for (const s of db.subscriptions) {
        if (!s.active) continue;

        const end = new Date(s.ends_at).getTime();

        if (end < now) {
          s.active = 0;
          s.updated_at = new Date().toISOString();
          changed = true;

          audit(null, "AUTO_EXPIRE_SUB", { target: s.telegram_id });

          try {
            await bot.telegram.sendMessage(
              s.telegram_id,
              "⏳ انتهى اشتراكك وتم إيقافه تلقائياً.\nاكتب /subscribe للتجديد."
            );
          } catch {}

          continue;
        }

        const left = daysLeft(s.ends_at);

        if (left <= 3 && left > 0) {
          const last = s.last_reminder ? new Date(s.last_reminder).getTime() : 0;

          if (!last || now - last > 24 * 60 * 60 * 1000) {
            s.last_reminder = new Date().toISOString();
            s.updated_at = new Date().toISOString();
            changed = true;

            audit(null, "AUTO_REMINDER_SUB", {
              target: s.telegram_id,
              days_left: left
            });

            try {
              await bot.telegram.sendMessage(
                s.telegram_id,
                `🔔 تذكير: باقي على انتهاء اشتراكك ${left} يوم.\nاكتب /subscribe للتجديد.`
              );
            } catch {}
          }
        }
      }

      if (changed) writeDb(db);
    } catch (e) {}
  }, 60 * 1000);
}

async function startBot() {
  const bot = new Telegraf(BOT_TOKEN);

  bot.catch((err) => logError("Bot error", err));

  bot.use(async (ctx, next) => {
    try {
      ensureUser(ctx);
    } catch {}

    return next();
  });

  bot.start(cmds.start);
  bot.help(cmds.help);

  bot.command("whoami", cmds.whoami);
  bot.command("myplan", cmds.myplan);
  bot.command("plans", cmds.plans);
  bot.command("subscribe", cmds.subscribe);
  bot.command("latest", cmds.latest);

  bot.command("roles", requireRole("admin"), cmds.roles);
  bot.command("setadmin", requireRole("owner"), (ctx) => cmds.setRoleCmd(ctx, "admin"));
  bot.command("setmod", requireRole("owner"), (ctx) => cmds.setRoleCmd(ctx, "mod"));
  bot.command("setuser", requireRole("owner"), (ctx) => cmds.setRoleCmd(ctx, "user"));

  bot.command("ban", requireRole("mod"), (ctx) => cmds.banCmd(ctx, true));
  bot.command("unban", requireRole("mod"), (ctx) => cmds.banCmd(ctx, false));
  bot.command("support", requireRole("mod"), cmds.support);

  bot.command("activate", requireRole("admin"), cmds.activate);
  bot.command("deactivate", requireRole("admin"), cmds.deactivate);
  bot.command("broadcast", requireRole("admin"), cmds.broadcast);
  bot.command("push", requireRole("admin"), cmds.push);

  bot.on("callback_query", cmds.onCallback);

  bot.launch({ dropPendingUpdates: true })
    .then(() => {
      logInfo("✅ Bot is running (polling).");
    })
    .catch((e) => {
      logError("❌ Bot launch failed", e);
    });

  startSubscriptionWatcher(bot);

  return bot;
}

module.exports = { startBot };