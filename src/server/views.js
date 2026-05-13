function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  body{font-family:system-ui,Segoe UI,Arial;margin:0;background:#0b0f14;color:#e9eef6}
  a{color:#9bd1ff;text-decoration:none}
  .top{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;background:#111827;border-bottom:1px solid #1f2937}
  .wrap{padding:18px;max-width:1100px;margin:0 auto}
  .card{background:#0f172a;border:1px solid #1f2937;border-radius:14px;padding:14px;margin:12px 0}
  input,select,button,textarea{width:100%;padding:10px;border-radius:12px;border:1px solid #263244;background:#0b1220;color:#e9eef6}
  button{cursor:pointer}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #1f2937;padding:10px;text-align:left;font-size:14px}
  .pill{display:inline-block;padding:4px 10px;border:1px solid #2b3a55;border-radius:999px}
  .muted{color:#9aa4b2}
  @media (max-width:900px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="top">
    <div><b>AIN Admin Panel</b> <span class="muted">V2</span></div>
    <div style="display:flex;gap:14px;align-items:center">
      <a href="/admin">Dashboard</a>
      <a href="/admin/users">Users</a>
      <a href="/admin/subscriptions">Subscriptions</a>
      <a href="/admin/notifications">Notifications</a>
      <a href="/admin/logs">Logs</a>
      <a href="/admin/logout">Logout</a>
    </div>
  </div>
  <div class="wrap">${body}</div>
</body>
</html>`;
}

function loginPage() {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Login</title>
<style>
 body{font-family:system-ui;background:#0b0f14;color:#e9eef6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
 .card{background:#0f172a;border:1px solid #1f2937;border-radius:16px;padding:18px;width:360px}
 input,button{width:100%;padding:10px;border-radius:12px;border:1px solid #263244;background:#0b1220;color:#e9eef6}
 button{cursor:pointer;margin-top:10px}
</style>
</head>
<body>
  <form class="card" method="post" action="/admin/login">
    <h3 style="margin:0 0 12px 0">Admin Login</h3>
    <input type="password" name="password" placeholder="Admin panel password" required />
    <button type="submit">Login</button>
  </form>
</body></html>`;
}

module.exports = { layout, loginPage };