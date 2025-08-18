import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getAdAccounts } from "./meta.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/debug/ad-accounts", async (req, res) => {
  try {
    const data = await getAdAccounts();
    res.json(data);
  } catch (err) {
    const msg = err?.response?.data || err.message || "Unknown error";
    res.status(500).json({ error: msg });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
