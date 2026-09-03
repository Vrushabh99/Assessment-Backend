import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";
import * as controller from "../controllers/authController";

const router = Router();

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));
router.post("/logout", asyncHandler(controller.logout));
router.get("/me", requireAuth, asyncHandler(controller.me));

export default router;
