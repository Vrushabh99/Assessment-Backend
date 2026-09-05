import { Router } from "express";
import * as assignmentCtrl from "../controllers/assignmentController";
import * as assessmentCtrl from "../controllers/assessmentController";
import * as candidateCtrl from "../controllers/candidateController";
import * as questionCtrl from "../controllers/questionController";
import * as submissionCtrl from "../controllers/submissionController";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth, requireRole("admin", "creator"));

// Candidates lookup
router.get("/candidates", asyncHandler(candidateCtrl.getCandidates));
router.post("/candidates", asyncHandler(candidateCtrl.createCandidate));
router.get("/candidates/:candidateId", asyncHandler(candidateCtrl.getCandidate));
router.patch("/candidates/:candidateId", asyncHandler(candidateCtrl.updateCandidate));
router.delete("/candidates/:candidateId", asyncHandler(candidateCtrl.deleteCandidate));

// Assignments
router.post("/assessments/:assessmentId/assign", asyncHandler(assignmentCtrl.assignAssessment));
router.patch("/assignments/:assignmentId", asyncHandler(assignmentCtrl.updateAssignment));
router.post("/assignments/:assignmentId/cancel", asyncHandler(assignmentCtrl.cancelAssignment));
router.delete("/assignments/:assignmentId", asyncHandler(assignmentCtrl.deleteAssignment));
router.get("/assignments", asyncHandler(assignmentCtrl.getAssignments));
router.get("/assignments/:assignmentId/candidates", asyncHandler(assignmentCtrl.getAssignmentCandidates));
router.get("/assignments/:assignmentId", asyncHandler(assignmentCtrl.getAssignmentDetail));

// Questions
router.post("/questions", asyncHandler(questionCtrl.createQuestion));
router.get("/questions", asyncHandler(questionCtrl.listQuestions));
router.get("/questions/:id", asyncHandler(questionCtrl.getQuestion));
router.patch("/questions/:id", asyncHandler(questionCtrl.updateQuestion));
router.delete("/questions/:id", asyncHandler(questionCtrl.deleteQuestion));

// Assessments
router.post("/assessments", asyncHandler(assessmentCtrl.createAssessment));
router.get("/assessments", asyncHandler(assessmentCtrl.listAssessments));
router.get("/assessments/:id", asyncHandler(assessmentCtrl.getAssessment));
router.patch("/assessments/:id", asyncHandler(assessmentCtrl.updateAssessment));
router.delete("/assessments/:id", asyncHandler(assessmentCtrl.deleteAssessment));
router.get("/assignments/:assignmentId/candidates/:candidateId/attempt",asyncHandler(submissionCtrl.getCandidateAttempt));
router.patch("/attempts/:attemptId/score",asyncHandler(submissionCtrl.updateAttemptScore));

export default router;
