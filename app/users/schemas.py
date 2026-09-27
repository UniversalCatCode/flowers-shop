from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional, List


# ===== Permission Schemas =====
class PermissionBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=255)


class PermissionCreate(PermissionBase):
    pass


class PermissionRead(PermissionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ===== Role Schemas =====
class RoleBase(BaseModel):
    name: str = Field(..., max_length=50)
    description: Optional[str] = Field(None, max_length=255)


class RoleCreate(RoleBase):
    permission_ids: List[int] = []


class RoleRead(RoleBase):
    id: int
    is_system: Optional[bool]= False
    created_at: datetime
    permissions: List[PermissionRead] = []
   

    class Config:
        from_attributes = True


# ===== User Schemas =====
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, max_length=200)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)
    role_ids: List[int] = []


class UserRead(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    roles: List[RoleRead] = []
    role_name: Optional[str] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[int]] = None


class Token(BaseModel):
    access_token: str
    refresh_token: str 
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


class PasswordChange(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=100)
