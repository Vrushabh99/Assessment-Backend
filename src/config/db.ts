import mongoose from "mongoose";
import { env } from "./env";

export const connectDatabase = async (): Promise<void> => {
  const db = mongoose.connection;
  db.on('error', error => console.error('MongoDB connection error: ', error));
  db.on('connected', () => {
    console.log('MongoDB connected');
  });
  db.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });
  db.on("reconnected", () => {
    console.log("MongoDB reconnected");
  });

  try {
    await mongoose.connect(env.mongoUri);
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Error connecting Database: ', error);
  }
};
