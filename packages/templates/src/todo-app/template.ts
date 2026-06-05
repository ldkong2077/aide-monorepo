/**
 * AIDE Templates - TODO App Template
 * A simple TODO application with React and TypeScript.
 */

import type { ProjectTemplate } from '../types.js';

export const todoAppTemplate: ProjectTemplate = {
  id: 'todo-app',
  config: {
    name: 'TODO Application',
    description: 'A simple TODO application with React, TypeScript, and localStorage persistence',
    category: 'web',
    difficulty: 'beginner',
    techStack: ['React', 'TypeScript', 'Vite', 'Tailwind CSS'],
    features: [
      'Add, edit, delete todos',
      'Mark todos as complete',
      'Filter by status (all, active, completed)',
      'LocalStorage persistence',
      'Responsive design',
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
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.2.2",
    "vite": "^5.0.8"
  }
}`,
      description: 'Package configuration with React, TypeScript, and Vite',
      isRequired: true,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`,
      description: 'TypeScript configuration for React',
      isRequired: true,
    },
    {
      path: 'vite.config.ts',
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})`,
      description: 'Vite configuration',
      isRequired: true,
    },
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{projectName}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      description: 'HTML entry point',
      isRequired: true,
    },
    {
      path: 'src/main.tsx',
      content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
      description: 'React entry point',
      isRequired: true,
    },
    {
      path: 'src/App.tsx',
      content: `import { useState, useEffect } from 'react'

interface Todo {
  id: number
  text: string
  completed: boolean
}

function App() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('todos')
    return saved ? JSON.parse(saved) : []
  })
  const [input, setInput] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos))
  }, [todos])

  const addTodo = () => {
    if (input.trim()) {
      setTodos([...todos, { id: Date.now(), text: input.trim(), completed: false }])
      setInput('')
    }
  }

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ))
  }

  const deleteTodo = (id: number) => {
    setTodos(todos.filter(todo => todo.id !== id))
  }

  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed
    if (filter === 'completed') return todo.completed
    return true
  })

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center mb-6">TODO App</h1>
        
        <div className="flex mb-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTodo()}
            placeholder="Add a new todo..."
            className="flex-1 border rounded-l-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addTodo}
            className="bg-blue-500 text-white px-4 py-2 rounded-r-lg hover:bg-blue-600"
          >
            Add
          </button>
        </div>

        <div className="flex justify-center gap-2 mb-4">
          {(['all', 'active', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={\`px-3 py-1 rounded \${
                filter === f ? 'bg-blue-500 text-white' : 'bg-gray-200'
              }\`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {filteredTodos.map(todo => (
            <li key={todo.id} className="flex items-center gap-2 p-2 border rounded">
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
                className="h-4 w-4"
              />
              <span className={\`flex-1 \${todo.completed ? 'line-through text-gray-500' : ''}\`}>
                {todo.text}
              </span>
              <button
                onClick={() => deleteTodo(todo.id)}
                className="text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        {todos.length === 0 && (
          <p className="text-center text-gray-500 mt-4">No todos yet. Add one above!</p>
        )}
      </div>
    </div>
  )
}

export default App`,
      description: 'Main App component with TODO functionality',
      isRequired: true,
    },
    {
      path: 'src/index.css',
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;`,
      description: 'Tailwind CSS imports',
      isRequired: true,
    },
    {
      path: 'tailwind.config.js',
      content: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`,
      description: 'Tailwind CSS configuration',
      isRequired: true,
    },
    {
      path: 'postcss.config.js',
      content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      description: 'PostCSS configuration',
      isRequired: true,
    },
    {
      path: 'README.md',
      content: `# {{projectName}}

A simple TODO application built with React, TypeScript, and Tailwind CSS.

## Features

- Add, edit, delete todos
- Mark todos as complete
- Filter by status (all, active, completed)
- LocalStorage persistence
- Responsive design

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

### Build

\`\`\`bash
npm run build
\`\`\`

### Testing

\`\`\`bash
npm run test
\`\`\`

## Project Structure

\`\`\`
src/
├── components/          # Reusable components
├── hooks/              # Custom hooks
├── types/              # TypeScript types
├── utils/              # Utility functions
├── App.tsx             # Main application component
├── main.tsx            # Application entry point
└── index.css           # Global styles
\`\`\`

## Learn More

- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
`,
      description: 'Project documentation',
      isRequired: true,
    },
  ],
  dependencies: {
    react: '^18.2.0',
    'react-dom': '^18.2.0',
  },
  devDependencies: {
    '@types/react': '^18.2.43',
    '@types/react-dom': '^18.2.17',
    '@vitejs/plugin-react': '^4.2.1',
    autoprefixer: '^10.4.16',
    postcss: '^8.4.32',
    tailwindcss: '^3.4.0',
    typescript: '^5.2.2',
    vite: '^5.0.8',
  },
  scripts: {
    dev: 'vite',
    build: 'tsc && vite build',
    preview: 'vite preview',
    lint: 'eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0',
  },
  setupInstructions: [
    'Install dependencies: npm install',
    'Start development server: npm run dev',
    'Open http://localhost:5173 in your browser',
  ],
  verificationSteps: [
    'npm run build completes without errors',
    'npm run dev starts successfully',
    'Application loads in browser',
    'Can add a todo',
    'Can mark a todo as complete',
    'Can delete a todo',
    'Todos persist after page reload',
  ],
};
