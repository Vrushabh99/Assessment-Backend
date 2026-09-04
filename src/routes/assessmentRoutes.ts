import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import * as controller from "../controllers/assessmentController";

const router = Router();

router.use(requireAuth);
router.post("/", asyncHandler(controller.createAssessment));
router.get("/", asyncHandler(controller.listAssessments));
router.get("/:id", asyncHandler(controller.getAssessment));
router.patch("/:id", asyncHandler(controller.updateAssessment));
router.delete("/:id", asyncHandler(controller.deleteAssessment));

export default router;
