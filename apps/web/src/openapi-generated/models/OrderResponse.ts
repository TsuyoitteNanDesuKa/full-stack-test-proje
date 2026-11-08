/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DeliveryMethod } from './DeliveryMethod';
import type { OrderAddressSnapshot } from './OrderAddressSnapshot';
import type { OrderItemResponse } from './OrderItemResponse';
import type { OrderStatus } from './OrderStatus';
import type { OrderStatusEventResponse } from './OrderStatusEventResponse';
import type { ProductReturnResponse } from './ProductReturnResponse';
export type OrderResponse = {
    created_at: string;
    delivery_fee: string;
    delivery_method: (DeliveryMethod | null);
    history: Array<OrderStatusEventResponse>;
    id: number;
    item_subtotal: string;
    items: Array<OrderItemResponse>;
    returns?: Array<ProductReturnResponse>;
    shipping_address: (OrderAddressSnapshot | null);
    status: OrderStatus;
    total_amount: string;
};

