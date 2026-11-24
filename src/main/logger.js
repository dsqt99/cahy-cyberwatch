// File logger for Electron main process.
const fs = require('fs');
const path = require('path');

function createLogger(userDataDir) {
  const logFile = path.join(userDataDir, 'app.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const writeLog = (line) => {
    logStream.write(`${new Date().toISOString()} ${line}\n`);
  };

  return { logFile, logStream, writeLog };
}

module.exports = { createLogger };
