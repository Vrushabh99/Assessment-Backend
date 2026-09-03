import mongoose from "mongoose";
import { env } from "./env";

export const connectDatabase = async (): Promise<void> => {
  mongoose.connect(env.mongoUri)
  .then(() => console.log('Database connected successfully'))
  .catch(err => console.error('Database connection error', err));

  const db = mongoose.connection;
  db.on('error', console.error.bind(console, 'MongoDB connection error:'));
  db.once('open', () => {
    console.log('Connected to MongoDB');
  });
};
