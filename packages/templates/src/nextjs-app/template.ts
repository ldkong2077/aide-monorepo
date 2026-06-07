/**
 * AIDE Templates - Next.js App Template
 * A full-stack application with Next.js App Router, React, TypeScript, and Tailwind CSS.
 */

import type { ProjectTemplate } from "../types.js";

export const nextjsAppTemplate: ProjectTemplate = {
  id: "nextjs-app",
  config: {
    name: "Next.js Full-Stack App",
    description:
      "A full-stack application with Next.js App Router, React Server Components, API routes, and Tailwind CSS",
    category: "fullstack",
    difficulty: "intermediate",
    techStack: ["Next.js", "React", "TypeScript", "Tailwind CSS", "App Router"],
    features: [
      "App Router with layout and page components",
      "React Server Components",
      "API route handlers (GET, POST)",
      "Responsive design with Tailwind CSS",
      "Type-safe with TypeScript",
      "Metadata and SEO support",
    ],
    estimatedTime: "3-5 hours",
    author: "AIDE Team",
    version: "1.0.0",
  },
  files: [
    {
      path: "package.json",
      content: `{
  "name": "{{projectName}}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.0"
  }
}`,
      description:
        "Package configuration with Next.js, React, and Tailwind CSS",
      isRequired: true,
    },
    {
      path: "tsconfig.json",
      content: `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,
      description: "TypeScript configuration for Next.js",
      isRequired: true,
    },
    {
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;`,
      description: "Next.js configuration",
      isRequired: true,
    },
    {
      path: "tailwind.config.js",
      content: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};`,
      description: "Tailwind CSS configuration",
      isRequired: true,
    },
    {
      path: "postcss.config.js",
      content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`,
      description: "PostCSS configuration",
      isRequired: true,
    },
    {
      path: "src/app/layout.tsx",
      content: `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "{{projectName}}",
  description: "A full-stack application built with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}`,
      description: "Root layout component with metadata",
      isRequired: true,
    },
    {
      path: "src/app/globals.css",
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-rgb: 10, 10, 10;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
}`,
      description: "Global styles with Tailwind CSS and dark mode",
      isRequired: true,
    },
    {
      path: "src/app/page.tsx",
      content: `import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            Welcome to {{projectName}}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            A full-stack application built with Next.js App Router
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/items"
            className="group rounded-lg border border-gray-300 dark:border-gray-700 p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2 group-hover:text-blue-500 dark:group-hover:text-blue-400">
              Items Manager
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create, read, update, and delete items with a full CRUD interface.
            </p>
          </Link>

          <Link
            href="/api/items"
            className="group rounded-lg border border-gray-300 dark:border-gray-700 p-6 hover:border-green-500 dark:hover:border-green-400 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2 group-hover:text-green-500 dark:group-hover:text-green-400">
              REST API
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              JSON API endpoints for programmatic access. Try GET /api/items.
            </p>
          </Link>
        </div>

        <div className="text-center text-sm text-gray-500 dark:text-gray-500">
          Built with Next.js, React, TypeScript, and Tailwind CSS
        </div>
      </div>
    </main>
  );
}`,
      description: "Home page component",
      isRequired: true,
    },
    {
      path: "src/app/items/page.tsx",
      content: `"use client";

import { useState, useEffect } from "react";

interface Item {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      const res = await fetch("/api/items");
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error("Failed to fetch items:", error);
    } finally {
      setLoading(false);
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const newItem = await res.json();
      setItems((prev) => [...prev, newItem]);
      setName("");
      setDescription("");
    } catch (error) {
      console.error("Failed to add item:", error);
    }
  }

  async function deleteItem(id: string) {
    try {
      await fetch(\`/api/items/\${id}\`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Items Manager</h1>

      <form onSubmit={addItem} className="mb-8 space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600"
          required
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600"
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Add Item
        </button>
      </form>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between border rounded-lg p-4 dark:border-gray-600"
          >
            <div>
              <h3 className="font-semibold">{item.name}</h3>
              {item.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {item.description}
                </p>
              )}
            </div>
            <button
              onClick={() => deleteItem(item.id)}
              className="text-red-500 hover:text-red-700 text-sm ml-4"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {items.length === 0 && (
        <p className="text-center text-gray-500 mt-8">No items yet. Add one above!</p>
      )}
    </main>
  );
}`,
      description: "Items management page with CRUD operations",
      isRequired: true,
    },
    {
      path: "src/app/api/items/route.ts",
      content: `import { NextResponse } from "next/server";

// In-memory store (replace with a database in production)
interface Item {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

const items: Item[] = [];

export async function GET() {
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }

    const item: Item = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: (description || "").trim(),
      createdAt: new Date().toISOString(),
    };

    items.push(item);
    return NextResponse.json(item, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}`,
      description: "API route handler for items (GET, POST)",
      isRequired: true,
    },
    {
      path: "src/app/api/items/[id]/route.ts",
      content: `import { NextResponse } from "next/server";

// Reference the same in-memory store
// In production, replace with database queries
interface Item {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

// Note: In a real app, this would share state with the parent route.
// For this template, we use a simple in-memory approach.
const items: Item[] = [];

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const index = items.findIndex((item) => item.id === params.id);
  if (index === -1) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  items.splice(index, 1);
  return NextResponse.json({ success: true });
}`,
      description: "API route handler for single item (DELETE)",
      isRequired: true,
    },
    {
      path: ".env.example",
      content: `# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database (when adding a database)
# DATABASE_URL="postgresql://user:password@localhost:5432/mydb"`,
      description: "Environment variables template",
      isRequired: true,
    },
    {
      path: ".gitignore",
      content: `# dependencies
/node_modules
/.pnp
.pnp.js
.yarn/install-state.gz

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local
.env

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts`,
      description: "Git ignore file",
      isRequired: true,
    },
    {
      path: "README.md",
      content: `# {{projectName}}

A full-stack application built with Next.js App Router, React, TypeScript, and Tailwind CSS.

## Features

- App Router with layout and page components
- React Server Components
- API route handlers (GET, POST, DELETE)
- Responsive design with Tailwind CSS
- Dark mode support
- Type-safe with TypeScript

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

Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### Build

\`\`\`bash
npm run build
\`\`\`

### Production

\`\`\`bash
npm start
\`\`\`

## Project Structure

\`\`\`
src/
├── app/
│   ├── api/
│   │   └── items/       # API route handlers
│   │       ├── route.ts  # GET, POST /api/items
│   │       └── [id]/
│   │           └── route.ts  # DELETE /api/items/:id
│   ├── items/
│   │   └── page.tsx     # Items management page
│   ├── globals.css      # Global styles
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Home page
└── ...
\`\`\`

## API Endpoints

- \`GET /api/items\` - Get all items
- \`POST /api/items\` - Create a new item
- \`DELETE /api/items/:id\` - Delete an item

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
`,
      description: "Project documentation",
      isRequired: true,
    },
  ],
  dependencies: {
    next: "^14.2.0",
    react: "^18.3.0",
    "react-dom": "^18.3.0",
  },
  devDependencies: {
    "@types/node": "^20.12.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    autoprefixer: "^10.4.19",
    eslint: "^8.57.0",
    "eslint-config-next": "^14.2.0",
    postcss: "^8.4.38",
    tailwindcss: "^3.4.3",
    typescript: "^5.4.0",
  },
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start",
    lint: "next lint",
  },
  setupInstructions: [
    "Install dependencies: npm install",
    "Start development server: npm run dev",
    "Open http://localhost:3000 in your browser",
  ],
  verificationSteps: [
    "npm run build completes without errors",
    "npm run dev starts successfully",
    "Home page loads in browser",
    "Items page is accessible at /items",
    "Can add an item via the form",
    "API endpoint GET /api/items returns items",
    "API endpoint POST /api/items creates an item",
  ],
};
