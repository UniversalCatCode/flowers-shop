from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from typing import List
from typing import Callable
from app.core.config import settings
from app.core.database import get_db
from app.users.service import UserService
from app.users.models import User

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user_service = UserService(db)
    user = await user_service.get_user_by_id(int(user_id))

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    return user


def require_permissions(required_permissions: List[str]):
    """Dependency для проверки наличия определённых прав"""
    async def permission_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ):
        user_service = UserService(db)
        user_permissions = await user_service.get_user_permissions(current_user)

        # Проверяем, есть ли у пользователя хотя бы одно из требуемых прав
        if not any(perm in user_permissions for perm in required_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required permissions: {', '.join(required_permissions)}"
            )

        return current_user

    return permission_checker


def require_all_permissions(required_permissions: List[str]):
    """Dependency для проверки наличия ВСЕХ требуемых прав"""
    async def permission_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ):
        user_service = UserService(db)
        user_permissions = await user_service.get_user_permissions(current_user)

        # Проверяем, есть ли у пользователя ВСЕ требуемые права
        if not all(perm in user_permissions for perm in required_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required all permissions: {', '.join(required_permissions)}"
            )

        return current_user

    return permission_checker




def require_permission(permission_name: str) -> Callable:
    """
    Декоратор для проверки наличия права у пользователя.
    
    Использование:
        @router.post("/orders/{id}/assemble")
        async def start_assembly(
            order_id: int,
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(require_permission("order.assemble"))
        ):
            ...
    """
    async def permission_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:
        # Получаем все права пользователя через его роли
        user_permissions = set()
        for role in current_user.roles:
            # Важно: роли должны быть загружены с permissions через selectinload
            if hasattr(role, 'permissions') and role.permissions:
                for permission in role.permissions:
                    user_permissions.add(permission.name)
        
        # Проверяем наличие требуемого права
        if permission_name not in user_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Недостаточно прав. Требуется: {permission_name}"
            )
        
        return current_user
    
    return permission_checker


def require_any_permission(*permission_names: str) -> Callable:
    """
    Декоратор для проверки наличия хотя бы одного из перечисленных прав.
    
    Использование:
        @router.post("/orders/{id}/cancel")
        async def cancel_order(
            current_user: User = Depends(require_any_permission("order.cancel", "admin"))
        ):
            ...
    """
    async def permission_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:
        user_permissions = set()
        for role in current_user.roles:
            if hasattr(role, 'permissions') and role.permissions:
                for permission in role.permissions:
                    user_permissions.add(permission.name)
        
        if not any(perm in user_permissions for perm in permission_names):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Недостаточно прав. Требуется одно из: {', '.join(permission_names)}"
            )
        
        return current_user
    
    return permission_checker


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Зависимость: только пользователи с ролью admin"""
    if not current_user.roles or not any(r.name == 'admin' for r in current_user.roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуется роль администратора"
        )
    return current_user
