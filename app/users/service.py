from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt
from typing import Optional, List

from app.core.config import settings
from app.users.models import User, Role, Permission, user_roles
from app.users.schemas import UserCreate, UserUpdate, RoleCreate


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== User Methods =====
    async def get_user_by_username(self, username: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(
            select(User)
            .where(User.id == user_id)
            .options(
                selectinload(User.roles).selectinload(Role.permissions) # <-- Вложенная загрузка
            )
        )
        return result.scalar_one_or_none()

    async def create_user(self, user_data: UserCreate) -> User:
        hashed_password = bcrypt.hashpw(
            user_data.password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')

        user = User(
            username=user_data.username,
            email=user_data.email,
            full_name=user_data.full_name,
            hashed_password=hashed_password,
            is_active=True
        )

        if user_data.role_ids:
            roles = await self.db.execute(
                select(Role).where(Role.id.in_(user_data.role_ids))
            )
            user.roles = list(roles.scalars().all())

        self.db.add(user)
        await self.db.commit()

        # Явно перечитываем пользователя с вложенной загрузкой ролей И прав
        result = await self.db.execute(
            select(User)
            .where(User.id == user.id)
            .options(
                selectinload(User.roles).selectinload(Role.permissions)
            )
        )
        return result.scalar_one()





    async def update_user(self, user: User, user_data: UserUpdate) -> User:
        update_data = user_data.model_dump(exclude_unset=True)

        # Обновляем роли, если указаны
        if 'role_ids' in update_data:
            role_ids = update_data.pop('role_ids')
            if role_ids is not None:
                roles = await self.db.execute(
                    select(Role).where(Role.id.in_(role_ids))
                )
                user.roles = list(roles.scalars().all())

        for field, value in update_data.items():
            setattr(user, field, value)

        await self.db.commit()
        await self.db.refresh(user)

        return user

    async def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )

    async def authenticate_user(self, username: str, password: str) -> Optional[User]:
        user = await self.get_user_by_username(username)
        if not user:
            return None
        if not await self.verify_password(password, user.hashed_password):
            return None
        return user

    async def create_access_token(self, user_id: int) -> str:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
        to_encode = {"sub": str(user_id), "exp": expire, "type": "access"}
        encoded_jwt = jwt.encode(
            to_encode,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm
        )
        return encoded_jwt

    # === ДОБАВЬ ЭТОТ МЕТОД ===
    async def create_refresh_token(self, user_id: int) -> str:
        # Refresh token живет 7 дней (или можешь поставить 24 часа)
        expire = datetime.now(timezone.utc) + timedelta(days=7)
        to_encode = {"sub": str(user_id), "exp": expire, "type": "refresh"}
        encoded_jwt = jwt.encode(
            to_encode,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm
        )
        return encoded_jwt


    async def update_last_login(self, user: User):
        user.last_login_at = datetime.now(timezone.utc)
        await self.db.commit()

    async def get_user_permissions(self, user: User) -> List[str]:
        """Получить все права пользователя через его роли"""
        permissions = set()
        for role in user.roles:
            for permission in role.permissions:
                permissions.add(permission.name)
        return list(permissions)

    # ===== Role Methods =====
    async def get_role_by_name(self, name: str) -> Optional[Role]:
        result = await self.db.execute(
            select(Role).where(Role.name == name)
        )
        return result.scalar_one_or_none()

    async def get_role_by_id(self, role_id: int) -> Optional[Role]:
        result = await self.db.execute(
            select(Role).where(Role.id == role_id)
        )
        return result.scalar_one_or_none()

    async def create_role(self, role_data: RoleCreate) -> Role:
        role = Role(
            name=role_data.name,
            description=role_data.description,
            is_system=False
        )

        # Добавляем права, если указаны
        if role_data.permission_ids:
            permissions = await self.db.execute(
                select(Permission).where(Permission.id.in_(role_data.permission_ids))
            )
            role.permissions = list(permissions.scalars().all())

        self.db.add(role)
        await self.db.commit()
        await self.db.refresh(role)

        return role

    # ===== Permission Methods =====
    async def get_permission_by_name(self, name: str) -> Optional[Permission]:
        result = await self.db.execute(
            select(Permission).where(Permission.name == name)
        )
        return result.scalar_one_or_none()

    async def create_permission(self, name: str, description: str = None) -> Permission:
        permission = Permission(name=name, description=description)
        self.db.add(permission)
        await self.db.commit()
        await self.db.refresh(permission)
        return permission


