import express from 'express';
import dotenv from 'dotenv';
import stripeSDK from 'stripe';
import * as models from './db/models.js';

dotenv.config();
const webhook = express.Router();
const endpointSecret = process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET;
const stripe = stripeSDK(process.env.STRIPE_SECRET_KEY);

webhook.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripeSDK.webhooks.constructEvent(req.body, signature, endpointSecret);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  let invoice;
  let subscription;
  switch (event.type) {
    case 'invoice.payment_failed':
      invoice = event.data.object;
      // Then define and call a function to handle the event invoice.payment_failed
      break;
    case 'invoice.payment_succeeded':
      invoice = event.data.object;
      // Then define and call a function to handle the event invoice.payment_succeeded
      break;
    case 'customer.subscription.created':
      subscription = event.data.object;
      const { id: subscriptionId, customer: customerId, items, metadata } = subscription;
      const { username } = metadata;
      const { id: subscriptionItemId, price, quantity } = items.data[0];
      const { id: newPriceId, product: productId } = price;

      /*
      1. query for old price ID, then archive old price ID & save new price ID
      2. save subscription details, query all other existing users on this same plan and update (on stripe) their subscriptions with new price
      */
      try {
        const processPriceId = async () => {
          const { rows: priceIdRows } = await models.getPriceId(productId);
          const { sPriceId } = priceIdRows[0];
          const archiveOldPriceId = async (sPriceId) => {
            if (sPriceId) {
              await stripe.prices.update(sPriceId, { active: false });
            }
          };

          await Promise.all([archiveOldPriceId(sPriceId), models.saveNewPriceId(newPriceId)]);
        };

        const processSubscriptions = async () => {
          const { rows } = await models.updatePriceOnJoining(productId, quantity, subscriptionId, subscriptionItemId, username);
          if (rows.length > 0) {
            const updateStripePrice = async (row) => {
              const { username: othersUsername, subscriptionId: othersSubscriptionId, subscriptionItemId: othersSubsItemId, quantity } = row;
              const subscription = await stripe.subscriptions.update(
                othersSubscriptionId,
                {
                  // metadata: { username: othersUsername },
                  items: [
                    {
                      id: othersSubsItemId,
                      price: newPriceId,
                      // quantity
                    }
                  ],
                  proration_behavior: 'none',
                }
              );
            };
            await Promise.all(rows.map((row) => updateStripePrice(row)));
          }
        }

        await Promise.all([processPriceId(), processSubscriptions()]);
      }

      catch (err) {
        console.log(err);
      };

      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send();
});

export default webhook;