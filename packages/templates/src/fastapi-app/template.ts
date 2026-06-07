/**
 * AIDE Templates - FastAPI App Template
 * A Python REST API with FastAPI, Pydantic, and SQLAlchemy.
 */

import type { ProjectTemplate } from "../types.js";

export const fastapiAppTemplate: ProjectTemplate = {
  id: "fastapi-app",
  config: {
    name: "FastAPI Application",
    description:
      "A REST API with FastAPI, Pydantic validation, SQLAlchemy ORM, and JWT authentication",
    category: "api",
    difficulty: "intermediate",
    techStack: ["Python", "FastAPI", "Pydantic", "SQLAlchemy", "JWT"],
    features: [
      "RESTful API with automatic OpenAPI docs",
      "Request validation with Pydantic",
      "Database with SQLAlchemy ORM",
      "JWT authentication",
      "CORS middleware",
      "Structured project layout",
    ],
    estimatedTime: "3-5 hours",
    author: "AIDE Team",
    version: "1.0.0",
  },
  files: [
    {
      path: "requirements.txt",
      content: `fastapi>=0.110.0
uvicorn[standard]>=0.29.0
sqlalchemy>=2.0.0
pydantic>=2.6.0
pydantic-settings>=2.2.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.9
alembic>=1.13.0`,
      description: "Python dependencies",
      isRequired: true,
    },
    {
      path: "pyproject.toml",
      content: `[project]
name = "{{projectName}}"
version = "0.1.0"
description = "A REST API built with FastAPI"
requires-python = ">=3.10"

[tool.ruff]
line-length = 88
target-version = "py310"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W"]

[tool.pytest.ini_options]
testpaths = ["tests"]`,
      description: "Python project configuration",
      isRequired: true,
    },
    {
      path: "app/__init__.py",
      content: ``,
      description: "App package init",
      isRequired: true,
    },
    {
      path: "app/main.py",
      content: `"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, items
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="A REST API built with FastAPI",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(items.router, prefix="/api/items", tags=["items"])


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": settings.VERSION}


@app.on_event("startup")
def on_startup():
    """Initialize database on startup."""
    from app.db.database import init_db

    init_db()
`,
      description: "FastAPI application entry point",
      isRequired: true,
    },
    {
      path: "app/core/__init__.py",
      content: ``,
      description: "Core package init",
      isRequired: true,
    },
    {
      path: "app/core/config.py",
      content: `"""Application configuration."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    PROJECT_NAME: str = "{{projectName}}"
    VERSION: str = "0.1.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./app.db"

    # JWT
    SECRET_KEY: str = "change-this-to-a-secure-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8000"]

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
`,
      description: "Application configuration with Pydantic settings",
      isRequired: true,
    },
    {
      path: "app/core/security.py",
      content: `"""Security utilities for JWT and password hashing."""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Decode a JWT access token. Returns None if invalid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None
`,
      description: "Security utilities for JWT and password hashing",
      isRequired: true,
    },
    {
      path: "app/db/__init__.py",
      content: ``,
      description: "Database package init",
      isRequired: true,
    },
    {
      path: "app/db/database.py",
      content: `"""Database setup and session management."""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """SQLAlchemy declarative base."""

    pass


def init_db():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
`,
      description: "Database setup with SQLAlchemy",
      isRequired: true,
    },
    {
      path: "app/db/models.py",
      content: `"""SQLAlchemy database models."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def generate_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    items: Mapped[list["Item"]] = relationship(back_populates="owner")


class Item(Base):
    __tablename__ = "items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    name: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    owner: Mapped["User"] = relationship(back_populates="items")
`,
      description: "SQLAlchemy models for User and Item",
      isRequired: true,
    },
    {
      path: "app/api/__init__.py",
      content: ``,
      description: "API package init",
      isRequired: true,
    },
    {
      path: "app/api/auth.py",
      content: `"""Authentication API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.db.database import get_db
from app.db.models import User

router = APIRouter()


# --- Schemas ---


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None

    model_config = {"from_attributes": True}


# --- Routes ---


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user and return a JWT token."""
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
        name=req.name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Login with email and password, return a JWT token."""
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token)
`,
      description: "Authentication routes (register, login)",
      isRequired: true,
    },
    {
      path: "app/api/items.py",
      content: `"""Items API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.database import get_db
from app.db.models import Item, User

router = APIRouter()


# --- Schemas ---


class ItemCreate(BaseModel):
    name: str
    description: str | None = None


class ItemResponse(BaseModel):
    id: str
    name: str
    description: str | None
    owner_id: str

    model_config = {"from_attributes": True}


# --- Dependency ---


def get_current_user(token: str, db: Session = Depends(get_db)) -> User:
    """Extract and validate the current user from the Authorization header."""
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


# --- Routes ---


@router.get("/", response_model=list[ItemResponse])
def list_items(db: Session = Depends(get_db)):
    """Get all items."""
    return db.query(Item).all()


@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(
    req: ItemCreate,
    token: str,
    db: Session = Depends(get_db),
):
    """Create a new item (requires authentication)."""
    user = get_current_user(token, db)
    item = Item(
        name=req.name,
        description=req.description,
        owner_id=user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: str,
    token: str,
    db: Session = Depends(get_db),
):
    """Delete an item by ID (requires authentication)."""
    user = get_current_user(token, db)
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    if item.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this item",
        )
    db.delete(item)
    db.commit()
`,
      description: "Items CRUD routes with authentication",
      isRequired: true,
    },
    {
      path: ".env.example",
      content: `# Application
PROJECT_NAME={{projectName}}
DEBUG=True

# Database
DATABASE_URL=sqlite:///./app.db
# For PostgreSQL: postgresql://user:password@localhost:5432/mydb

# JWT
SECRET_KEY=change-this-to-a-secure-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# CORS
ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:8000"]`,
      description: "Environment variables template",
      isRequired: true,
    },
    {
      path: ".gitignore",
      content: `# Python
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
dist/
build/
.eggs/

# Virtual environment
venv/
.venv/
env/

# Environment
.env

# Database
*.db

# IDE
.vscode/
.idea/

# OS
.DS_Store`,
      description: "Git ignore file",
      isRequired: true,
    },
    {
      path: "README.md",
      content: `# {{projectName}}

A REST API built with FastAPI, Pydantic, SQLAlchemy, and JWT authentication.

## Features

- RESTful API with automatic OpenAPI documentation
- Request validation with Pydantic v2
- Database with SQLAlchemy ORM
- JWT authentication
- CORS middleware
- Structured project layout

## Prerequisites

- Python 3.10+
- pip or poetry

## Getting Started

### 1. Create virtual environment

\`\`\`bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate
\`\`\`

### 2. Install dependencies

\`\`\`bash
pip install -r requirements.txt
\`\`\`

### 3. Set up environment variables

\`\`\`bash
cp .env.example .env
# Edit .env with your configuration
\`\`\`

### 4. Start development server

\`\`\`bash
uvicorn app.main:app --reload
\`\`\`

The API will be available at http://localhost:8000

Interactive API docs: http://localhost:8000/docs

## API Endpoints

### Authentication
- \`POST /api/auth/register\` - Register a new user
- \`POST /api/auth/login\` - Login user

### Items
- \`GET /api/items\` - Get all items
- \`POST /api/items\` - Create item (requires auth)
- \`DELETE /api/items/:id\` - Delete item (requires auth, must be owner)

### Health
- \`GET /health\` - Health check

## Project Structure

\`\`\`
app/
├── api/
│   ├── auth.py          # Authentication routes
│   └── items.py         # Items CRUD routes
├── core/
│   ├── config.py        # Settings and configuration
│   └── security.py      # JWT and password utilities
├── db/
│   ├── database.py      # Database session and setup
│   └── models.py        # SQLAlchemy models
├── __init__.py
└── main.py              # FastAPI application entry point
\`\`\`

## Testing

\`\`\`bash
pip install pytest httpx
pytest
\`\`\`

## License

MIT
`,
      description: "Project documentation",
      isRequired: true,
    },
  ],
  dependencies: {
    fastapi: ">=0.110.0",
    uvicorn: ">=0.29.0",
    sqlalchemy: ">=2.0.0",
    pydantic: ">=2.6.0",
    "pydantic-settings": ">=2.2.0",
    "python-jose": ">=3.3.0",
    passlib: ">=1.7.4",
    "python-multipart": ">=0.0.9",
    alembic: ">=1.13.0",
  },
  devDependencies: {},
  scripts: {
    dev: "uvicorn app.main:app --reload",
    start: "uvicorn app.main:app --host 0.0.0.0 --port 8000",
    test: "pytest",
    lint: "ruff check app/",
  },
  setupInstructions: [
    "Create virtual environment: python -m venv venv",
    "Activate venv: source venv/bin/activate",
    "Install dependencies: pip install -r requirements.txt",
    "Copy .env.example to .env and configure",
    "Start development server: uvicorn app.main:app --reload",
    "Open http://localhost:8000/docs for interactive API docs",
  ],
  verificationSteps: [
    "pip install -r requirements.txt completes without errors",
    "uvicorn app.main:app starts successfully",
    "Health check endpoint responds: GET /health",
    "OpenAPI docs accessible at /docs",
    "Can register a new user: POST /api/auth/register",
    "Can login with registered user: POST /api/auth/login",
    "Can create an item with authentication: POST /api/items",
    "Can get all items: GET /api/items",
  ],
};
