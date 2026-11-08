/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminOrderStatusEventResponse } from './AdminOrderStatusEventResponse';
import type { DeliveryMethod } from './DeliveryMethod';
import type { OrderAddressSnapshot } from './OrderAddressSnapshot';
import type { OrderItemResponse } from './OrderItemResponse';
import type { OrderStatus } from './OrderStatus';
import type { PaymentStatus } from './PaymentStatus';
import type { ProductReturnResponse } from './ProductReturnResponse';
export type AdminOrderResponse = {
    created_at: string;
    delivery_fee: string;
    delivery_method: (DeliveryMethod | null);
    history: Array<AdminOrderStatusEventResponse>;
    id: number;
    item_subtotal: string;
    items: Array<OrderItemResponse>;
    owner_subject: string;
    payment_status: (PaymentStatus | null);
    returns?: Array<ProductReturnResponse>;
    shipping_address: (OrderAddressSnapshot | null);
    status: OrderStatus;
    total_amount: string;
};

