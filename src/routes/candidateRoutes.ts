import { Router } from "express";
import * as assignmentCtrl from "../controllers/assignmentController";
import * as attemptCtrl from "../controllers/attemptController";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth, requireRole("candidate", "admin", "creator"));

router.get("/assessments", asyncHandler(assignmentCtrl.getMyAssessments));
router.get("/assessments/:assessmentId/assignments/:assignmentId", asyncHandler(assignmentCtrl.getCandidateAssessment));
router.post("/assessments/:assessmentId/assignments/:assignmentId/start", asyncHandler(attemptCtrl.startAttempt));
router.get("/assessments/:assessmentId/assignments/:assignmentId/attempt", asyncHandler(attemptCtrl.getAttemptState));
router.patch("/assessments/:assessmentId/assignments/:assignmentId/answers", asyncHandler(attemptCtrl.saveAnswer));
router.post("/assessments/:assessmentId/assignments/:assignmentId/violations", asyncHandler(attemptCtrl.logViolation));
router.post("/assessments/:assessmentId/assignments/:assignmentId/submit", asyncHandler(attemptCtrl.submitAttempt));

export default router;
