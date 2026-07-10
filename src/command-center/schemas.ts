import { z } from "zod";

export const updateTaskSchema = z.object({
  status: z.enum(["todo", "in-progress", "review", "done"]).optional(),
  assignee: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.number().optional(),
  goal: z.string().optional(),
  tags: z.array(z.string()).optional(),
  // Create-only-persisted fields: the store honors these only at create time
  // (`task edit` does not re-apply them), so the kanban modal must set them here.
  assignee: z.string().optional(),
  specialty: z.string().optional(),
  milestone: z.string().optional(),
  fulfills: z.array(z.string()).optional(),
  depends: z.array(z.string()).optional(),
});

export const savePlanSchema = z.object({
  content: z.string(),
});

export const saveContractSchema = z.object({
  content: z.string(),
});

export const sendCommandSchema = z.object({
  target: z.string().min(1, "Target pane is required"),
  message: z.string().min(1, "Message is required"),
  noEnter: z.boolean().optional(),
  // Skip the reliable-send receipt path: paste once, don't track an ack.
  fireAndForget: z.boolean().optional(),
});

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  sequence: z.number().int().positive(),
  description: z.string().optional(),
});

export const updateMilestoneSchema = z.object({
  status: z.enum(["locked", "active", "done", "validating"]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

// Insert a milestone at a 1-based position, renumbering the rest so the set stays
// contiguous 1..N (M{n} ids reassigned, task.milestone refs cascaded).
export const insertMilestoneSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional(),
  position: z.number().int().positive(),
});

export const updateAssertionSchema = z.object({
  status: z.enum(["pending", "passing", "failing", "blocked"]),
  evidence: z.string().optional(),
  verifiedBy: z.string().optional(),
});

export const triggerResearchSchema = z.object({
  type: z.string().trim().min(1, "Research type is required"),
});

export const launchSchema = z
  .object({
    attach: z.boolean().optional(),
  })
  .optional();

export const stopSchema = z.object({}).optional();
