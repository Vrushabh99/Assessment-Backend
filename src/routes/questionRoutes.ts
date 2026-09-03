import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import * as controller from "../controllers/questionController";

const router = Router();

router.use(requireAuth);
router.post("/", asyncHandler(controller.createQuestion));
router.get("/", asyncHandler(controller.listQuestions));
router.get("/:id", asyncHandler(controller.getQuestion));
router.patch("/:id", asyncHandler(controller.updateQuestion));
router.delete("/:id", asyncHandler(controller.deleteQuestion));

export default router;
