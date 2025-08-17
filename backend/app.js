import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Resolve paths
const __dirname = path.resolve();
const META_FILE = path.join(__dirname, "backend", "meta.js");
const STORAGE_FILE = path.join(__dirname, "backend", "storage.json");

// Load meta data
let metaData = {};
try {
  metaData = (await import(`file://${META_FILE}`)).default;
} catch (err) {
  console.error("Failed to load meta.js:", err);
  metaData = {};
}

// Load stored brands
function loadStoredBrands() {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Save brands to storage.json
function saveStoredBrands(brands) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(brands, null, 2), "utf-8");
}

// Endpoint to get combined data
app.get("/api/brands", (req, res) => {
  const storedBrands = loadStoredBrands();
  const combined = [...storedBrands, ...metaData];
  res.json(combined);
});

// Endpoint to submit new brands
app.post("/api/brands", (req, res) => {
  const { name, country, start_date, url } = req.body;
  if (!name || !country || !start_date || !url) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const newBrand = { name, country, start_date, url };
  const storedBrands = loadStoredBrands();
  storedBrands.push(newBrand);
  saveStoredBrands(storedBrands);

  res.status(200).json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
