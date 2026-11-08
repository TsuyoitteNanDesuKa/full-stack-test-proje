/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrderStatus } from './OrderStatus';
export type AdminOrderStatusEventResponse = {
    action: string;
    actor_subject: (string | null);
    created_at: string;
    from_status: (OrderStatus | null);
    reason: (string | null);
    to_status: OrderStatus;
};

