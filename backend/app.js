console.log("App.js is starting...");

import express from "express";
import fs from "fs";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// Set up __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Path to the JSON file used to store the last report date
const STORAGE_FILE = path.join(__dirname, "storage.json");

// Helper to get the last saved report date from file
function getLastReportDate() {
  if (!fs.existsSync(STORAGE_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(STORAGE_FILE, "utf-8"));
    return data.lastReportDate || null;
  } catch (error) {
    console.error("Error reading storage file:", error);
    return null;
  }
}

// Helper to save the current date as last report generation
function saveReportDate() {
  const data = { lastReportDate: new Date().toISOString() };
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing to storage file:", error);
  }
}

// Endpoint to get the last report generation date
app.get("/last-report-date", (req, res) => {
  const date = getLastReportDate();
  res.json({ lastReportDate: date });
});

// Endpoint to generate a new report if 30 days have passed
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

  // TODO: Insert Meta API fetch logic here

  saveReportDate();
  res.json({
    message: "Report generated successfully",
    data: {
      // placeholder: Replace this with real data later
    },
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
