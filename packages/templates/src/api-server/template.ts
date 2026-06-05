/**
 * AIDE Templates - API Server Template
 * A RESTful API server with Express, TypeScript, and PostgreSQL.
 */

import type { ProjectTemplate } from '../types.js';

export const apiServerTemplate: ProjectTemplate = {
  id: 'api-server',
  config: {
    name: 'API Server',
    description: 'A RESTful API server with Express, TypeScript, PostgreSQL, and JWT authentication',
    category: 'api',
    difficulty: 'intermediate',
    techStack: ['Express', 'TypeScript', 'PostgreSQL', 'Prisma', 'JWT'],
    features: [
      'RESTful API endpoints',
      'User authentication with JWT',
      'Database with Prisma ORM',
      'Input validation with Zod',
      'Error handling middleware',
      'Logging with Winston',
      'Rate limiting',
      'CORS configuration',
    ],
    estimatedTime: '4-6 hours',
    author: 'AIDE Team',
    version: '1.0.0',
  },
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "{{projectName}}",
  "version": "0.1.0",
  "description": "RESTful API server with Express and TypeScript",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint . --ext ts",
    "test": "vitest",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.8.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "winston": "^3.11.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.10.0",
    "prisma": "^5.8.0",
    "tsx": "^4.7.0",
    "typescript": "^5.2.2",
    "vitest": "^1.1.0"
  }
}`,
      description: 'Package configuration with Express, Prisma, and dependencies',
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
      path: 'prisma/schema.prisma',
      content: `// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  posts     Post[]
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`,
      description: 'Prisma database schema',
      isRequired: true,
    },
    {
      path: 'src/index.ts',
      content: `import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { authRouter } from './routes/auth'
import { postsRouter } from './routes/posts'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './utils/logger'

dotenv.config()

export const prisma = new PrismaClient()
const app = express()
const PORT = process.env.PORT || 3000

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
})
app.use(limiter)

// Body parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api/auth', authRouter)
app.use('/api/posts', postsRouter)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling
app.use(errorHandler)

// Start server
async function main() {
  try {
    await prisma.$connect()
    logger.info('Connected to database')
    
    app.listen(PORT, () => {
      logger.info(\`Server running on port \${PORT}\`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

main()

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully')
  await prisma.$disconnect()
  process.exit(0)
})`,
      description: 'Main server entry point with Express setup',
      isRequired: true,
    },
    {
      path: 'src/routes/auth.ts',
      content: `import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../index'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

// Register
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body)
    
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    })

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '7d',
    })

    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, token })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors })
    }
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Login
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body)
    
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '7d',
    })

    res.json({ user: { id: user.id, email: user.email, name: user.name }, token })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors })
    }
    res.status(500).json({ error: 'Internal server error' })
  }
})`,
      description: 'Authentication routes with register and login',
      isRequired: true,
    },
    {
      path: 'src/routes/posts.ts',
      content: `import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { authenticate, AuthRequest } from '../middleware/auth'

export const postsRouter = Router()

const postSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  published: z.boolean().optional(),
})

// Get all posts
postsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const posts = await prisma.post.findMany({
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    res.json(posts)
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get post by ID
postsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }
    
    res.json(post)
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Create post (requires auth)
postsRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, published } = postSchema.parse(req.body)
    
    const post = await prisma.post.create({
      data: {
        title,
        content,
        published,
        authorId: req.userId!,
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    
    res.status(201).json(post)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors })
    }
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update post (requires auth, must be author)
postsRouter.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } })
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }
    
    if (post.authorId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' })
    }
    
    const { title, content, published } = postSchema.parse(req.body)
    
    const updatedPost = await prisma.post.update({
      where: { id: req.params.id },
      data: { title, content, published },
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    
    res.json(updatedPost)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors })
    }
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete post (requires auth, must be author)
postsRouter.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } })
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }
    
    if (post.authorId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' })
    }
    
    await prisma.post.delete({ where: { id: req.params.id } })
    
    res.status(204).send()
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' })
  }
})`,
      description: 'Posts CRUD routes with authentication',
      isRequired: true,
    },
    {
      path: 'src/middleware/auth.ts',
      content: `import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  
  const token = authHeader.split(' ')[1]
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}`,
      description: 'JWT authentication middleware',
      isRequired: true,
    },
    {
      path: 'src/middleware/errorHandler.ts',
      content: `import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  })

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
}`,
      description: 'Global error handling middleware',
      isRequired: true,
    },
    {
      path: 'src/utils/logger.ts',
      content: `import winston from 'winston'

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: '{{projectName}}' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
})

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }))
}`,
      description: 'Winston logger configuration',
      isRequired: true,
    },
    {
      path: '.env.example',
      content: `# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-this"

# Server
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGIN="http://localhost:3000"

# Logging
LOG_LEVEL="info"`,
      description: 'Environment variables template',
      isRequired: true,
    },
    {
      path: 'README.md',
      content: `# {{projectName}}

A RESTful API server built with Express, TypeScript, PostgreSQL, and JWT authentication.

## Features

- RESTful API endpoints
- User authentication with JWT
- Database with Prisma ORM
- Input validation with Zod
- Error handling middleware
- Logging with Winston
- Rate limiting
- CORS configuration

## Prerequisites

- Node.js 18+
- PostgreSQL
- npm or yarn

## Getting Started

### 1. Install dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Set up environment variables

\`\`\`bash
cp .env.example .env
# Edit .env with your database credentials
\`\`\`

### 3. Set up database

\`\`\`bash
npx prisma db push
npx prisma generate
\`\`\`

### 4. Start development server

\`\`\`bash
npm run dev
\`\`\`

The API will be available at http://localhost:3000

## API Endpoints

### Authentication
- \`POST /api/auth/register\` - Register a new user
- \`POST /api/auth/login\` - Login user

### Posts
- \`GET /api/posts\` - Get all posts
- \`GET /api/posts/:id\` - Get post by ID
- \`POST /api/posts\` - Create post (requires auth)
- \`PUT /api/posts/:id\` - Update post (requires auth, must be author)
- \`DELETE /api/posts/:id\` - Delete post (requires auth, must be author)

### Health
- \`GET /health\` - Health check

## Project Structure

\`\`\`
src/
├── middleware/          # Express middleware
│   ├── auth.ts        # JWT authentication
│   └── errorHandler.ts # Error handling
├── routes/            # API routes
│   ├── auth.ts        # Authentication routes
│   └── posts.ts       # Posts CRUD routes
├── utils/             # Utility functions
│   └── logger.ts      # Winston logger
└── index.ts           # Main entry point
\`\`\`

## Testing

\`\`\`bash
npm test
\`\`\`

## License

MIT
`,
      description: 'Project documentation',
      isRequired: true,
    },
  ],
  dependencies: {
    '@prisma/client': '^5.8.0',
    bcryptjs: '^2.4.3',
    cors: '^2.8.5',
    dotenv: '^16.3.1',
    express: '^4.18.2',
    'express-rate-limit': '^7.1.5',
    helmet: '^7.1.0',
    jsonwebtoken: '^9.0.2',
    winston: '^3.11.0',
    zod: '^3.22.4',
  },
  devDependencies: {
    '@types/bcryptjs': '^2.4.6',
    '@types/cors': '^2.8.17',
    '@types/express': '^4.17.21',
    '@types/jsonwebtoken': '^9.0.5',
    '@types/node': '^20.10.0',
    prisma: '^5.8.0',
    tsx: '^4.7.0',
    typescript: '^5.2.2',
    vitest: '^1.1.0',
  },
  scripts: {
    dev: 'tsx watch src/index.ts',
    build: 'tsc',
    start: 'node dist/index.js',
    lint: 'eslint . --ext ts',
    test: 'vitest',
    'db:generate': 'prisma generate',
    'db:push': 'prisma db push',
    'db:migrate': 'prisma migrate dev',
    'db:seed': 'tsx prisma/seed.ts',
  },
  setupInstructions: [
    'Install dependencies: npm install',
    'Copy .env.example to .env and configure',
    'Set up database: npx prisma db push',
    'Generate Prisma client: npx prisma generate',
    'Start development server: npm run dev',
  ],
  verificationSteps: [
    'npm run build completes without errors',
    'npm run dev starts successfully',
    'Health check endpoint responds: GET /health',
    'Can register a new user: POST /api/auth/register',
    'Can login with registered user: POST /api/auth/login',
    'Can create a post with authentication: POST /api/posts',
    'Can get all posts: GET /api/posts',
  ],
};
