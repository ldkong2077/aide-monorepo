import { describe, it, expect } from "vitest";
import { createDashboardAPI } from "./index.js";
import type { DashboardFilter } from "./types.js";

describe("Dashboard Module", () => {
  describe("DashboardAPI", () => {
    it("should create dashboard API", async () => {
      const api = createDashboardAPI("/tmp");

      expect(api).toBeDefined();
      expect(typeof api.getData).toBe("function");
      expect(typeof api.getSummary).toBe("function");
      expect(typeof api.formatConsoleOutput).toBe("function");
      expect(typeof api.formatJsonOutput).toBe("function");
      expect(typeof api.formatMarkdownOutput).toBe("function");
    });

    it("should get dashboard data", async () => {
      const api = createDashboardAPI("/tmp");
      const data = await api.getData();

      expect(data).toBeDefined();
      expect(data.summary).toBeDefined();
      expect(data.flows).toBeDefined();
      expect(data.lastUpdated).toBeDefined();
    });

    it("should filter by status", async () => {
      const api = createDashboardAPI("/tmp");
      const filter: DashboardFilter = {
        status: ["running", "completed"],
      };

      const data = await api.getData(filter);

      expect(data).toBeDefined();
      expect(data.flows).toBeDefined();
    });

    it("should filter by project name", async () => {
      const api = createDashboardAPI("/tmp");
      const filter: DashboardFilter = {
        projectName: "test-project",
      };

      const data = await api.getData(filter);

      expect(data).toBeDefined();
      expect(data.flows).toBeDefined();
    });

    it("should get dashboard summary", async () => {
      const api = createDashboardAPI("/tmp");
      const summary = await api.getSummary();

      expect(summary).toBeDefined();
      expect(summary.totalFlows).toBeDefined();
      expect(summary.activeFlows).toBeDefined();
      expect(summary.completedFlows).toBeDefined();
      expect(summary.failedFlows).toBeDefined();
      expect(summary.totalTasks).toBeDefined();
      expect(summary.completedTasks).toBeDefined();
      expect(summary.failedTasks).toBeDefined();
    });

    it("should format dashboard as console output", async () => {
      const api = createDashboardAPI("/tmp");
      const data = await api.getData();
      const output = api.formatConsoleOutput(data);

      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);
    });

    it("should format dashboard as JSON", async () => {
      const api = createDashboardAPI("/tmp");
      const data = await api.getData();
      const output = api.formatJsonOutput(data);

      expect(typeof output).toBe("string");
      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it("should format dashboard as Markdown", async () => {
      const api = createDashboardAPI("/tmp");
      const data = await api.getData();
      const output = api.formatMarkdownOutput(data);

      expect(typeof output).toBe("string");
      expect(output).toContain("# AIDE Dashboard");
      expect(output).toContain("## Summary");
    });
  });
});
