function now() {
  return new Date().toISOString();
}
function logInfo(msg) {
  console.log(`[${now()}] ${msg}`);
}
function logWarn(msg) {
  console.warn(`[${now()}] ${msg}`);
}
function logError(msg, err) {
  console.error(`[${now()}] ${msg}`);
  if (err) console.error(err);
}
module.exports = { logInfo, logWarn, logError };