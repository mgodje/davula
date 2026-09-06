import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();

const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const logsDirectory = path.join(process.cwd(), "logs");

if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory);
}

app.post("/log", (req, res) => {
  try {
    const log = req.body;

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

    const filename = `davula-session-${timestamp}.json`;

    const filePath = path.join(
      logsDirectory,
      filename
    );

    fs.writeFileSync(
      filePath,
      JSON.stringify(log, null, 2)
    );

    console.log(
      `Saved VR log: ${filePath}`
    );

    res.json({
      success: true,
      filename
    });

  } catch (error) {
    console.error(
      "Could not save log:",
      error
    );

    res.status(500).json({
      success: false
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Davula log server running on port ${PORT}`
  );

  console.log(
    `Logs will be saved in: ${logsDirectory}`
  );
});