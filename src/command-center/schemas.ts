import { z } from "zod";

export const updateTaskSchema = z.object({
  status: z.enum(["todo", "in-progress", "review", "done"]).optional(),
  assignee: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().optional(),
  // Human-operator override for the review-flow gate (VAL-017). The console is a
  // human surface with no reviewer @ide_role, so marking a task done requires this
  // explicit flag; it logs an `override` event. Agents/CLI never set it.
  override: z.boolean().optional(),
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

// Create-a-plan: kebab-case name only. The regex rejects empty, whitespace,
// uppercase, dots and slashes — so path traversal (".." / "/") can never form a
// valid name. `.md` is appended server-side.
export const createPlanSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "name must be kebab-case (a-z, 0-9, hyphens)"),
});

export const saveContractSchema = z.object({
  content: z.string(),
});

// Mission kill-switch. `confirm` must equal the mission title (the type-the-name
// gate is enforced server-side too, not just in the dialog) so a stray API call
// can't wipe the tracker.
export const missionWipeSchema = z.object({
  confirm: z.string(),
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

// Owner action-item toggle: the console checkbox sets the item's done state
// in the owning workspace's store.
export const toggleTodoSchema = z.object({
  done: z.boolean(),
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
