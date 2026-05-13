const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "..", "..", "data");
const dbFile = path.join(dataDir, "db.json");

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({
      users: [],
      subscriptions: [],
      notifications: [],
      audit_logs: []
    }, null, 2), "utf8");
  }
}

function readDb() {
  ensure();
  return JSON.parse(fs.readFileSync(dbFile, "utf8"));
}

function writeDb(db) {
  ensure();
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");
}

function initDb({ OWNER_ID }) {
  const db = readDb();
  const now = new Date().toISOString();

  const idx = db.users.findIndex(u => u.telegram_id === OWNER_ID);
  if (idx === -1) {
    db.users.push({
      telegram_id: OWNER_ID,
      username: null,
      first_name: "Owner",
      role: "owner",
      status: "active",
      created_at: now,
      updated_at: now
    });
  } else {
    db.users[idx].role = "owner";
    db.users[idx].status = "active";
    db.users[idx].updated_at = now;
  }

  writeDb(db);
}

function audit(actorId, action, metaObj) {
  const db = readDb();
  db.audit_logs.push({
    id: (db.audit_logs.at(-1)?.id || 0) + 1,
    actor_id: actorId ?? null,
    action,
    meta: metaObj ? JSON.stringify(metaObj) : null,
    created_at: new Date().toISOString()
  });
  writeDb(db);
}

module.exports = { initDb, readDb, writeDb, audit };