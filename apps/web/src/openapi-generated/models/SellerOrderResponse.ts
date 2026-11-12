/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrderAddressSnapshot } from './OrderAddressSnapshot';
import type { OrderFulfillmentEventResponse } from './OrderFulfillmentEventResponse';
import type { OrderItemResponse } from './OrderItemResponse';
import type { OrderStatus } from './OrderStatus';
export type SellerOrderResponse = {
    created_at: string;
    history: Array<OrderFulfillmentEventResponse>;
    id: number;
    items: Array<OrderItemResponse>;
    order_id: number;
    shipping_address: (OrderAddressSnapshot | null);
    status: OrderStatus;
    store_name: string;
    updated_at: string;
};

