/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminOrderFulfillmentEventResponse } from './AdminOrderFulfillmentEventResponse';
import type { OrderItemResponse } from './OrderItemResponse';
import type { OrderStatus } from './OrderStatus';
export type AdminOrderFulfillmentResponse = {
    history: Array<AdminOrderFulfillmentEventResponse>;
    id: number;
    items: Array<OrderItemResponse>;
    status: OrderStatus;
    store_name: string;
};

