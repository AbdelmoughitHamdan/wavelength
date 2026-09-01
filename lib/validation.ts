import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72)
});
export const signUpSchema = authCredentialsSchema.extend({
  displayName: z.string().trim().min(2).max(24)
});
export const choiceSchema = z.object({ questionId: z.string().uuid(), optionId: z.string().uuid() });
export const predictionsSchema = z.object({ predictions: z.array(choiceSchema).length(3) });
export const answersSchema = z.object({ answers: z.array(choiceSchema).length(3) });

export const generatedQuestionSchema = z.object({
  questions: z.array(z.object({
    prompt: z.string().trim().min(8).max(240),
    options: z.array(z.string().trim().min(1).max(100)).length(4)
  })).length(3)
});
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>["questions"][number];

const distinctOptions = (options: string[]) =>
  new Set(options.map((option) => option.trim().toLocaleLowerCase())).size === options.length;

export const adminQuestionSchema = z.object({
  prompt: z.string().trim().min(8).max(240),
  options: z.array(z.string().trim().min(1).max(100)).length(4).refine(distinctOptions, "Options must be distinct."),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(280).optional()
});

export const adminQuestionsSchema = z.object({
  questions: z.array(adminQuestionSchema).length(3)
}).superRefine(({ questions }, ctx) => {
  const prompts = questions.map((question) => question.prompt.trim().toLocaleLowerCase());
  if (new Set(prompts).size !== prompts.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["questions"], message: "Questions must be distinct." });
  }
});
export type AdminQuestion = z.infer<typeof adminQuestionSchema>;

export const adminGenerationRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(1000),
  context: z.string().trim().max(500).optional(),
  preset: z.enum(["Funny", "Difficult", "Best Friends", "Couples", "Random", "Chaotic", "Personal", "Deep"]).optional()
});

export const adminRegenerationRequestSchema = adminGenerationRequestSchema.extend({
  questionIndex: z.number().int().min(0).max(2),
  currentQuestions: z.array(adminQuestionSchema).length(3)
});
