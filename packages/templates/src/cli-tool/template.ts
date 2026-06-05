/**
 * AIDE Templates - CLI Tool Template
 * A command-line tool with Commander.js and TypeScript.
 */

import type { ProjectTemplate } from '../types.js';

export const cliToolTemplate: ProjectTemplate = {
  id: 'cli-tool',
  config: {
    name: 'CLI Tool',
    description: 'A command-line tool with Commander.js, TypeScript, and interactive prompts',
    category: 'cli',
    difficulty: 'beginner',
    techStack: ['Node.js', 'TypeScript', 'Commander.js', 'Inquirer.js'],
    features: [
      'Command-line argument parsing',
      'Interactive prompts',
      'Colored output',
      'Help system',
      'Version support',
      'File system operations',
      'Configuration management',
    ],
    estimatedTime: '2-3 hours',
    author: 'AIDE Team',
    version: '1.0.0',
  },
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "{{projectName}}",
  "version": "0.1.0",
  "description": "A command-line tool",
  "main": "dist/index.js",
  "bin": {
    "{{projectName}}": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint . --ext ts",
    "test": "vitest"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^11.1.0",
    "inquirer": "^9.2.12",
    "ora": "^7.0.1"
  },
  "devDependencies": {
    "@types/inquirer": "^9.0.7",
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.2.2",
    "vitest": "^1.1.0"
  }
}`,
      description: 'Package configuration with CLI dependencies',
      isRequired: true,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,
      description: 'TypeScript configuration',
      isRequired: true,
    },
    {
      path: 'src/index.ts',
      content: `#!/usr/bin/env node

import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import ora from 'ora'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const program = new Command()

program
  .name('{{projectName}}')
  .description('A command-line tool')
  .version(packageJson.version)

// Default command - interactive mode
program
  .action(async () => {
    console.log(chalk.blue.bold('\\nWelcome to {{projectName}}!\\n'))

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'What is your name?',
        default: 'User',
      },
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Create a new file', value: 'create' },
          { name: 'Read a file', value: 'read' },
          { name: 'List files', value: 'list' },
          { name: 'Exit', value: 'exit' },
        ],
      },
    ])

    if (answers.action === 'exit') {
      console.log(chalk.green('\\nGoodbye! 👋\\n'))
      return
    }

    const spinner = ora('Processing...').start()

    try {
      switch (answers.action) {
        case 'create':
          const createAnswers = await inquirer.prompt([
            {
              type: 'input',
              name: 'filename',
              message: 'Enter filename:',
            },
            {
              type: 'editor',
              name: 'content',
              message: 'Enter file content:',
            },
          ])
          
          writeFileSync(createAnswers.filename, createAnswers.content)
          spinner.succeed(chalk.green(\`File \${createAnswers.filename} created successfully!\`))
          break

        case 'read':
          const readAnswers = await inquirer.prompt([
            {
              type: 'input',
              name: 'filename',
              message: 'Enter filename to read:',
            },
          ])
          
          if (existsSync(readAnswers.filename)) {
            const content = readFileSync(readAnswers.filename, 'utf-8')
            spinner.succeed(chalk.green('File content:'))
            console.log(content)
          } else {
            spinner.fail(chalk.red('File not found!'))
          }
          break

        case 'list':
          const { readdirSync } = await import('fs')
          const files = readdirSync('.')
          spinner.succeed(chalk.green('Files in current directory:'))
          files.forEach(file => console.log(\`  - \${file}\`))
          break
      }
    } catch (error) {
      spinner.fail(chalk.red('An error occurred'))
      console.error(error)
    }
  })

// Subcommands
program
  .command('create <filename>')
  .description('Create a new file')
  .option('-c, --content <content>', 'File content', '')
  .action((filename: string, options: { content: string }) => {
    const spinner = ora('Creating file...').start()
    
    try {
      writeFileSync(filename, options.content)
      spinner.succeed(chalk.green(\`File \${filename} created successfully!\`))
    } catch (error) {
      spinner.fail(chalk.red('Failed to create file'))
      console.error(error)
    }
  })

program
  .command('read <filename>')
  .description('Read a file')
  .action((filename: string) => {
    const spinner = ora('Reading file...').start()
    
    try {
      if (existsSync(filename)) {
        const content = readFileSync(filename, 'utf-8')
        spinner.succeed(chalk.green('File content:'))
        console.log(content)
      } else {
        spinner.fail(chalk.red('File not found!'))
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to read file'))
      console.error(error)
    }
  })

program
  .command('list')
  .description('List files in current directory')
  .action(() => {
    const spinner = ora('Listing files...').start()
    
    try {
      const { readdirSync } = require('fs')
      const files = readdirSync('.')
      spinner.succeed(chalk.green('Files in current directory:'))
      files.forEach((file: string) => console.log(\`  - \${file}\`))
    } catch (error) {
      spinner.fail(chalk.red('Failed to list files'))
      console.error(error)
    }
  })

program.parse()`,
      description: 'Main CLI entry point with Commander.js',
      isRequired: true,
    },
    {
      path: 'README.md',
      content: `# {{projectName}}

A command-line tool built with Commander.js and TypeScript.

## Features

- Command-line argument parsing
- Interactive prompts
- Colored output
- Help system
- Version support

## Installation

### From npm

\`\`\`bash
npm install -g {{projectName}}
\`\`\`

### From source

\`\`\`bash
git clone https://github.com/yourusername/{{projectName}}.git
cd {{projectName}}
npm install
npm run build
npm link
\`\`\`

## Usage

### Interactive mode

\`\`\`bash
{{projectName}}
\`\`\`

This will start an interactive wizard that guides you through the available options.

### Direct commands

\`\`\`bash
# Create a new file
{{projectName}} create myfile.txt -c "Hello, World!"

# Read a file
{{projectName}} read myfile.txt

# List files
{{projectName}} list
\`\`\`

### Help

\`\`\`bash
{{projectName}} --help
{{projectName}} create --help
\`\`\`

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
npm run dev
\`\`\`

### Build

\`\`\`bash
npm run build
\`\`\`

### Testing

\`\`\`bash
npm test
\`\`\`

## Project Structure

\`\`\`
src/
├── index.ts           # Main CLI entry point
├── commands/          # Command implementations
├── utils/             # Utility functions
└── types/             # TypeScript types
\`\`\`

## License

MIT
`,
      description: 'Project documentation',
      isRequired: true,
    },
  ],
  dependencies: {
    chalk: '^5.3.0',
    commander: '^11.1.0',
    inquirer: '^9.2.12',
    ora: '^7.0.1',
  },
  devDependencies: {
    '@types/inquirer': '^9.0.7',
    '@types/node': '^20.10.0',
    tsx: '^4.7.0',
    typescript: '^5.2.2',
    vitest: '^1.1.0',
  },
  scripts: {
    dev: 'tsx src/index.ts',
    build: 'tsc',
    start: 'node dist/index.js',
    lint: 'eslint . --ext ts',
    test: 'vitest',
  },
  setupInstructions: [
    'Install dependencies: npm install',
    'Start development: npm run dev',
    'Build for production: npm run build',
    'Link globally: npm link',
  ],
  verificationSteps: [
    'npm run build completes without errors',
    'npm run dev starts successfully',
    'CLI help works: npm run dev -- --help',
    'Can create a file: npm run dev -- create test.txt',
    'Can read a file: npm run dev -- read test.txt',
    'Can list files: npm run dev -- list',
  ],
};
