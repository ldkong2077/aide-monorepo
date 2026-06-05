import { describe, it, expect } from 'vitest';
import {
  createFlow,
  calculateProgress,
  generateReport,
  saveFlowState,
  loadFlowState,
  listFlowStates,
} from './index.js';
import type { FlowConfig, FlowOptions } from './types.js';

describe('Flow Module', () => {
  describe('createFlow', () => {
    it('should create a flow state', async () => {
      const config: FlowConfig = {
        projectName: 'test-project',
        idea: 'Build a todo app',
        designPath: '/tmp/design.md',
        planPath: '/tmp/plan.md',
        outputDir: '/tmp/output',
      };

      const options: FlowOptions = {
        autoVerify: true,
        parallelExecution: false,
      };

      const state = await createFlow(config, options);

      expect(state).toBeDefined();
      expect(state.id).toBeDefined();
      expect(state.config.projectName).toBe('test-project');
      expect(state.status).toBe('pending');
    });
  });

  describe('calculateProgress', () => {
    it('should calculate progress from state and task results', async () => {
      const config: FlowConfig = {
        projectName: 'test-project',
        idea: 'Build a todo app',
        designPath: '/tmp/design.md',
        planPath: '/tmp/plan.md',
        outputDir: '/tmp/output',
      };

      const options: FlowOptions = {
        autoVerify: true,
        parallelExecution: false,
      };

      const state = await createFlow(config, options);
      const taskResults = [
        { id: '1', status: 'completed', files: [], duration: 100, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        { id: '2', status: 'completed', files: [], duration: 100, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        { id: '3', status: 'pending', files: [], duration: 0 },
      ];

      const progress = calculateProgress(state, taskResults);

      expect(progress).toBeDefined();
      expect(progress.totalTasks).toBe(3);
      expect(progress.completedTasks).toBe(2);
      expect(progress.percentage).toBeGreaterThan(0);
    });
  });

  describe('saveFlowState and loadFlowState', () => {
    it('should save and load flow state', async () => {
      const config: FlowConfig = {
        projectName: 'test-project',
        idea: 'Build a todo app',
        designPath: '/tmp/design.md',
        planPath: '/tmp/plan.md',
        outputDir: '/tmp/output',
      };

      const options: FlowOptions = {
        autoVerify: true,
        parallelExecution: false,
      };

      const state = await createFlow(config, options);
      await saveFlowState(state, '/tmp/output');

      const loaded = await loadFlowState(state.id, '/tmp/output');
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(state.id);
    });
  });

  describe('listFlowStates', () => {
    it('should list all flow states', async () => {
      const flows = await listFlowStates('/tmp/output');
      expect(flows).toBeDefined();
      expect(Array.isArray(flows)).toBe(true);
    });
  });
});
