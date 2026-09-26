// services/aiQuestionService.ts
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { diff } from "node:util";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const questionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            enum: ["single-choice", "multiple-choice", "short-answer"]  // Use underscores, not hyphens
          },
          questionText: { 
            type: SchemaType.STRING 
          },
          additionalInfo: {
            type: SchemaType.OBJECT,
            properties: {
              options: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: "Array of answer options (for single-choice and multiple-choice)"
              },
              correctAnswers: {  // ✅ Fixed typo (was correctAnswerss)
                type: SchemaType.ARRAY,
                items: { type: SchemaType.NUMBER },
                description: "For single-choice/multiple-choice: array of index numbers (e.g., [0, 2]). For short-answer: empty array."
              },
              expectedAnswer: { 
                type: SchemaType.STRING,
                description: "For short-answer: the expected answer text. For choice types: empty string."
              }
            },
            required: ["options", "correctAnswers", "expectedAnswer"]  // ✅ Correct placement
          }
        },
        required: ["type", "questionText", "additionalInfo"]  // ✅ Correct placement
      }
    }
  },
  required: ["questions"]  // ✅ Correct placement
} as any;

export class AIQuestionService {
        async generateQuestions(
            topic: string,
            count: number,
            difficulty: string
        ) {
            
            const systemPrompt = `Generate assessment questions.
                - single-choice/multiple-choice: correctAnswers = index numbers [0, 2]
                - short-answer: correctAnswers = []
                Mix types evenly. Make questions clear and distractors believable.`;

            const userPrompt = `Generate ${count} ${difficulty} questions referring to "${topic}". Mix all 3 types.`;

            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: questionSchema,
                    maxOutputTokens: 3000,
                    temperature: 0.7
                }
            });

            try {
                const result = await model.generateContent([
                    { text: systemPrompt },
                    { text: userPrompt }
                ]);

                const rawText = result.response.text();
                const parsed = JSON.parse(rawText);

                return parsed.questions;
            } catch (error) {
                console.error("Gemini error:", error);
                throw new Error("Failed to generate questions from Gemini");
            }
        }
}

export const aiQuestionService = new AIQuestionService();