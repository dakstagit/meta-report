console.log("App.js is starting...");

const express = require("express");
const fs = require("fs");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const STORAGE_FILE = __dirname + "/storage.json";

// Helper to read the last report date
function getLastReportDate() {
  if (!fs.existsSync(STORAGE_FILE)) return null;
  const data = JSON.parse(fs.readFileSync(STORAGE_FILE, "utf-8"));
  return data.lastReportDate || null;
}

// Helper to save the current date
function saveReportDate() {
  const data = { lastReportDate: new Date().toISOString() };
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
}

// GET /last-report-date
app.get("/last-report-date", (req, res) => {
  const date = getLastReportDate();
  res.json({ lastReportDate: date });
});

// POST /generate-report
app.post("/generate-report", (req, res) => {
  const now = new Date();
  const lastDateStr = getLastReportDate();
  if (lastDateStr) {
    const lastDate = new Date(lastDateStr);
    const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
    if (diffDays < 30) {
      return res.status(400).json({
        error: `Report already generated. Try again in ${Math.ceil(30 - diffDays)} days.`,
      });
    }
  }

  // TODO: Add Meta API fetch logic here later

  saveReportDate();
  res.json({ message: "Report generated successfully", data: { /* placeholder */ } });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

