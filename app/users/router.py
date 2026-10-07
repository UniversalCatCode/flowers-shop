from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
from jose import jwt, JWTError

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.users.models import User, Role, Permission
from app.users.schemas import UserCreate, UserRead, UserUpdate, Token, RoleRead, PermissionRead
from app.users.service import UserService
from app.core.config import settings
router = APIRouter(prefix="/users", tags=["Users"])


# ===== USERS =====

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    user_service = UserService(db)
    
    existing_user = await user_service.get_user_by_username(user_data.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    if user_data.email:
        existing_email = await user_service.get_user_by_email(user_data.email)
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
    
    user = await user_service.create_user(user_data)
    return user


@router.post("/login", response_model=Token)
async def login(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    user_service = UserService(db)
    
    user = await user_service.authenticate_user(user_data.username, user_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    await user_service.update_last_login(user)
    
    access_token = await user_service.create_access_token(user.id)
    refresh_token = await user_service.create_refresh_token(user.id)  # === ДОБАВЛЕНО ===
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,  # === ДОБАВЛЕНО ===
        "token_type": "bearer"
    }



class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/refresh")
async def refresh_access_token(request: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    try:
        # Декодируем refresh token
        payload = jwt.decode(
            request.refresh_token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        
        # Проверяем, что это именно refresh token
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
            
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    # Если всё ок, выдаем новую пару токенов
    user_service = UserService(db)
    new_access_token = await user_service.create_access_token(int(user_id))
    new_refresh_token = await user_service.create_refresh_token(int(user_id))
    
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }



@router.get("/me", response_model=UserRead)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Загружаем роли с пермишенами
    stmt = select(User).options(
        selectinload(User.roles).selectinload(Role.permissions)
    ).where(User.id == current_user.id)
    result = await db.execute(stmt)
    user = result.scalar_one()
    
    role_name = None
    permissions = []
    if user.roles and len(user.roles) > 0:
        role_name = user.roles[0].name
        for role in user.roles:
            if role.permissions:
                permissions.extend([p.name for p in role.permissions])
    
    return UserRead(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        roles=user.roles,
        role_name=role_name or "Пользователь",
        permissions=list(set(permissions)),
    )


@router.get("/", response_model=List[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(User).options(
        selectinload(User.roles).selectinload(Role.permissions)
    )
    result = await db.execute(stmt)
    users = result.scalars().all()
    return users


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить конкретного пользователя по ID"""
    user_service = UserService(db)
    user = await user_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить пользователя (включая назначение ролей)"""
    user_service = UserService(db)
    user = await user_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Нельзя деактивировать самого себя
    if user.id == current_user.id and user_data.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    
    updated_user = await user_service.update_user(user, user_data)
    return updated_user


@router.patch("/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Деактивировать пользователя (мягкое удаление)"""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    
    user_service = UserService(db)
    user = await user_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    
    # Перезагружаем с ролями
    updated_user = await user_service.get_user_by_id(user_id)
    return updated_user


@router.patch("/{user_id}/activate", response_model=UserRead)
async def activate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Активировать пользователя"""
    user_service = UserService(db)
    user = await user_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = True
    await db.commit()
    await db.refresh(user)
    
    updated_user = await user_service.get_user_by_id(user_id)
    return updated_user

from app.users.schemas import PasswordChange

@router.patch("/{user_id}/change-password", status_code=200)
async def change_user_password(
    user_id: int,
    data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Сменить пароль пользователя"""
    user_service = UserService(db)
    user = await user_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Хэшируем новый пароль
    import bcrypt
    hashed_password = bcrypt.hashpw(
        data.new_password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')
    
    user.hashed_password = hashed_password
    await db.commit()
    
    return {"message": "Password changed successfully"}


# ===== ROLES =====

@router.get("/roles/list", response_model=List[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить список всех ролей с их правами"""
    stmt = select(Role).options(selectinload(Role.permissions))
    result = await db.execute(stmt)
    roles = result.scalars().all()
    return roles


@router.get("/roles/{role_id}", response_model=RoleRead)
async def get_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить конкретную роль с правами"""
    stmt = (
        select(Role)
        .where(Role.id == role_id)
        .options(selectinload(Role.permissions))
    )
    result = await db.execute(stmt)
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


# ===== PERMISSIONS =====

@router.get("/permissions/list", response_model=List[PermissionRead])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить список всех прав"""
    stmt = select(Permission)
    result = await db.execute(stmt)
    permissions = result.scalars().all()
    return permissions
