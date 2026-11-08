/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SellerApplicantType } from './SellerApplicantType';
export type SellerApplicationRequest = {
    applicant_type: SellerApplicantType;
    business_description: string;
    city: string;
    contact_phone: string;
    district: string;
    legal_name: string;
    primary_category: string;
    representative_name?: (string | null);
    store_name: string;
};

