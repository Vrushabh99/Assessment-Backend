import mongoose from "mongoose";
import { connectDatabase } from "../config/db";
import { User } from "../models/User";

const seedUsers = [
  { firstName: "Aarav", lastName: "Sharma", email: "aarav.sharma@example.com", role: "candidate" },
  { firstName: "Priya", lastName: "Nair", email: "priya.nair@example.com", role: "candidate" },
  { firstName: "Rohan", lastName: "Patel", email: "rohan.patel@example.com", role: "candidate" },
  { firstName: "Meera", lastName: "Iyer", email: "meera.iyer@example.com", role: "candidate" },
  { firstName: "Kabir", lastName: "Singh", email: "kabir.singh@example.com", role: "candidate" },
  { firstName: "Ananya", lastName: "Reddy", email: "ananya.reddy@example.com", role: "candidate" },
  { firstName: "Vikram", lastName: "Joshi", email: "vikram.joshi@example.com", role: "candidate" },
  { firstName: "Neha", lastName: "Kapoor", email: "neha.kapoor@example.com", role: "candidate" },
  { firstName: "Dev", lastName: "Malhotra", email: "dev.malhotra@example.com", role: "candidate" },
  { firstName: "Sana", lastName: "Qureshi", email: "sana.qureshi@example.com", role: "candidate" },
  { firstName: "Admin", lastName: "User", email: "admin@proctoredassessment.com", role: "admin" }
];

const DEFAULT_PASSWORD = "assessment@19";

const seedDatabase = async (): Promise<void> => {
  try {
    await connectDatabase();

    for (const user of seedUsers) {
      const existingUser = await User.findOne({ email: user.email.toLowerCase() });

      if (existingUser) {
        existingUser.firstName = user.firstName;
        existingUser.lastName = user.lastName;
        existingUser.role = user.role;
        existingUser.password = DEFAULT_PASSWORD;
        await existingUser.save();
        console.log(`Updated user: ${user.email}`);
        continue;
      }

      await User.create({
        ...user,
        email: user.email.toLowerCase(),
        password: DEFAULT_PASSWORD
      });

      console.log(`Created user: ${user.email}`);
    }

    console.log(`Seed completed successfully. ${seedUsers.length} users processed.`);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

seedDatabase();
