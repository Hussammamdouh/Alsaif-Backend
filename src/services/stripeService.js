const stripe = require('stripe')(require('../config/env').STRIPE_SECRET_KEY);
const logger = require('../utils/logger');

/**
 * Stripe Service
 * Responsible for interacting with Stripe API
 */
class StripeService {
    /**
     * Create a checkout session for a subscription
     * @param {Object} params
     * @param {string} params.userId
     * @param {string} params.userEmail
     * @param {string} params.stripePriceId
     * @param {string} params.planId
     * @param {string} params.tier
     * @param {string} params.successUrl
     * @param {string} params.cancelUrl
     * @returns {Promise<Object>}
     */
    async createCheckoutSession({
        userId,
        userEmail,
        stripePriceId,
        planId,
        tier,
        successUrl,
        cancelUrl
    }) {
        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: stripePriceId,
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                success_url: successUrl,
                cancel_url: cancelUrl,
                customer_email: userEmail,
                metadata: {
                    userId,
                    planId,
                    tier
                },
            });

            return session;
        } catch (error) {
            logger.error('[StripeService] Failed to create checkout session:', error);
            throw error;
        }
    }

    /**
     * Construct Stripe event from webhook request
     * @param {Buffer} rawBody
     * @param {string} signature
     * @returns {Object}
     */
    constructEvent(rawBody, signature) {
        const webhookSecret = require('../config/env').STRIPE_WEBHOOK_SECRET;
        return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    }

    /**
     * Create a portal session for managing subscription
     * @param {string} customerId
     * @param {string} returnUrl
     * @returns {Promise<Object>}
     */
    async createPortalSession(customerId, returnUrl) {
        try {
            const session = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl,
            });
            return session;
        } catch (error) {
            logger.error('[StripeService] Failed to create portal session:', error);
            throw error;
        }
    }

    /**
     * Retrieve a subscription from Stripe
     * @param {string} subscriptionId
     * @returns {Promise<Object>}
     */
    async retrieveSubscription(subscriptionId) {
        try {
            return await stripe.subscriptions.retrieve(subscriptionId);
        } catch (error) {
            logger.error(`[StripeService] Failed to retrieve subscription ${subscriptionId}:`, error);
            throw error;
        }
    }
}

module.exports = new StripeService();
