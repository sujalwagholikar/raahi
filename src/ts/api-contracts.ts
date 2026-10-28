import type { CheckoutPayload, Product, StoreOrder, OrderStatus } from './contracts';

export interface ApiError { error: string; }
export type ProductsResponse = Product[];
export type CreateOrderResponse = Pick<StoreOrder, 'id' | 'order_number' | 'subtotal' | 'shipping_fee' | 'total' | 'status'>;
export type AdminOrdersResponse = StoreOrder[];
export interface UpdateOrderStatusPayload { id: string; status: OrderStatus; }
export interface UpdateProductPayload { sku: string; price: number; stock: number; active: boolean; }
// Compile-time contracts for the native frontend modules and Rust HTTP endpoints.
export type CreateOrderRequest = CheckoutPayload;
