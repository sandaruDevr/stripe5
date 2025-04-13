import type { Stripe } from 'stripe';

export interface UserSubscription {
  customerId: string;
  subscriptionId: string;
  priceId: string;
  status: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  trialEnd: number | null;
}

export interface CreateCheckoutSessionBody {
  priceId: string;
  userId: string;
  returnUrl: string;
}

export interface CreatePortalSessionBody {
  customerId: string;
  returnUrl: string;
}

export type StripeSubscription = Stripe.Subscription;