/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SellerApplicantType } from './SellerApplicantType';
import type { SellerApplicationStatus } from './SellerApplicationStatus';
export type AdminSellerApplicationResponse = {
    admin_note: (string | null);
    applicant_note: (string | null);
    applicant_type: SellerApplicantType;
    business_description: string;
    city: string;
    contact_phone: string;
    created_at: string;
    district: string;
    id: number;
    legal_name: string;
    owner_subject: string;
    primary_category: string;
    representative_name: (string | null);
    reviewed_at: (string | null);
    reviewer_subject: (string | null);
    status: SellerApplicationStatus;
    store_name: string;
    updated_at: string;
};

