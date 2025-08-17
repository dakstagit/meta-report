// app.js
const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { getToken, saveToken } = require("./storage");

const app = express();
const port = process.env.PORT || 3000;

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const token = getToken();
  if (token) {
    oAuth2Client.setCredentials(token);
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    console.log("Authorize this app by visiting this url:", authUrl);
    return;
  }

  return oAuth2Client;
}

async function uploadFile(auth) {
  const drive = google.drive({ version: "v3", auth });
  const fileMetadata = {
    name: "sample.txt",
  };
  const media = {
    mimeType: "text/plain",
    body: fs.createReadStream("sample.txt"),
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: "id",
  });

  console.log("File ID:", res.data.id);
}

app.get("/", async (req, res) => {
  const auth = await authorize();
  if (!auth) {
    return res.send("Auth URL logged to console.");
  }

  try {
    await uploadFile(auth);
    res.send("File uploaded to Google Drive");
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).send("Upload failed.");
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
