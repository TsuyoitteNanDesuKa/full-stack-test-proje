/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProductReviewResponse } from './ProductReviewResponse';
export type ProductReviewPageResponse = {
    can_review: boolean;
    has_more: boolean;
    items: Array<ProductReviewResponse>;
    limit: number;
    my_review: (ProductReviewResponse | null);
    offset: number;
};

