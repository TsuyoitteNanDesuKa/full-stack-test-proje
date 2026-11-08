/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PaymentStatus } from './PaymentStatus';
export type PaymentResponse = {
    amount: string;
    checkout_url: (string | null);
    created_at: string;
    currency: string;
    expires_at: string;
    id: number;
    order_id: number;
    provider_reference: string;
    status: PaymentStatus;
    updated_at: string;
};

