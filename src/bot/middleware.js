const { readDb, writeDb } = require("../db/db");
const { OWNER_ID } = require("../../config");

function roleOrder(role) {
  return ({ user: 0, mod: 1, admin: 2, owner: 3 }[role] ?? 0);
}

function normalizeUsername(u) {
  if (!u) return null;
  return String(u).trim().replace(/^@/, "").toLowerCase() || null;
}

function ensureUser(ctx) {
  const from = ctx?.from;
  const telegram_id = Number(from?.id);
  if (!Number.isFinite(telegram_id)) return { role: "user", status: "active" };

  const username_norm = normalizeUsername(from?.username);
  const first_name = from?.first_name || null;

  const db = readDb();
  const now = new Date().toISOString();

  let u = db.users.find((x) => x.telegram_id === telegram_id);

  if (!u) {
    u = {
      telegram_id,
      username: username_norm, // ✅ store normalized (no @, lowercase)
      first_name,
      role: "user",
      status: "active",
      created_at: now,
      updated_at: now
    };
    db.users.push(u);
  } else {
    u.username = username_norm;
    u.first_name = first_name;
    u.updated_at = now;
  }

  // Force owner role for OWNER_ID
  if (telegram_id === OWNER_ID) {
    u.role = "owner";
    u.status = "active";
  }

  writeDb(db);
  return { role: u.role, status: u.status };
}

function requireRole(minRole) {
  return async (ctx, next) => {
    const u = ensureUser(ctx);
    if (u.status === "banned") {
      return ctx.reply("⛔ تم حظرك من استخدام البوت.");
    }
    if (roleOrder(u.role) >= roleOrder(minRole)) return next();
    return ctx.reply("⛔ ما عندك صلاحية لهذا الأمر.");
  };
}

module.exports = { ensureUser, requireRole, roleOrder, normalizeUsername };