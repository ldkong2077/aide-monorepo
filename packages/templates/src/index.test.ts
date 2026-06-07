import { describe, it, expect } from "vitest";
import {
  templates,
  getTemplate,
  listTemplateIds,
  getTemplatesByCategory,
  getTemplatesByDifficulty,
  replaceTemplateVars,
} from "./index.js";

describe("Templates", () => {
  describe("templates registry", () => {
    it("should have 5 templates", () => {
      expect(Object.keys(templates)).toHaveLength(5);
    });

    it("should have todo-app template", () => {
      expect(templates["todo-app"]).toBeDefined();
      expect(templates["todo-app"].config.name).toBe("TODO Application");
    });

    it("should have api-server template", () => {
      expect(templates["api-server"]).toBeDefined();
      expect(templates["api-server"].config.name).toBe("API Server");
    });

    it("should have cli-tool template", () => {
      expect(templates["cli-tool"]).toBeDefined();
      expect(templates["cli-tool"].config.name).toBe("CLI Tool");
    });

    it("should have nextjs-app template", () => {
      expect(templates["nextjs-app"]).toBeDefined();
      expect(templates["nextjs-app"].config.name).toBe(
        "Next.js Full-Stack App",
      );
      expect(templates["nextjs-app"].config.category).toBe("fullstack");
    });

    it("should have fastapi-app template", () => {
      expect(templates["fastapi-app"]).toBeDefined();
      expect(templates["fastapi-app"].config.name).toBe("FastAPI Application");
      expect(templates["fastapi-app"].config.category).toBe("api");
    });
  });

  describe("getTemplate", () => {
    it("should return template by id", () => {
      const template = getTemplate("todo-app");
      expect(template).toBeDefined();
    });

    it("should return undefined for unknown id", () => {
      const template = getTemplate("unknown");
      expect(template).toBeUndefined();
    });
  });

  describe("listTemplateIds", () => {
    it("should return all template ids", () => {
      const ids = listTemplateIds();
      expect(ids).toContain("todo-app");
      expect(ids).toContain("api-server");
      expect(ids).toContain("cli-tool");
      expect(ids).toContain("nextjs-app");
      expect(ids).toContain("fastapi-app");
    });
  });

  describe("getTemplatesByCategory", () => {
    it("should return web templates", () => {
      const webTemplates = getTemplatesByCategory("web");
      expect(webTemplates.length).toBeGreaterThan(0);
      webTemplates.forEach((t) => {
        expect(t.config.category).toBe("web");
      });
    });

    it("should return api templates", () => {
      const apiTemplates = getTemplatesByCategory("api");
      expect(apiTemplates.length).toBeGreaterThan(0);
      apiTemplates.forEach((t) => {
        expect(t.config.category).toBe("api");
      });
    });

    it("should return cli templates", () => {
      const cliTemplates = getTemplatesByCategory("cli");
      expect(cliTemplates.length).toBeGreaterThan(0);
      cliTemplates.forEach((t) => {
        expect(t.config.category).toBe("cli");
      });
    });

    it("should return fullstack templates", () => {
      const fullstackTemplates = getTemplatesByCategory("fullstack");
      expect(fullstackTemplates.length).toBeGreaterThan(0);
      fullstackTemplates.forEach((t) => {
        expect(t.config.category).toBe("fullstack");
      });
    });
  });

  describe("getTemplatesByDifficulty", () => {
    it("should return beginner templates", () => {
      const beginnerTemplates = getTemplatesByDifficulty("beginner");
      expect(beginnerTemplates.length).toBeGreaterThan(0);
      beginnerTemplates.forEach((t) => {
        expect(t.config.difficulty).toBe("beginner");
      });
    });

    it("should return intermediate templates", () => {
      const intermediateTemplates = getTemplatesByDifficulty("intermediate");
      expect(intermediateTemplates.length).toBeGreaterThan(0);
      intermediateTemplates.forEach((t) => {
        expect(t.config.difficulty).toBe("intermediate");
      });
    });
  });

  describe("replaceTemplateVars", () => {
    it("should replace variables in content", () => {
      const content = "Hello {{projectName}}, created by {{author}}";
      const vars = { projectName: "MyApp", author: "John" };
      const result = replaceTemplateVars(content, vars);
      expect(result).toBe("Hello MyApp, created by John");
    });

    it("should handle multiple replacements", () => {
      const content = "{{a}} and {{b}} and {{a}} again";
      const vars = { a: "first", b: "second" };
      const result = replaceTemplateVars(content, vars);
      expect(result).toBe("first and second and first again");
    });

    it("should leave unmatched variables as-is", () => {
      const content = "Hello {{name}}, your {{unknown}} is ready";
      const vars = { name: "John" };
      const result = replaceTemplateVars(content, vars);
      expect(result).toBe("Hello John, your {{unknown}} is ready");
    });
  });
});
