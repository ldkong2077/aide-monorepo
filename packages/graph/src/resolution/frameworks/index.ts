/**
 * Framework Resolver Registry
 *
 * Manages framework-specific resolvers.
 */

import { type FrameworkResolver, type ResolutionContext } from '../types.js';
import type { Language } from '../../types.js';
import { drupalResolver } from './drupal.js';
import { laravelResolver } from './laravel.js';
import { expressResolver } from './express.js';
import { nestjsResolver } from './nestjs.js';
import { reactResolver } from './react.js';
import { svelteResolver } from './svelte.js';
import { vueResolver } from './vue.js';
import { djangoResolver, flaskResolver, fastapiResolver } from './python.js';
import { railsResolver } from './ruby.js';
import { springResolver } from './java.js';
import { goResolver } from './go.js';
import { rustResolver } from './rust.js';
import { aspnetResolver } from './csharp.js';
import { swiftUIResolver, uikitResolver, vaporResolver } from './swift.js';

/**
 * All registered framework resolvers
 */
const FRAMEWORK_RESOLVERS: FrameworkResolver[] = [
  // PHP
  laravelResolver,
  drupalResolver,
  // JavaScript/TypeScript
  expressResolver,
  nestjsResolver,
  reactResolver,
  svelteResolver,
  vueResolver,
  // Python
  djangoResolver,
  flaskResolver,
  fastapiResolver,
  // Ruby
  railsResolver,
  // Java
  springResolver,
  // Go
  goResolver,
  // Rust
  rustResolver,
  // C#
  aspnetResolver,
  // Swift
  swiftUIResolver,
  uikitResolver,
  vaporResolver,
];

/**
 * Get all framework resolvers
 */
export function getAllFrameworkResolvers(): FrameworkResolver[] {
  return FRAMEWORK_RESOLVERS;
}

/**
 * Get a resolver by name
 */
export function getFrameworkResolver(name: string): FrameworkResolver | undefined {
  return FRAMEWORK_RESOLVERS.find((r) => r.name === name);
}

/**
 * Detect which frameworks are used in a project
 */
export function detectFrameworks(context: ResolutionContext): FrameworkResolver[] {
  return FRAMEWORK_RESOLVERS.filter((resolver) => {
    try {
      return resolver.detect(context);
    } catch {
      return false;
    }
  });
}

/**
 * Filter a list of detected frameworks down to ones that apply to a given language.
 * Frameworks without an explicit `languages` list are treated as universal.
 */
export function getApplicableFrameworks(
  detected: FrameworkResolver[],
  language: Language,
): FrameworkResolver[] {
  return detected.filter((fw) => !fw.languages || fw.languages.includes(language));
}

/**
 * Register a custom framework resolver
 */
export function registerFrameworkResolver(resolver: FrameworkResolver): void {
  // Remove existing resolver with same name
  const index = FRAMEWORK_RESOLVERS.findIndex((r) => r.name === resolver.name);
  if (index !== -1) {
    FRAMEWORK_RESOLVERS.splice(index, 1);
  }
  FRAMEWORK_RESOLVERS.push(resolver);
}

// Re-export framework resolvers
export { drupalResolver } from './drupal.js';
export { laravelResolver, FACADE_MAPPINGS } from './laravel.js';
export { expressResolver } from './express.js';
export { nestjsResolver } from './nestjs.js';
export { reactResolver } from './react.js';
export { svelteResolver } from './svelte.js';
export { vueResolver } from './vue.js';
export { djangoResolver, flaskResolver, fastapiResolver } from './python.js';
export { railsResolver } from './ruby.js';
export { springResolver } from './java.js';
export { goResolver } from './go.js';
export { rustResolver } from './rust.js';
export { aspnetResolver } from './csharp.js';
export { swiftUIResolver, uikitResolver, vaporResolver } from './swift.js';
