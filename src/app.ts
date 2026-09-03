import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";

const app = express();

app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.json({ success: true, message: "ok" });
});

export default app;
