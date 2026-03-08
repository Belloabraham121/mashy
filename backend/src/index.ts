import express from "express";
import cors from "cors";
import { config } from "./config/index.js";
import { connectDB } from "./lib/db.js";
import { loadLedger } from "./services/exposure.service.js";
import { authController } from "./controllers/auth.controller.js";
import { tradeController } from "./controllers/trade.controller.js";
import { predictionController } from "./controllers/prediction.controller.js";
import { perpsController } from "./controllers/perps.controller.js";
import { adminController } from "./controllers/admin.controller.js";
import { configController } from "./controllers/config.controller.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

if (config.exposureLedgerPath) {
  loadLedger(config.exposureLedgerPath);
  console.log("[Exposure] Ledger path:", config.exposureLedgerPath);
}

app.use("/api/auth", authController);
app.use("/api/trade", tradeController);
app.use("/api/prediction", predictionController);
app.use("/api/perps", perpsController);
app.use("/api/admin", adminController);
app.use("/api/config", configController);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "marshmallow-backend" });
});

app.listen(config.port, async () => {
  if (config.mongodb.uri) {
    try {
      await connectDB();
      console.log("[MongoDB] Connected");
    } catch (e) {
      console.warn("[MongoDB] Connect failed (auth/trade will fail):", e);
    }
  }
  const base = `http://localhost:${config.port}`;
  console.log("");
  console.log("========================================");
  console.log("  Marshmallow backend");
  console.log("========================================");
  console.log(`  URL:   ${base}`);
  console.log(`  Port:  ${config.port}`);
  console.log("  Routes:");
  console.log(`    GET  ${base}/health`);
  console.log(`    *    ${base}/api/auth/*`);
  console.log(`    *    ${base}/api/trade/*`);
  console.log(`    *    ${base}/api/prediction/*`);
  console.log(`    *    ${base}/api/perps/*`);
  console.log(`    *    ${base}/api/admin/* (mint when DEPLOYER_PRIVATE_KEY set)`);
  console.log(`    GET  ${base}/api/config`);
  console.log("========================================");
});
