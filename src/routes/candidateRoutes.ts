import { Router } from "express";
import * as assignmentCtrl from "../controllers/assignmentController";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth, requireRole("candidate", "admin", "creator"));

router.get("/assessments", asyncHandler(assignmentCtrl.getMyAssessments));

export default router;
