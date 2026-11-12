/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrderStatus } from './OrderStatus';
export type OrderFulfillmentEventResponse = {
    action: string;
    created_at: string;
    from_status: (OrderStatus | null);
    to_status: OrderStatus;
};

