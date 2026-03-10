const fsp = require("fs/promises");
const path = require("path");

const DATA_PATH = path.join(__dirname, "../json/ticketPanelSettings.json");

async function loadTicketPanelSettings() {
  try {
    const raw = await fsp.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function saveTicketPanelSettings(settings) {
  await fsp.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fsp.writeFile(DATA_PATH, JSON.stringify(settings, null, 2), "utf8");
}

module.exports = {
  DATA_PATH,
  loadTicketPanelSettings,
  saveTicketPanelSettings,
};

