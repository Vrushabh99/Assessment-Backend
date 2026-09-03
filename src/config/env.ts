import dotenv from "dotenv";

dotenv.config();

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/proctored-assessment"),
  jwtSecret: required("JWT_SECRET", "development-only-secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:3000"
};
