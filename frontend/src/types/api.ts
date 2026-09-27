// ============ USERS ============
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}


export interface User {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at?: string;       // <-- Добавлено (нужно для схем)
  last_login_at?: string | null; // <-- Добавлено
  roles?: any[];             // <-- Добавлено
  role_name?: string;        // <-- ДОБАВЛЕНО: чтобы работало отображение в шапке
}

// ============ CATALOG ============
export interface Category {
  id: number;
  name: string;
  category_type: 'flower' | 'packaging' | 'bouquet';
  parent_id: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface CategoryCreate {
  name: string;
  category_type: 'flower' | 'packaging' | 'bouquet';
  parent_id?: number | null;
}

export interface Product {
  id: number;
  category_id: number;
  sku: string;
  name: string;
  product_type: 'flower' | 'packaging' | 'bouquet';
  unit: 'stem' | 'meter' | 'piece';
  shelf_life_days: number | null;
  meta_data: Record<string, any> | null;
  is_active: boolean;
  recipe_id?: number | null; // <-- ДОБАВЛЕНО: чтобы работала логика сборки букетов
  purchase_price: number | null;
  selling_price: number | null;
  }
  

export interface ProductCreate {
  category_id: number;
  sku: string;
  name: string;
  product_type: 'flower' | 'packaging' | 'bouquet';
  unit: 'stem' | 'meter' | 'piece';
  shelf_life_days?: number;
  meta_data?: Record<string, any>;
}

export interface Supplier {
  id: number;
  name: string;
  contact_info: Record<string, any> | null;
  notes: string | null;
  is_active: boolean;
}

export interface SupplierCreate {
  name: string;
  contact_info?: Record<string, any>;
  notes?: string;
}
