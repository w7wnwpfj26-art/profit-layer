/**
 * 本地持久化存储：设置在 app.getPath('userData') 下，应用更新不会清除
 * 用于：Dashboard 地址、窗口大小、本地账户等
 */
const fs = require("fs");
const path = require("path");

const FILENAME = "settings.json";

function getPath(userDataPath) {
  return path.join(userDataPath, FILENAME);
}

function load(userDataPath) {
  const filePath = getPath(userDataPath);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function save(userDataPath, data) {
  const filePath = getPath(userDataPath);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("store save error:", err);
  }
}

module.exports = { load, save, getPath };
