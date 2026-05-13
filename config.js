require("dotenv").config();

function mustGet(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env var: ${name}`);
  return String(v).trim();
}

const OWNER_ID = Number(mustGet("OWNER_ID"));
if (!Number.isFinite(OWNER_ID)) throw new Error("OWNER_ID must be a number");

module.exports = {
  BOT_TOKEN: mustGet("BOT_TOKEN"),
  OWNER_ID,
  BOT_NAME: process.env.BOT_NAME ? String(process.env.BOT_NAME).trim() : "AIN STORE Bot",
  NODE_ENV: process.env.NODE_ENV ? String(process.env.NODE_ENV).trim() : "production",

  ADMIN_PANEL_PASSWORD: mustGet("ADMIN_PANEL_PASSWORD"),
  ADMIN_PANEL_SESSION_SECRET: mustGet("ADMIN_PANEL_SESSION_SECRET"),
  AIN_BIO_LINK: mustGet("AIN_BIO_LINK"),
  AIN_API_KEY: mustGet("AIN_API_KEY"),
  PORT: Number(process.env.PORT || 3000)
};