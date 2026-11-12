/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrderFulfillmentEventResponse } from './OrderFulfillmentEventResponse';
import type { OrderItemResponse } from './OrderItemResponse';
import type { OrderStatus } from './OrderStatus';
export type OrderFulfillmentResponse = {
    history: Array<OrderFulfillmentEventResponse>;
    id: number;
    items: Array<OrderItemResponse>;
    status: OrderStatus;
    store_name: string;
};

