import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import {
  createFlow,
  getNextStep,
  calculateProgress,
  generateReport,
  saveFlowState,
  loadFlowState,
  listFlowStates,
} from "./index.js";
import type { FlowConfig, TaskResult } from "./types.js";

const baseConfig: FlowConfig = {
  projectName: "test-project",
  idea: "Build a todo app",
  outputDir: "/tmp/output",
  autoVerify: true,
  continueOnError: false,
  maxRetries: 2,
};

let outputDir: string;

describe("Flow Module", () => {
  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "aide-flow-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  describe("createFlow", () => {
    it("should create a flow state", () => {
      const state = createFlow({ ...baseConfig, outputDir });

      expect(state).toBeDefined();
      expect(state.id).toBeDefined();
      expect(state.config.projectName).toBe("test-project");
      expect(state.status).toBe("pending");
    });
  });

  describe("getNextStep", () => {
    it("should advance through the flow in order", () => {
      expect(getNextStep("init")).toBe("design");
      expect(getNextStep("design")).toBe("plan");
      expect(getNextStep("report")).toBeNull();
    });
  });

  describe("calculateProgress", () => {
    it("should calculate progress from state and task results", () => {
      const state = createFlow({ ...baseConfig, outputDir });
      const taskResults: TaskResult[] = [
        {
          taskId: "1",
          status: "completed",
          startedAt: "2025-01-01T00:00:00.000Z",
          completedAt: "2025-01-01T00:01:00.000Z",
        },
        {
          taskId: "2",
          status: "completed",
          startedAt: "2025-01-01T00:01:00.000Z",
          completedAt: "2025-01-01T00:02:00.000Z",
        },
        {
          taskId: "3",
          status: "running",
          startedAt: "2025-01-01T00:02:00.000Z",
        },
      ];

      const progress = calculateProgress(state, taskResults);

      expect(progress).toBeDefined();
      expect(progress.totalTasks).toBe(3);
      expect(progress.completedTasks).toBe(2);
      expect(progress.currentTask).toBe("3");
      expect(progress.percentage).toBe(67);
      expect(progress.estimatedTimeRemaining).toBe("1 minutes");
    });
  });

  describe("generateReport", () => {
    it("should include recommendations for failed and rejected tasks", () => {
      const state = {
        ...createFlow({ ...baseConfig, outputDir }),
        status: "failed" as const,
        startedAt: "2025-01-01T00:00:00.000Z",
        completedAt: "2025-01-01T00:03:00.000Z",
      };
      const taskResults: TaskResult[] = [
        {
          taskId: "lint",
          status: "failed",
          error: "lint failed",
          startedAt: "2025-01-01T00:00:00.000Z",
          completedAt: "2025-01-01T00:01:00.000Z",
          verificationResult: {
            verdict: "REJECT",
            confidence: 0.2,
            issues: ["missing tests"],
            suggestions: [],
          },
        },
      ];

      const report = generateReport(state, taskResults);

      expect(report.summary).toContain("Status: failed");
      expect(report.duration).toBe("3m 0s");
      expect(report.recommendations).toContain(
        "Review and fix failed tasks before proceeding",
      );
      expect(report.recommendations).toContain("Address verification issues");
    });
  });

  describe("saveFlowState and loadFlowState", () => {
    it("should save and load flow state", async () => {
      const state = createFlow({ ...baseConfig, outputDir });
      await saveFlowState(state);

      const loaded = await loadFlowState(state.id, outputDir);
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(state.id);
    });
  });

  describe("listFlowStates", () => {
    it("should list all flow states", async () => {
      const earlier = {
        ...createFlow({ ...baseConfig, outputDir }),
        id: "flow-earlier",
        startedAt: "2025-01-01T00:00:00.000Z",
      };
      const later = {
        ...createFlow({ ...baseConfig, outputDir }),
        id: "flow-later",
        startedAt: "2025-01-01T00:05:00.000Z",
      };

      await saveFlowState(earlier);
      await saveFlowState(later);

      const flows = await listFlowStates(outputDir);
      expect(flows).toHaveLength(2);
      expect(flows[0]?.id).toBe("flow-later");
      expect(flows[1]?.id).toBe("flow-earlier");
    });
  });
});
