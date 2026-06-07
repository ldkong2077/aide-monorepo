import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSession,
  getNextStep,
  generateQuestions,
  generateApproaches,
  generateDesign,
  selfReviewDesign,
  generatePlan,
  writeDesignDocument,
  writePlanDocument,
} from "./index.js";
import type { DesignDocument, PlanDocument, ProjectContext } from "./types.js";

const baseContext: ProjectContext = {
  rootPath: "/tmp/project",
  existingFiles: ["src/index.ts", "README.md"],
  techStack: ["react", "typescript"],
  hasTests: true,
  hasCi: true,
};

describe("Mind Module", () => {
  describe("createSession", () => {
    it("should create a brainstorm session", () => {
      const session = createSession("Build a todo app");

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.idea).toBe("Build a todo app");
      expect(session.currentStep).toBe("explore_context");
    });
  });

  describe("getNextStep", () => {
    it("should advance through the brainstorming steps", () => {
      expect(getNextStep("explore_context")).toBe("ask_questions");
      expect(getNextStep("self_review")).toBe("user_approval");
      expect(getNextStep("transition")).toBeNull();
    });
  });

  describe("generateQuestions", () => {
    it("should include tech-stack specific guidance when context exists", () => {
      const questions = generateQuestions("Build a todo app", baseContext);

      expect(questions).toHaveLength(6);
      expect(questions[2]?.id).toBe("tech_preference");
      expect(questions[2]?.question).toContain("react, typescript");
    });
  });

  describe("generateApproaches", () => {
    it("should prioritize a matching template for todo ideas", () => {
      const approaches = generateApproaches(
        "Build a todo app",
        baseContext,
        {},
      );

      expect(approaches[0]?.id).toBe("template_todo-app");
      expect(approaches[0]?.name).toContain("推荐模板");
      expect(approaches).toHaveLength(4);
    });
  });

  describe("generateDesign and selfReviewDesign", () => {
    it("should include discovered project context in the overview", () => {
      const selectedApproach = generateApproaches(
        "Build a todo app",
        baseContext,
        {},
      )[0]!;
      const design = generateDesign(
        "Build a todo app",
        baseContext,
        {
          purpose: "任务管理工具",
          audience: "开发者",
        },
        selectedApproach,
      );

      expect(design.projectName).toBe("任务管理工具");
      expect(design.sections[0]?.content).toContain("现有代码文件");
      expect(design.sections[0]?.content).toContain("已有测试");

      const review = selfReviewDesign(design);
      expect(review.score).toBeGreaterThanOrEqual(7);
      expect(review.issues).toHaveLength(0);
    });
  });

  describe("generatePlan", () => {
    it("should generate a plan from design document", () => {
      const design: DesignDocument = {
        projectName: "todo-app",
        idea: "Build a todo app",
        approaches: [],
        selectedApproach: "approach_1",
        sections: [],
        metadata: {
          createdAt: new Date().toISOString(),
          version: "1.0.0",
          status: "approved",
        },
      };

      const plan = generatePlan(design);

      expect(plan).toBeDefined();
      expect(plan.projectName).toBe("todo-app");
      expect(plan.tasks.length).toBeGreaterThan(0);
      expect(plan.tasks[0].title).toBeDefined();
      expect(plan.tasks[0].files).toBeDefined();
    });
  });

  describe("writeDesignDocument", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "aide-mind-test-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should write design document to disk", async () => {
      const design: DesignDocument = {
        projectName: "todo-app",
        idea: "Build a todo app",
        approaches: [],
        selectedApproach: "approach_1",
        sections: [],
        metadata: {
          createdAt: new Date().toISOString(),
          version: "1.0.0",
          status: "draft",
        },
      };

      const filePath = await writeDesignDocument(design, tmpDir);

      // Verify the file was actually created
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("# todo-app - 设计文档");
      expect(content).toContain("Build a todo app");
    });
  });

  describe("writePlanDocument", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "aide-mind-test-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should write plan document to disk", async () => {
      const plan: PlanDocument = {
        projectName: "todo-app",
        designRef: "/tmp/design.md",
        tasks: [
          {
            id: "task-1",
            title: "Setup project",
            description: "Initialize React project",
            files: ["package.json", "tsconfig.json"],
            dependencies: [],
            verification: ["npm run build"],
            estimatedTime: "30 min",
            priority: "high",
          },
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          totalEstimatedTime: "30 min",
          version: "1.0.0",
          status: "draft",
        },
      };

      const filePath = await writePlanDocument(plan, tmpDir);

      // Verify the file was actually created
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("# todo-app - 实施计划");
      expect(content).toContain("Setup project");
    });
  });
});
