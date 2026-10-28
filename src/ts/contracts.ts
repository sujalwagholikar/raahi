/** Shared browser/backend data contracts. Runtime JavaScript remains native ES modules. */
export type OrderStatus = 'pending' | 'confirmed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cod';

export interface Product {
  sku: string;
  name: string;
  category: string;
  price: number;
  original_price: number;
  unit: string;
  rating: number;
  badge: string;
  featured: boolean;
  stock: number;
  image_url: string;
  description: string;
  active: boolean;
}

export interface CartLineInput { sku: string; quantity: number; }
export interface CheckoutPayload {
  customer_name: string;
  phone: string;
  email?: string;
  address_line: string;
  city: string;
  pincode: string;
  payment_method: PaymentMethod;
  items: CartLineInput[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_sku: string;
  product_name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface StoreOrder {
  id: string;
  order_number: string;
  customer_name: string;
  phone: string;
  email: string | null;
  address_line: string;
  city: string;
  pincode: string;
  payment_method: PaymentMethod;
  subtotal: number;
  shipping_fee: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  order_items?: OrderItem[];
}
