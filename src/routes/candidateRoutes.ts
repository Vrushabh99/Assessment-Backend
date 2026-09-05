import { Router } from "express";
import * as assignmentCtrl from "../controllers/assignmentController";
import * as attemptCtrl from "../controllers/attemptController";
import * as submissionCtrl from "../controllers/submissionController";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth, requireRole("candidate", "admin", "creator"));

router.get("/assessments", asyncHandler(assignmentCtrl.getMyAssessments));
router.get("/assignments/:assignmentId", asyncHandler(assignmentCtrl.getCandidateAssessment));
router.post("/assignments/:assignmentId/start", asyncHandler(attemptCtrl.startAttempt));
router.get("/assignments/:assignmentId/attempt", asyncHandler(attemptCtrl.getAttemptState));
router.patch("/assignments/:assignmentId/answers", asyncHandler(attemptCtrl.saveAnswer));
router.post("/assignments/:assignmentId/violations", asyncHandler(attemptCtrl.logViolation));
router.post("/assignments/:assignmentId/submit", asyncHandler(attemptCtrl.submitAttempt));
router.get("/assignments/:assignmentId/candidate/:candidateId/attempt",asyncHandler(submissionCtrl.getCandidateAttempt));


export default router;
