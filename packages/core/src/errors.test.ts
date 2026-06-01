/**
 * AIDE Core - Error Hierarchy Tests
 */
import { describe, it, expect } from 'vitest';
import {
  AideError,
  ConfigError,
  GuardError,
  RouteError,
  GraphError,
  MindError,
} from './errors.js';

describe('AideError', () => {
  it('has correct properties', () => {
    const err = new AideError({
      message: 'test error',
      code: 'TEST_ERROR',
      recoverable: true,
      severity: 'warning',
      suggestion: 'Try doing X',
    });
    expect(err.message).toBe('test error');
    expect(err.code).toBe('TEST_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.severity).toBe('warning');
    expect(err.suggestion).toBe('Try doing X');
    expect(err.name).toBe('AideError');
  });

  it('has defaults for optional fields', () => {
    const err = new AideError({ message: 'test', code: 'TEST' });
    expect(err.recoverable).toBe(false);
    expect(err.severity).toBe('error');
    expect(err.context).toBeUndefined();
    expect(err.suggestion).toBeUndefined();
  });

  it('formats output with toFormattedString', () => {
    const err = new AideError({
      message: 'Something failed',
      code: 'ERR_001',
      suggestion: 'Check config',
      context: { file: 'test.ts' },
    });
    const output = err.toFormattedString();
    expect(output).toContain('[ERR_001]');
    expect(output).toContain('Something failed');
    expect(output).toContain('Hint: Check config');
    expect(output).toContain('Context:');
  });

  it('formats output without optional fields', () => {
    const err = new AideError({ message: 'Simple error', code: 'SIMPLE' });
    const output = err.toFormattedString();
    expect(output).toContain('[SIMPLE] Simple error');
    expect(output).not.toContain('Hint:');
    expect(output).not.toContain('Context:');
  });

  it('preserves cause error', () => {
    const cause = new Error('original error');
    const err = new AideError({ message: 'wrapper', code: 'WRAP', cause });
    expect(err.cause).toBe(cause);
  });
});

describe('ConfigError', () => {
  it('has correct code and name', () => {
    const err = new ConfigError('config failed');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.name).toBe('ConfigError');
    expect(err.recoverable).toBe(true);
  });

  it('notFound factory creates correct error', () => {
    const err = ConfigError.notFound('/path/to/config.yaml');
    expect(err.message).toContain('/path/to/config.yaml');
    expect(err.suggestion).toContain('aide init');
  });

  it('invalidField factory creates correct error', () => {
    const err = ConfigError.invalidField('port', 'must be a number');
    expect(err.message).toContain('port');
    expect(err.message).toContain('must be a number');
  });
});

describe('GuardError', () => {
  it('has correct code and name', () => {
    const err = new GuardError('guard failed');
    expect(err.code).toBe('GUARD_ERROR');
    expect(err.name).toBe('GuardError');
    expect(err.recoverable).toBe(false);
  });

  it('verificationFailed factory creates correct error', () => {
    const err = GuardError.verificationFailed('src/main.ts', 'hallucination detected');
    expect(err.message).toContain('src/main.ts');
    expect(err.message).toContain('hallucination detected');
    expect(err.suggestion).toContain('Review');
  });

  it('parseError factory creates correct error', () => {
    const cause = new SyntaxError('unexpected token');
    const err = GuardError.parseError('file.py', 'python', cause);
    expect(err.message).toContain('file.py');
    expect(err.message).toContain('python');
    expect(err.cause).toBe(cause);
  });
});

describe('RouteError', () => {
  it('has correct code and name', () => {
    const err = new RouteError('route failed');
    expect(err.code).toBe('ROUTE_ERROR');
    expect(err.name).toBe('RouteError');
    expect(err.recoverable).toBe(true);
  });

  it('providerUnavailable factory creates correct error', () => {
    const err = RouteError.providerUnavailable('openai');
    expect(err.message).toContain('openai');
    expect(err.suggestion).toContain('openai');
  });

  it('noRouteAvailable factory creates correct error', () => {
    const err = RouteError.noRouteAvailable('code_generation');
    expect(err.message).toContain('code_generation');
    expect(err.recoverable).toBe(false);
  });
});

describe('GraphError', () => {
  it('has correct code and name', () => {
    const err = new GraphError('graph failed');
    expect(err.code).toBe('GRAPH_ERROR');
    expect(err.name).toBe('GraphError');
    expect(err.recoverable).toBe(false);
  });

  it('notInitialized factory creates correct error', () => {
    const err = GraphError.notInitialized('/my/project');
    expect(err.message).toContain('/my/project');
    expect(err.recoverable).toBe(true);
  });

  it('unsupportedLanguage factory creates correct error', () => {
    const err = GraphError.unsupportedLanguage('brainfuck');
    expect(err.message).toContain('brainfuck');
    expect(err.recoverable).toBe(false);
  });
});

describe('MindError', () => {
  it('has correct code and name', () => {
    const err = new MindError('mind failed');
    expect(err.code).toBe('MIND_ERROR');
    expect(err.name).toBe('MindError');
    expect(err.recoverable).toBe(true);
  });

  it('modelNotConfigured factory creates correct error', () => {
    const err = MindError.modelNotConfigured('gpt-4o');
    expect(err.message).toContain('gpt-4o');
    expect(err.suggestion).toContain('gpt-4o');
  });
});

describe('Error inheritance', () => {
  it('all subclasses are instances of AideError', () => {
    const errors = [
      new ConfigError('test'),
      new GuardError('test'),
      new RouteError('test'),
      new GraphError('test'),
      new MindError('test'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(AideError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
