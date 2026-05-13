const { Markup } = require("telegraf");
const { BOT_NAME, AIN_BIO_LINK, OWNER_ID } = require("../../config");
const { readDb, writeDb, audit } = require("../db/db");
const { ensureUser, roleOrder, normalizeUsername } = require("./middleware");

const PLANS = {
  starter: { name: "Starter", desc: "مناسب للبداية", perks: ["Basic links", "Simple customization"] },
  pro: { name: "Pro", desc: "للمحترفين", perks: ["More links", "Advanced customization", "Better analytics"] },
  elite: { name: "Elite", desc: "أعلى باقة", perks: ["Unlimited links", "Full customization", "Premium analytics", "Priority support"] }
};

function nowIso() { return new Date().toISOString(); }

function daysLeft(endsAt) {
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function isExpired(endsAt) {
  return new Date(endsAt).getTime() < Date.now();
}

function parseAfterCommand(text) {
  const parts = String(text || "").trim().split(/\s+/);
  parts.shift();
  return parts;
}

function ensureUserRow(db, id) {
  const now = nowIso();
  let u = db.users.find((x) => x.telegram_id === id);
  if (!u) {
    u = { telegram_id: id, username: null, first_name: null, role: "user", status: "active", created_at: now, updated_at: now };
    db.users.push(u);
  } else {
    u.updated_at = now;
  }
  if (id === OWNER_ID) {
    u.role = "owner";
    u.status = "active";
  }
  return u;
}

function findUserIdByUsername(db, usernameInput) {
  const uname = normalizeUsername(usernameInput);
  if (!uname) return null;
  const u = db.users.find(x => x.username && x.username === uname);
  return u ? u.telegram_id : null;
}

function getSub(db, id) {
  return db.subscriptions.find((s) => s.telegram_id === id) || null;
}

function setSub(db, id, plan, days) {
  const now = new Date();
  const ends = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  let s = getSub(db, id);
  if (!s) {
    s = { telegram_id: id, plan, starts_at: now.toISOString(), ends_at: ends.toISOString(), active: 1, updated_at: nowIso(), last_reminder: null };
    db.subscriptions.push(s);
  } else {
    s.plan = plan;
    s.starts_at = now.toISOString();
    s.ends_at = ends.toISOString();
    s.active = 1;
    s.updated_at = nowIso();
  }
  return s;
}

function deactivateSub(db, id) {
  const s = getSub(db, id);
  if (!s) return null;
  s.active = 0;
  s.updated_at = nowIso();
  return s;
}

function formatPlanCard(planKey) {
  const p = PLANS[planKey];
  const perks = p.perks.map(x => `• ${x}`).join("\n");
  return `📦 ${p.name} (${planKey})\n${p.desc}\n\n${perks}`;
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.url("🌐 Open AIN HUB", AIN_BIO_LINK)],
    [Markup.button.callback("👤 My Info", "ME"), Markup.button.callback("📦 My Plan", "MYPLAN")],
    [Markup.button.callback("🧾 Plans", "PLANS"), Markup.button.callback("🛒 Subscribe / Renew", "SUBSCRIBE")],
    [Markup.button.callback("📰 Latest Update", "NEWS")]
  ]);
}

// ---------- Public ----------
async function start(ctx) {
  const u = ensureUser(ctx);
  return ctx.reply(`هلا 👋\nأنا ${BOT_NAME}\nصلاحيتك: ${u.role}`, mainMenu());
}

async function help(ctx) {
  return ctx.reply(
`📌 أوامر عامة:
- /start
- /help
- /whoami
- /myplan
- /plans
- /subscribe
- /latest

🛡️ دعم (Moderator):
- /support <msg>

🔒 اشتراكات (Admin+):
- /activate <telegram_id|@username|username> <starter|pro|elite> <days>
- /deactivate <telegram_id|@username|username>
- /broadcast <message>

👑 Owner:
- /roles
- /setadmin <id>
- /setmod <id>
- /setuser <id>
`
  );
}

async function whoami(ctx) {
  const db = readDb();
  const telegramId = Number(ctx.from.id);
  const u = ensureUserRow(db, telegramId);
  writeDb(db);

  return ctx.reply(
`👤 ${u.first_name || ""} ${u.username ? "@" + u.username : ""}`.trim() +
`\n🆔 ${u.telegram_id}` +
`\n🔐 Role: ${u.role}` +
`\n✅ Status: ${u.status}`
  );
}

async function plans(ctx) {
  const text =
`${formatPlanCard("starter")}

${formatPlanCard("pro")}

${formatPlanCard("elite")}

🛒 للاشتراك/التجديد:
- اضغط Subscribe / Renew أو اكتب /subscribe`;
  return ctx.reply(text, mainMenu());
}

async function subscribe(ctx) {
  const kb = Markup.inlineKeyboard([
    [Markup.button.url("🛒 Go to Subscribe", AIN_BIO_LINK)],
    [Markup.button.callback("📦 My Plan", "MYPLAN"), Markup.button.callback("🧾 Plans", "PLANS")],
    [Markup.button.callback("↩️ Back", "BACK")]
  ]);
  return ctx.reply(
`🛒 الاشتراك/التجديد يتم عبر موقعنا:
${AIN_BIO_LINK}

بعد ما تشترك، الأدمن يفعّل اشتراكك داخل البوت.`,
    kb
  );
}

async function myplan(ctx) {
  const db = readDb();
  const telegramId = Number(ctx.from.id);

  const s = getSub(db, telegramId);
  if (!s || !s.active) return ctx.reply("📦 ما عندك اشتراك فعّال حالياً.\nاكتب /subscribe للاشتراك.");

  if (isExpired(s.ends_at)) {
    s.active = 0;
    s.updated_at = nowIso();
    writeDb(db);
    return ctx.reply("⏳ انتهى اشتراكك وتم إيقافه تلقائياً.\nاكتب /subscribe للتجديد.");
  }

  const left = daysLeft(s.ends_at);
  return ctx.reply(
`📦 Plan: ${s.plan.toUpperCase()}
⏳ Days left: ${left}
🗓 Ends: ${s.ends_at}
✅ Status: Active`
  );
}

async function latest(ctx) {
  const db = readDb();
  const n = [...db.notifications].sort((a, b) => (b.id || 0) - (a.id || 0))[0];
  if (!n) return ctx.reply("📰 ما فيه تحديثات حالياً.");
  return ctx.reply(`📰 ${n.title}\n\n${n.body}\n\n🕒 ${n.created_at}`);
}

// ---------- Owner/Admin/Mod management ----------
async function roles(ctx) {
  const db = readDb();
  const rows = [...db.users]
    .sort((a, b) => roleOrder(b.role) - roleOrder(a.role) || a.telegram_id - b.telegram_id)
    .slice(0, 120);

  const lines = rows.map(r => `- ${r.telegram_id} ${r.username ? "@"+r.username : ""} | ${r.role} | ${r.status}`);
  return ctx.reply(`👥 Users (first 120):\n${lines.join("\n") || "-"}`);
}

async function setRoleCmd(ctx, targetRole) {
  const actor = ensureUser(ctx);
  const actorId = Number(ctx.from.id);

  const args = parseAfterCommand(ctx.message?.text);
  const id = Number(args[0]);
  if (!Number.isFinite(id)) return ctx.reply("استخدمها كذا: /setadmin 123456789");

  if (targetRole !== "user" && actor.role !== "owner") return ctx.reply("⛔ هذا الأمر للـOwner فقط.");

  const db = readDb();
  const u = ensureUserRow(db, id);

  if (u.telegram_id === OWNER_ID) {
    u.role = "owner";
    u.status = "active";
  } else {
    u.role = targetRole;
    if (u.status !== "banned") u.status = "active";
  }

  u.updated_at = nowIso();
  writeDb(db);

  audit(actorId, "SET_ROLE", { target: id, role: targetRole });
  return ctx.reply(`✅ تم تعيين Role: ${targetRole} لـ ID: ${id}`);
}

async function banCmd(ctx, banned) {
  const actor = ensureUser(ctx);
  const actorId = Number(ctx.from.id);

  const args = parseAfterCommand(ctx.message?.text);
  const raw = args[0];
  if (!raw) return ctx.reply("استخدمها كذا: /ban 123456789 أو /ban @username");

  const db = readDb();
  let id = Number(raw);
  if (!Number.isFinite(id)) id = findUserIdByUsername(db, raw);
  if (!Number.isFinite(id)) return ctx.reply("⛔ ما قدرت أحدد المستخدم. تأكد أنه كتب /start عند البوت.");

  if (id === actorId) return ctx.reply("⛔ ما تقدر تحظر نفسك.");
  if (id === OWNER_ID) return ctx.reply("⛔ ما تقدر تحظر الـOwner.");

  const target = ensureUserRow(db, id);

  if (roleOrder(actor.role) <= roleOrder(target.role)) {
    return ctx.reply("⛔ ما تقدر تحظر/تفك حظر شخص صلاحياته مساوية أو أعلى منك.");
  }

  target.status = banned ? "banned" : "active";
  target.updated_at = nowIso();
  writeDb(db);

  audit(actorId, banned ? "BAN" : "UNBAN", { target: id });
  return ctx.reply(`✅ تم ${banned ? "حظر" : "فك حظر"} المستخدم: ${id}`);
}

// ---------- Subscriptions (Admin+) ----------
async function activate(ctx) {
  const actor = ensureUser(ctx);
  if (roleOrder(actor.role) < roleOrder("admin")) return ctx.reply("⛔ هذا الأمر للأدمن وما فوق.");

  const actorId = Number(ctx.from.id);
  const args = parseAfterCommand(ctx.message?.text);

  const targetRaw = args[0];
  const plan = String(args[1] || "").toLowerCase();
  const days = Number(args[2]);

  const allowed = ["starter", "pro", "elite"];
  if (!targetRaw || !allowed.includes(plan) || !Number.isFinite(days) || days <= 0) {
    return ctx.reply("استخدمها كذا: /activate @username pro 30\nأو: /activate 123456789 pro 30");
  }

  const db = readDb();

  let id = Number(targetRaw);
  if (!Number.isFinite(id)) id = findUserIdByUsername(db, targetRaw);

  if (!Number.isFinite(id)) {
    return ctx.reply("⛔ ما قدرت أحدد المستخدم بهذا اليوزر.\nلازم المستخدم يكتب /start عند البوت مرة وحدة على الأقل.");
  }

  ensureUserRow(db, id);
  const s = setSub(db, id, plan, days);
  writeDb(db);

  audit(actorId, "ACTIVATE_SUB", { target: id, plan, days });

  try {
    await ctx.telegram.sendMessage(id, `✅ تم تفعيل اشتراكك: ${plan.toUpperCase()} لمدة ${days} يوم.\n🗓 ينتهي: ${s.ends_at}`);
  } catch {}

  return ctx.reply(`✅ تم تفعيل ${plan} لمدة ${days} يوم للمستخدم: ${targetRaw}`);
}

async function deactivate(ctx) {
  const actor = ensureUser(ctx);
  if (roleOrder(actor.role) < roleOrder("admin")) return ctx.reply("⛔ هذا الأمر للأدمن وما فوق.");

  const actorId = Number(ctx.from.id);
  const args = parseAfterCommand(ctx.message?.text);
  const raw = args[0];
  if (!raw) return ctx.reply("استخدمها كذا: /deactivate @username أو /deactivate 123456789");

  const db = readDb();
  let id = Number(raw);
  if (!Number.isFinite(id)) id = findUserIdByUsername(db, raw);
  if (!Number.isFinite(id)) return ctx.reply("⛔ ما قدرت أحدد المستخدم. تأكد أنه كتب /start عند البوت.");

  const s = deactivateSub(db, id);
  writeDb(db);

  audit(actorId, "DEACTIVATE_SUB", { target: id });

  if (!s) return ctx.reply("ℹ️ ما لقيت اشتراك لهاليوزر.");
  try { await ctx.telegram.sendMessage(id, `⛔ تم إيقاف اشتراكك حالياً. إذا عندك استفسار تواصل مع الدعم.`); } catch {}
  return ctx.reply(`✅ تم إيقاف الاشتراك للمستخدم: ${raw}`);
}

async function broadcast(ctx) {
  const actor = ensureUser(ctx);
  if (roleOrder(actor.role) < roleOrder("admin")) return ctx.reply("⛔ هذا الأمر للأدمن وما فوق.");

  const actorId = Number(ctx.from.id);
  const msg = String(ctx.message?.text || "").replace(/^\/broadcast\s*/i, "").trim();
  if (!msg) return ctx.reply("استخدمها كذا: /broadcast رسالة");

  const db = readDb();
  const targets = db.users.filter(u => u.status !== "banned").map(u => u.telegram_id);

  let ok = 0, fail = 0;
  for (const id of targets) {
    try { await ctx.telegram.sendMessage(id, `📣 ${msg}`); ok++; }
    catch { fail++; }
  }

  audit(actorId, "BROADCAST", { ok, fail });
  return ctx.reply(`✅ Broadcast done. Sent: ${ok}, Failed: ${fail}`);
}

// ---------- Support (Mod+) ----------
async function support(ctx) {
  const actor = ensureUser(ctx);
  if (roleOrder(actor.role) < roleOrder("mod")) return ctx.reply("⛔ هذا الأمر للمشرف وما فوق.");

  const actorId = Number(ctx.from.id);
  const msg = String(ctx.message?.text || "").replace(/^\/support\s*/i, "").trim();
  if (!msg) return ctx.reply("استخدمها كذا: /support نص الرسالة");

  audit(actorId, "SUPPORT_NOTE", { message: msg });
  return ctx.reply("✅ تم تسجيل رسالة الدعم في السجل (Logs).");
}

// ---------- Notifications ----------
async function push(ctx) {
  const actor = ensureUser(ctx);
  if (roleOrder(actor.role) < roleOrder("admin")) return ctx.reply("⛔ هذا الأمر للأدمن وما فوق.");

  const actorId = Number(ctx.from.id);
  const text = String(ctx.message?.text || "");
  const payload = text.replace(/^\/push\s*/i, "");
  const parts = payload.split("|").map(s => s.trim());
  const title = parts[0];
  const body = parts.slice(1).join(" | ");
  if (!title || !body) return ctx.reply("استخدمها كذا: /push Title | Message");

  const db = readDb();
  const nextId = (db.notifications.at(-1)?.id || 0) + 1;
  db.notifications.push({ id: nextId, title, body, created_at: nowIso() });
  writeDb(db);

  audit(actorId, "PUSH_CREATE", { title });
  return ctx.reply("✅ تم حفظ الإشعار. تقدر تشوفه بـ /latest أو من لوحة التحكم.");
}

// ---------- Callbacks ----------
async function onCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  await ctx.answerCbQuery();

  if (data === "ME") return whoami(ctx);
  if (data === "MYPLAN") return myplan(ctx);
  if (data === "NEWS") return latest(ctx);
  if (data === "PLANS") return plans(ctx);
  if (data === "SUBSCRIBE") return subscribe(ctx);
  if (data === "BACK") return start(ctx);
}

module.exports = {
  start, help, whoami, myplan, latest, plans, subscribe,
  roles, setRoleCmd, banCmd,
  activate, deactivate, broadcast, support, push,
  onCallback, PLANS
};