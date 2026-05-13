const { ADMIN_PANEL_PASSWORD } = require("../../config");

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  return res.redirect("/admin/login");
}

function postLogin(req, res) {
  const pass = String(req.body?.password || "");
  if (pass === ADMIN_PANEL_PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect("/admin");
  }
  return res.send(`<h3>Wrong password</h3><a href="/admin/login">Back</a>`);
}

function logout(req, res) {
  req.session.destroy(() => res.redirect("/admin/login"));
}

module.exports = { requireLogin, postLogin, logout };