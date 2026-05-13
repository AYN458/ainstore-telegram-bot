const express = require("express");
const session = require("express-session");
const { PORT, ADMIN_PANEL_SESSION_SECRET, AIN_API_KEY, OWNER_ID } = require("../../config");
const { logInfo } = require("../utils/logger");
const { readDb, writeDb, audit } = require("../db/db");
const { requireLogin, postLogin, logout } = require("./auth");
const { layout, loginPage } = require("./views");

function normalizeUsername(u) {
  if (!u) return null;
  return String(u).trim().replace(/^@/, "").toLowerCase() || null;
}

function findUserIdByUsername(db, usernameInput) {
  const uname = normalizeUsername(usernameInput);
  if (!uname) return null;
  const u = db.users.find(x => x.username && x.username === uname);
  return u ? u.telegram_id : null;
}

function ensureUser(db, id) {
  const now = new Date().toISOString();
  let u = db.users.find(x => x.telegram_id === id);

  if (!u) {
    u = {
      telegram_id: id,
      username: null,
      first_name: null,
      role: "user",
      status: "active",
      created_at: now,
      updated_at: now
    };
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

function upsertSub(db, id, plan, days) {
  const now = new Date();
  const ends = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  let s = db.subscriptions.find(x => x.telegram_id === id);

  if (!s) {
    s = {
      telegram_id: id,
      plan,
      starts_at: now.toISOString(),
      ends_at: ends.toISOString(),
      active: 1,
      updated_at: new Date().toISOString(),
      last_reminder: null
    };
    db.subscriptions.push(s);
  } else {
    s.plan = plan;
    s.starts_at = now.toISOString();
    s.ends_at = ends.toISOString();
    s.active = 1;
    s.updated_at = new Date().toISOString();
  }

  return s;
}

function getOwnerIds() {
  const multi = String(process.env.OWNER_IDS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

  if (multi.length) return multi;

  return [String(OWNER_ID)].filter(Boolean);
}

async function sendToOwners(bot, msg) {
  const ids = getOwnerIds();

  for (const id of ids) {
    try {
      await bot.telegram.sendMessage(id, msg, {
        parse_mode: "HTML"
      });
    } catch (e) {
      console.error(`Failed to send alert to ${id}`, e.message);
    }
  }
}

function buildAinHubMessage(body) {
  const type = String(body?.type || "custom");
  const username = body?.username || "Unknown";
  const plan = body?.plan || "-";
  const message = body?.message || "";
  const orderId = body?.order_id || "-";

  switch (type) {
    case "new_user":
      return `
🔔 AIN HUB | مستخدم جديد

👤 المستخدم: ${username}
💎 الباقة: ${plan}

📌 المصدر: Dashboard
      `;

    case "new_order":
      return `
🛒 AIN HUB | طلب جديد

👤 المستخدم: ${username}
🧾 الطلب: ${orderId}
💎 الباقة: ${plan}

📌 المصدر: Dashboard
      `;

    case "complaint":
      return `
⚠️ AIN HUB | شكوى جديدة

👤 المستخدم: ${username}

📝 الرسالة:
${message}

📌 المصدر: Dashboard
      `;

    case "delete_request":
      return `
🗑️ AIN HUB | طلب حذف حساب

👤 المستخدم: ${username}

📌 المصدر: Dashboard
      `;

    case "new_subscription":
      return `
💳 AIN HUB | اشتراك جديد

👤 المستخدم: ${username}
💎 الباقة: ${plan}

📌 المصدر: Dashboard
      `;

    default:
      return `
🔔 AIN HUB

${message}
      `;
  }
}

function startServer(bot) {
  const app = express();

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-API-KEY");

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use(session({
    secret: ADMIN_PANEL_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true }
  }));

  app.get("/admin/login", (req, res) => res.send(loginPage()));
  app.post("/admin/login", postLogin);
  app.get("/admin/logout", logout);

  app.get("/admin", requireLogin, (req, res) => {
    const db = readDb();

    const usersCount = db.users.length;
    const activeSubs = db.subscriptions.filter(s => s.active).length;

    const lastNotif = [...db.notifications]
      .sort((a, b) => (b.id || 0) - (a.id || 0))[0];

    res.send(layout("Dashboard", `
      <div class="grid">
        <div class="card">
          <div class="muted">Users</div>
          <h2 style="margin:6px 0">${usersCount}</h2>
        </div>

        <div class="card">
          <div class="muted">Active Subscriptions</div>
          <h2 style="margin:6px 0">${activeSubs}</h2>
        </div>
      </div>

      <div class="card">
        <div class="muted">Latest Notification</div>

        <div style="margin-top:8px">
          ${lastNotif
            ? `<b>#${lastNotif.id} ${lastNotif.title}</b> <span class="muted">(${lastNotif.created_at})</span>`
            : "None"}
        </div>
      </div>
    `));
  });

  function requireApiKey(req, res, next) {
    const key = String(req.header("X-API-KEY") || "");

    if (key !== AIN_API_KEY) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      });
    }

    return next();
  }

  app.post("/ainhub-alert", requireApiKey, async (req, res) => {
    try {
      const body = req.body || {};
      const msg = buildAinHubMessage(body);

      await sendToOwners(bot, msg);

      logInfo(`✅ AIN HUB alert sent: ${body.type || "custom"}`);

      return res.json({
        ok: true
      });

    } catch (e) {
      console.error(e);

      return res.status(500).json({
        ok: false,
        error: "Failed to send Telegram alert"
      });
    }
  });

  app.get("/api/subscription/status", requireApiKey, (req, res) => {
    const db = readDb();

    const qUser = normalizeUsername(req.query.username);
    let id = Number(req.query.telegram_id);

    if (!Number.isFinite(id) && qUser) {
      const found = findUserIdByUsername(db, qUser);
      if (found) id = found;
    }

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        ok: false,
        error: "Provide telegram_id or username"
      });
    }

    const user = db.users.find(u => u.telegram_id === id) || null;
    const sub = db.subscriptions.find(s => s.telegram_id === id) || null;

    return res.json({
      ok: true,
      user,
      subscription: sub
    });
  });

  app.post("/api/subscription/activate", requireApiKey, (req, res) => {
    const db = readDb();

    const bodyUser = normalizeUsername(req.body?.username);
    let id = Number(req.body?.telegram_id);

    if (!Number.isFinite(id) && bodyUser) {
      const found = findUserIdByUsername(db, bodyUser);
      if (found) id = found;
    }

    const plan = String(req.body?.plan || "").toLowerCase();
    const days = Number(req.body?.days);
    const allowed = ["starter", "pro", "elite"];

    if (
      !Number.isFinite(id) ||
      !allowed.includes(plan) ||
      !Number.isFinite(days) ||
      days <= 0
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid activation request"
      });
    }

    ensureUser(db, id);
    upsertSub(db, id, plan, days);
    writeDb(db);

    audit(null, "API_ACTIVATE_SUB", {
      target: id,
      plan,
      days
    });

    return res.json({
      ok: true
    });
  });

  const server = app.listen(PORT, () => {
    logInfo(`✅ Admin Panel running: http://localhost:${PORT}/admin`);
    logInfo(`✅ API ready`);
    logInfo(`✅ AIN HUB Alerts ready: /ainhub-alert`);
  });

  return server;
}

module.exports = { startServer };